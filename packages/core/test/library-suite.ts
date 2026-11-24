import { describe, expect, test } from "vitest"
import {
  defineLibrary,
  defineWidget,
  type Library,
  validateLibrary,
  view,
} from "../src"
import { buildSystemPrompt } from "../src/prompt"
import type { ChartEngine, ChartSpec, MotionAdapter, MotionKeyframes, MotionTiming } from "../src/renderer"

/** The props every renderer's surface takes, as the suite uses them. */
export interface SuiteProps {
  source: string
  streaming?: boolean
  // biome-ignore lint/suspicious/noExplicitAny: each renderer's library holds its own kind of component
  library?: Library<any>
  onWarning?: (message: string) => void
}

export interface SuiteView {
  /** The surface's root element. */
  container: HTMLElement
  /** Changes some props, as the application around the surface would. */
  update(next: Partial<SuiteProps>): Promise<unknown>
  unmount(): void | Promise<void>
}

/** How one renderer draws a surface for the suite. */
export interface SuiteHarness {
  draw(props: SuiteProps): Promise<SuiteView>
  /** Lets everything that is queued run. */
  flush(): Promise<unknown>
}

/** A stepper that keeps its own count, and reports each step. */
const Stepper = defineWidget<{ label: string; start?: number; tone?: string; onStep?: (value: number) => void; class?: string }>({
  name: "Stepper",
  description: "A counter with a button that adds one.",
  props: {
    label: { type: "string", required: true, description: "What is being counted." },
    start: { type: "number", default: 0 },
    tone: ["neutral", "accent"],
  },
  events: { step: "The count changed. `$value` is the new count." },
  children: "a note under the count",
  example: `<Stepper label="Guests" start={2} />`,
  setup: (handle) => {
    let count: number | undefined
    return (props, children) => {
      count ??= props.start ?? 0
      return view("div", { class: ["stepper", props.class].filter(Boolean).join(" "), "data-tone": props.tone }, [
        view("span", { class: "stepper-label" }, [props.label]),
        view("output", {}, [String(count)]),
        view(
          "button",
          {
            type: "button",
            on: {
              click: () => {
                count = (count ?? 0) + 1
                props.onStep?.(count)
                handle.redraw()
              },
            },
          },
          ["Add"]
        ),
        ...children,
      ])
    }
  },
})

async function click(element: Element | null | undefined, flush: () => Promise<unknown>) {
  if (!element) throw new Error("Nothing to click")
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  await flush()
}

/** A chart engine that records what it is asked to draw. */
function fakeEngine(options: Partial<ChartEngine> = {}) {
  const log: string[] = []
  const specs: ChartSpec[] = []
  let select: ((index: number) => void) | undefined
  const engine: ChartEngine = {
    name: "Fake",
    ...options,
    mount: (element, spec, context) => {
      log.push(`mount ${spec.type}`)
      specs.push(spec)
      select = context.select
      element.append(Object.assign(element.ownerDocument.createElement("canvas"), { className: "fake-chart" }))
      return {
        update: (next) => {
          log.push(`update ${next.type}`)
          specs.push(next)
        },
        destroy: () => {
          log.push("destroy")
        },
      }
    },
  }
  return { engine, log, specs, select: (index: number) => select?.(index) }
}

interface Played {
  element: Element
  keyframes: MotionKeyframes
  timing: MotionTiming
  cancelled: boolean
}

/** A motion adapter that records what it is asked to play, and ends each animation when told to. */
function fakeMotion(options: Partial<MotionAdapter> = {}) {
  const played: Played[] = []
  const ends: { entry: Played; end: () => void }[] = []
  const adapter: MotionAdapter = {
    name: "Fake",
    // Starts from the moment it is told to, as the browser's own animations do.
    startsOnPaint: true,
    ...options,
    animate: (element, keyframes, timing) => {
      const entry: Played = { element, keyframes, timing, cancelled: false }
      played.push(entry)
      return {
        finished: new Promise<void>((resolve) => ends.push({ entry, end: resolve })),
        cancel: () => {
          entry.cancelled = true
        },
      }
    },
  }
  const names = () => played.map((entry) => `${entry.timing.name}:${entry.element.localName}${entry.element.className ? `.${String(entry.element.className).split(" ").pop()}` : ""}`)
  /** Ends what is playing. What repeats never ends by itself. */
  const finish = () => {
    for (const { entry, end } of ends.splice(0)) {
      if (entry.timing.repeat) ends.push({ entry, end })
      else end()
    }
  }
  return { adapter, played, names, finish }
}

/**
 * What a library adds has to behave the same in every renderer: the same
 * tests run against each of them.
 */
export function librarySuite(harness: SuiteHarness): void {
  const { draw, flush } = harness

  describe("widgets from a library", () => {
    const library = defineLibrary({ components: [Stepper] })

    test("draws its view, with defaults for what markup left out", async () => {
      const warnings: string[] = []
      const { container } = await draw({
        source: `<Stepper label="Guests" tone="accent" class="wide" />`,
        library,
        onWarning: (message) => warnings.push(message),
      })
      const stepper = container.querySelector(".stepper") as HTMLElement
      expect(stepper.className).toBe("stepper wide")
      expect(stepper.getAttribute("data-tone")).toBe("accent")
      expect(stepper.querySelector(".stepper-label")?.textContent).toBe("Guests")
      expect(stepper.querySelector("output")?.textContent).toBe("0")
      await flush()
      expect(warnings).toEqual([])
    })

    test("keeps its own state between draws and reports events to markup", async () => {
      const { container } = await draw({
        source: `<state seen={0} />

<Stepper label="Guests" start={2} on:step={seen = $value}>
  <text class="note">so far {seen}</text>
</Stepper>`,
        library,
      })
      const output = () => container.querySelector(".stepper output")?.textContent
      expect(output()).toBe("2")
      await click(container.querySelector(".stepper button"), flush)
      await click(container.querySelector(".stepper button"), flush)
      expect(output()).toBe("4")
      // The surface drew again around the widget; the widget kept its count.
      expect(container.querySelector(".stepper .note")?.textContent).toBe("so far 4")
    })

    test("is drawn as the stream writes it, and keeps its state while the stream goes on", async () => {
      const source = `<Stepper label="Guests" start={1} />

<text class="after">Done</text>`
      const warnings: string[] = []
      const view = await draw({ source: "", streaming: true, library, onWarning: (message) => warnings.push(message) })
      const cut = source.indexOf("/>") + 2
      for (let end = 1; end <= cut; end++) await view.update({ source: source.slice(0, end) })
      expect(view.container.querySelector(".stepper output")?.textContent).toBe("1")
      await click(view.container.querySelector(".stepper button"), flush)
      for (let end = cut + 1; end <= source.length; end++) await view.update({ source: source.slice(0, end) })
      await view.update({ streaming: false })
      expect(view.container.querySelector(".stepper output")?.textContent).toBe("2")
      expect(view.container.querySelector(".after")?.textContent).toBe("Done")
      expect(warnings).toEqual([])
    })

    test("gets only the props it declared", async () => {
      const warnings: string[] = []
      const { container } = await draw({
        source: `<Stepper label="Guests" start="three" tone="loud" onclick="alert(1)" href="https://example.com" on:press={toast("x")} />

<Stepper />`,
        library,
        onWarning: (message) => warnings.push(message),
      })
      await flush()
      const [first, second] = [...container.querySelectorAll(".stepper")]
      expect(first?.querySelector("output")?.textContent).toBe("0")
      expect(first?.hasAttribute("data-tone")).toBe(false)
      expect(first?.hasAttribute("href")).toBe(false)
      expect(second?.querySelector(".stepper-label")?.textContent).toBe("")
      expect([...warnings].sort()).toEqual(
        [
          `<Stepper> doesn't have the event "press"`,
          `<Stepper> doesn't have the prop "href"`,
          `<Stepper> doesn't have the prop "onclick"`,
          `<Stepper> needs "label"`,
          `<Stepper> takes "neutral" | "accent" for "tone"`,
          `<Stepper> takes number for "start"`,
        ].sort()
      )
    })

    test("is given its element, and told when it goes", async () => {
      const log: string[] = []
      const Probe = defineWidget({
        name: "Probe",
        description: "Says when its element is on the page.",
        props: {},
        setup: (handle) => {
          const pass = handle.attach((element) => {
            log.push(`attached ${element.localName} ${element.isConnected}`)
            return () => log.push("detached")
          })
          handle.cleanup(() => log.push("cleanup"))
          return () => view("section", { pass, class: "probe" })
        },
      })
      const drawn = await draw({
        source: `<state on={true} />

<Probe show={on} />

<button class="hide" on:click={on = false}>Hide</button>`,
        library: defineLibrary({ components: [Probe] }),
      })
      await flush()
      expect(log).toEqual(["attached section true"])
      await drawn.unmount()
      await flush()
      expect(log).toContain("detached")
      expect(log).toContain("cleanup")
      expect(log.filter((entry) => entry.startsWith("attached"))).toHaveLength(1)
    })

    test("a widget that throws shows nothing and the rest of the surface stays", async () => {
      const Broken = defineWidget({
        name: "Broken",
        description: "Fails.",
        setup: () => () => {
          throw new Error("the widget broke")
        },
      })
      const warnings: string[] = []
      const { container } = await draw({
        source: `<Broken />

<text class="after">Still here</text>`,
        library: defineLibrary({ components: [Broken] }),
        onWarning: (message) => warnings.push(message),
      })
      await flush()
      expect(container.querySelector(".after")?.textContent).toBe("Still here")
      expect(warnings).toEqual(["the widget broke"])
    })

    test("a library component replaces the preset of its name", async () => {
      const Stat = defineWidget<{ label?: string; value?: unknown }>({
        name: "Stat",
        description: "The product's own figure.",
        prompt: false,
        setup: () => (props) => view("dl", { class: "own-stat" }, [view("dt", {}, [String(props.label)]), view("dd", {}, [String(props.value)])]),
      })
      const { container } = await draw({
        source: `<Stat label="Revenue" value={12} />`,
        library: defineLibrary({ components: [Stat] }),
      })
      expect(container.querySelector(".own-stat dd")?.textContent).toBe("12")
      expect(container.querySelector(".iui-stat")).toBeNull()
    })

    test("the prompt describes what the renderer draws", () => {
      expect(validateLibrary(library)).toEqual([])
      const prompt = buildSystemPrompt({ library })
      expect(prompt).toContain("### Stepper")
      expect(prompt).toContain("`label`: `string`, required. What is being counted.")
      expect(prompt).toContain("`on:step`: The count changed.")
      expect(prompt).toContain(`<Stepper label="Guests" start={2} />`)
    })
  })

  describe("a chart engine from a library", () => {
    const source = `<state picked="none" rows={[{ month: "Jan", sales: 3 }, { month: "Feb", sales: 5 }]} />

<Chart type="bar" data={rows} x="month" y="sales" height={180} on:select={picked = $value.month} />

<text class="picked">{picked}</text>

<button class="more" on:click={rows = [...rows, { month: "Mar", sales: 8 }]}>More</button>`

    test("draws the chart, draws it again when the data changes, and is told when it goes", async () => {
      const fake = fakeEngine()
      const warnings: string[] = []
      const drawn = await draw({
        source,
        library: defineLibrary({ charts: fake.engine }),
        onWarning: (message) => warnings.push(message),
      })
      await flush()
      const chart = drawn.container.querySelector(".iui-chart") as HTMLElement
      expect(chart.className).toBe("iui-el iui-chart iui-chart-engine")
      expect(chart.getAttribute("data-engine")).toBe("fake")
      expect(chart.getAttribute("data-type")).toBe("bar")
      expect(chart.getAttribute("role")).toBe("img")
      expect(chart.style.height).toBe("180px")
      expect(chart.querySelector("canvas.fake-chart")).not.toBeNull()
      expect(chart.querySelector("svg")).toBeNull()
      expect(fake.log).toEqual(["mount bar"])
      const spec = fake.specs[0] as ChartSpec
      expect(spec.labels).toEqual(["Jan", "Feb"])
      expect(spec.series.map((series) => [series.key, series.values])).toEqual([["sales", [3, 5]]])
      expect(spec.height).toBe(180)
      expect(spec.selectable).toBe(true)
      expect(spec.format(1200)).toBe("1.2K")

      fake.select(1)
      await flush()
      expect(drawn.container.querySelector(".picked")?.textContent).toBe("Feb")
      // The surface drew again, and nothing about the chart changed.
      expect(fake.log).toEqual(["mount bar"])

      await click(drawn.container.querySelector(".more"), flush)
      await flush()
      expect(fake.log).toEqual(["mount bar", "update bar"])
      expect(fake.specs.at(-1)?.labels).toEqual(["Jan", "Feb", "Mar"])
      // The engine's own nodes are still there: the renderer leaves them alone.
      expect(drawn.container.querySelector("canvas.fake-chart")).not.toBeNull()

      await drawn.unmount()
      await flush()
      expect(fake.log.at(-1)).toBe("destroy")
      expect(warnings).toEqual([])
    })

    test("a type the engine doesn't draw stays with the built-in chart", async () => {
      const fake = fakeEngine({ types: ["line"], extra: { radar: "Compares several measures of one thing." } })
      const { container } = await draw({
        source: `<Chart type="bar" data={[{ a: "x", b: 1 }]} x="a" y="b" />

<Chart type="line" data={[{ a: "x", b: 1 }, { a: "y", b: 2 }]} x="a" y="b" />

<Chart type="radar" data={[{ a: "x", b: 1 }]} x="a" y="b" />`,
        library: defineLibrary({ charts: fake.engine }),
      })
      await flush()
      const charts = [...container.querySelectorAll(".iui-chart")]
      expect(charts.map((chart) => chart.classList.contains("iui-chart-engine"))).toEqual([false, true, true])
      expect(charts[0]?.querySelector("svg")).not.toBeNull()
      expect(fake.log).toEqual(["mount line", "mount radar"])
    })

    test("an engine that arrives late, or fails, never breaks the surface", async () => {
      const late = fakeEngine()
      const mount = late.engine.mount as NonNullable<ChartEngine["mount"]>
      const slow: ChartEngine = { name: "Slow", mount: async (...args) => mount(...args) }
      const broken: ChartEngine = {
        name: "Broken",
        mount: () => {
          throw new Error("no canvas here")
        },
      }
      const warnings: string[] = []
      const chart = `<Chart type="bar" data={[{ a: "x", b: 1 }]} x="a" y="b" />

<text class="after">After</text>`
      const drawn = await draw({ source: chart, library: defineLibrary({ charts: slow }) })
      await flush()
      expect(drawn.container.querySelector("canvas.fake-chart")).not.toBeNull()
      const failed = await draw({
        source: chart,
        library: defineLibrary({ charts: broken }),
        onWarning: (message) => warnings.push(message),
      })
      await flush()
      expect(failed.container.querySelector(".after")?.textContent).toBe("After")
      expect(warnings).toEqual(["Broken could not draw the chart: no canvas here"])
    })
  })

  describe("a motion adapter from a library", () => {
    test("plays what the built-in CSS would have", async () => {
      const fake = fakeMotion()
      const { container } = await draw({
        source: `<card class="first" motion="pop">One</card>

<box class="list" stagger={50}>
  <text class="a">A</text>
  <text class="b">B</text>
  <text class="c" motion="none">C</text>
</box>

<text class="still" motion="none">Still</text>`,
        library: defineLibrary({ motion: fake.adapter }),
      })
      await flush()
      expect(container.getAttribute("data-iui-motion-engine")).toBe("fake")
      const byClass = (name: string) => fake.played.find((entry) => entry.element.classList.contains(name))
      expect(byClass("first")?.timing).toMatchObject({ name: "pop", kind: "emphasis", duration: 520, delay: 0 })
      expect(byClass("first")?.keyframes).toEqual({ opacity: [0, 1], y: [10, 0], scale: [0.98, 1] })
      expect(byClass("list")?.timing).toMatchObject({ name: "rise", kind: "enter", duration: 260 })
      expect(byClass("a")?.timing).toMatchObject({ name: "rise", delay: 0 })
      expect(byClass("b")?.timing).toMatchObject({ name: "rise", delay: 50 })
      expect(byClass("b")?.timing.bezier).toEqual([0.16, 1, 0.3, 1])
      expect(byClass("c")).toBeUndefined()
      expect(byClass("still")).toBeUndefined()
      // Each element enters once.
      expect(new Set(fake.played.map((entry) => entry.element)).size).toBe(fake.played.length)
    })

    test("plays the exit before `show` takes an element away, and the entrance when it returns", async () => {
      const fake = fakeMotion()
      const { container } = await draw({
        source: `<state open={true} />

<button class="toggle" on:click={open = !open}>Toggle</button>

<card class="panel" show={open}>Panel</card>`,
        library: defineLibrary({ motion: fake.adapter }),
      })
      await flush()
      fake.finish()
      await flush()
      const before = fake.played.length
      await click(container.querySelector(".toggle"), flush)
      const exit = fake.played.at(-1) as Played
      expect(fake.played.length).toBe(before + 1)
      expect(exit.timing).toMatchObject({ name: "leave", kind: "exit", duration: 160 })
      expect(exit.keyframes).toEqual({ opacity: [1, 0], y: [0, 6], scale: [1, 0.985] })
      // It is still on the page while it leaves.
      expect(container.querySelector(".panel")).not.toBeNull()
      fake.finish()
      await flush()
      await flush()
      expect(container.querySelector(".panel")).toBeNull()

      await click(container.querySelector(".toggle"), flush)
      await flush()
      expect(container.querySelector(".panel")).not.toBeNull()
      expect(fake.played.at(-1)?.timing).toMatchObject({ name: "rise", kind: "enter" })
    })

    test("a library made again around the same adapter plays nothing again", async () => {
      const fake = fakeMotion()
      const source = `<card class="first">One</card>`
      const view = await draw({ source, library: defineLibrary({ motion: fake.adapter }) })
      await flush()
      fake.finish()
      await flush()
      expect(fake.names()).toEqual(["rise:div.first"])
      // An application that builds its library where it renders hands over a new object each time.
      await view.update({ library: defineLibrary({ motion: fake.adapter }) })
      await flush()
      expect(fake.names()).toEqual(["rise:div.first"])
      expect(view.container.getAttribute("data-iui-motion-engine")).toBe("fake")
    })

    test("an entrance another adapter cut short is played from the start", async () => {
      const first = fakeMotion()
      const second = fakeMotion({ name: "Other" })
      const source = `<card class="first">One</card>`
      const view = await draw({ source, library: defineLibrary({ motion: first.adapter }) })
      await flush()
      // Still entering when the surface changes hands.
      await view.update({ library: defineLibrary({ motion: second.adapter }) })
      await flush()
      expect(first.played.map((entry) => entry.cancelled)).toEqual([true])
      expect(second.names()).toEqual(["rise:div.first"])
    })

    test("another adapter takes over what repeats, and brings nothing in a second time", async () => {
      const first = fakeMotion()
      const second = fakeMotion({ name: "Other" })
      const source = `<card class="first">One</card>

<badge class="live" motion="pulse">Live</badge>`
      const view = await draw({ source, library: defineLibrary({ motion: first.adapter }) })
      await flush()
      expect(first.names().sort()).toEqual(["pulse:span.live", "rise:div.first"])
      first.finish()
      await flush()
      await view.update({ library: defineLibrary({ motion: second.adapter }) })
      await flush()
      expect(view.container.getAttribute("data-iui-motion-engine")).toBe("other")
      // The first adapter let go of what it was still playing.
      expect(first.played.find((entry) => entry.timing.name === "pulse")?.cancelled).toBe(true)
      expect(second.names()).toEqual(["pulse:span.live"])
      // What arrives from now on enters with the new one.
      await view.update({ source: `${source}\n\n<card class="late">Two</card>` })
      await flush()
      expect(second.names()).toEqual(["pulse:span.live", "rise:div.late"])
    })

    test("holds what fades in out of sight until the page has painted, for an engine on the script's clock", async () => {
      const fake = fakeMotion({ startsOnPaint: false })
      const { container } = await draw({
        source: `<card class="first">One</card>

<card class="loud" motion="pulse">Two</card>`,
        library: defineLibrary({ motion: fake.adapter }),
      })
      await flush()
      const first = container.querySelector(".first") as HTMLElement
      // Its clock would have run through the work of drawing: it waits, unseen.
      expect(first.hasAttribute("data-iui-hold")).toBe(true)
      expect(fake.played.some((entry) => entry.element === first)).toBe(false)
      // What doesn't start from nothing has nothing to hide.
      expect(fake.played.map((entry) => entry.timing.name)).toEqual(["pulse"])
      await expect.poll(() => fake.played.some((entry) => entry.element === first), { timeout: 2000 }).toBe(true)
      await expect.poll(() => first.hasAttribute("data-iui-hold"), { timeout: 2000 }).toBe(false)
      expect(fake.played.filter((entry) => entry.element === first)).toHaveLength(1)
    })

    test("plays the adapter's own presets, and blocks as a stream writes them", async () => {
      const fake = fakeMotion({
        presets: {
          swing: { description: "Swings in from the left.", keyframes: { rotate: [-8, 0], opacity: [0, 1] }, duration: 400 },
        },
      })
      const library = defineLibrary({ motion: fake.adapter })
      const source = `<card class="hero" motion="swing">Hello</card>

<box class="rows">
  <text class="row">One</text>
</box>`
      const view = await draw({ source: "", streaming: true, library })
      for (const end of [10, 30, source.indexOf("</card>") + 7, source.indexOf("One") + 3, source.length]) {
        await view.update({ source: source.slice(0, end) })
        await flush()
      }
      await view.update({ streaming: false })
      await flush()
      const hero = fake.played.filter((entry) => entry.element.classList.contains("hero"))
      expect(hero).toHaveLength(1)
      expect(hero[0]?.timing).toMatchObject({ name: "swing", duration: 400 })
      expect(hero[0]?.keyframes.rotate).toEqual([-8, 0])
      // A block written while streaming fades in where it is nested.
      const row = fake.played.filter((entry) => entry.element.classList.contains("row"))
      expect(row).toHaveLength(1)
      expect(row[0]?.timing.name).toBe("fade")
      expect(buildSystemPrompt({ library })).toContain("`swing`: Swings in from the left.")
    })

    test("moves a `morph` element from where it was to where it is", async () => {
      const fake = fakeMotion()
      const measure = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const wide = this.getAttribute("data-size") === "wide"
        return (wide ? new DOMRect(100, 40, 400, 200) : new DOMRect(0, 0, 200, 100)) as DOMRect
      }
      try {
        const { container } = await draw({
          source: `<state wide={false} />

<card class="hero" morph="hero" data-size={wide ? "wide" : "small"} motion="none">Hero</card>

<button class="grow" on:click={wide = true}>Grow</button>`,
          library: defineLibrary({ motion: fake.adapter }),
        })
        await flush()
        expect(fake.played).toHaveLength(0)
        await click(container.querySelector(".grow"), flush)
        await flush()
        expect(container.querySelector(".hero")?.getAttribute("data-size")).toBe("wide")
        const travel = fake.played.find((entry) => entry.timing.kind === "layout")
        expect(travel?.element).toBe(container.querySelector(".hero"))
        expect(travel?.timing).toMatchObject({ name: "morph", duration: 320 })
        expect(travel?.keyframes).toEqual({ x: [-100, 0], y: [-40, 0], scaleX: [0.5, 1], scaleY: [0.5, 1] })
      } finally {
        Element.prototype.getBoundingClientRect = measure
      }
    })

    test("gives the surface back to CSS when the adapter is taken away", async () => {
      const fake = fakeMotion()
      const view = await draw({ source: `<card class="one">One</card>`, library: defineLibrary({ motion: fake.adapter }) })
      await flush()
      expect(view.container.hasAttribute("data-iui-motion-engine")).toBe(true)
      await view.update({ library: defineLibrary({}) })
      await flush()
      expect(view.container.hasAttribute("data-iui-motion-engine")).toBe(false)
      expect(fake.played.every((entry) => entry.cancelled)).toBe(true)
    })
  })
}
