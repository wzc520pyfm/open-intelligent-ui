import { defineLibrary } from "@open-intelligent-ui/core"
import { echartsCharts, g2Charts, tooltipElement, whenSized } from "@open-intelligent-ui/core/charts"
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { draw, flushPromises } from "./helpers"

// biome-ignore lint/suspicious/noExplicitAny: options are read loosely to keep the assertions short
type Loose = any

const SALES = `<state rows={[
  { month: "Jan", web: 120, store: 80 },
  { month: "<img src=x onerror=alert(1)>", web: 150, store: 95 }
]} picked={null} />

<Chart class="sales" type="bar" data={rows} x="month" y={["web", "store"]} names={{ web: "<b>Web</b>" }} format="currency" digits={0} on:select={picked = $value.month} />

<text class="picked">{picked ?? "none"}</text>`

beforeEach(() => {
  // jsdom lays nothing out; an engine waits for an element that has a size.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(480)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(220)
})

function fakeECharts() {
  const log: string[] = []
  const options: Loose[] = []
  const settings: Loose[] = []
  const handlers: Record<string, (params: Loose) => void> = {}
  const init = (element: HTMLElement, _theme: unknown, given: Loose) => {
    log.push(`init ${given.renderer}`)
    element.append(Object.assign(document.createElement("canvas"), { className: "echarts" }))
    return {
      setOption: (option: Loose, how: Loose) => {
        options.push(option)
        settings.push(how)
      },
      resize: () => log.push("resize"),
      dispose: () => log.push("dispose"),
      on: (event: string, handler: (params: Loose) => void) => {
        handlers[event] = handler
      },
    }
  }
  return { library: { init }, log, options, settings, handlers }
}

describe("echartsCharts", () => {
  test("draws the chart from its props and the design, and loads the library once", async () => {
    const fake = fakeECharts()
    const load = vi.fn(async () => ({ default: fake.library }))
    const warnings: string[] = []
    const { container } = await draw({
      source: `${SALES}\n\n<Chart class="share" type="donut" data={rows} x="month" y="web" />`,
      library: defineLibrary({ charts: echartsCharts(load) }),
      onWarning: (message) => warnings.push(message),
    })
    await flushPromises()
    expect(warnings).toEqual([])
    expect(load).toHaveBeenCalledTimes(1)
    expect(fake.log).toEqual(["init canvas", "init canvas"])
    const host = container.querySelector(".sales") as HTMLElement
    expect(host.getAttribute("data-engine")).toBe("echarts")
    expect(host.querySelector("canvas.echarts")).not.toBeNull()

    const bar = fake.options[0]
    expect(bar.xAxis.data).toEqual(["Jan", "<img src=x onerror=alert(1)>"])
    expect(bar.series.map((series: Loose) => [series.type, series.name, series.data])).toEqual([
      ["bar", "<b>Web</b>", [120, 150]],
      ["bar", "store", [80, 95]],
    ])
    expect(bar.yAxis.axisLabel.formatter(1200)).toBe("$1,200")
    expect(bar.color).toHaveLength(2)
    const donut = fake.options[1]
    expect(donut.series[0]).toMatchObject({ type: "pie", radius: ["58%", "82%"] })
    expect(donut.series[0].data.map((item: Loose) => item.value)).toEqual([120, 150])
    // A donut has its total in the middle, as the built-in chart does; a bar chart has no title.
    expect(donut.title).toMatchObject({ text: "270", subtext: "Total", textAlign: "center" })
    expect(bar.title).toBeUndefined()
  })

  test("a tooltip is built from elements: what a model named is never HTML", async () => {
    const fake = fakeECharts()
    await draw({ source: SALES, library: defineLibrary({ charts: echartsCharts(fake.library) }) })
    await flushPromises()
    const tip = fake.options[0].tooltip.formatter([
      { axisValueLabel: "<img src=x onerror=alert(1)>", seriesName: "<b>Web</b>", value: 150, color: "#123456" },
    ]) as HTMLElement
    expect(tip).toBeInstanceOf(HTMLElement)
    expect(tip.className).toBe("iui-chart-tip")
    expect(tip.querySelector("img")).toBeNull()
    expect(tip.querySelector("strong")?.textContent).toBe("<img src=x onerror=alert(1)>")
    expect(tip.querySelector("span")?.textContent).toBe("<b>Web</b>$150")
    expect(tip.querySelectorAll("b")).toHaveLength(1)
  })

  test("a press selects the row, and new data moves the chart it already drew", async () => {
    const fake = fakeECharts()
    const { container, view } = await draw({
      source: SALES,
      library: defineLibrary({ charts: echartsCharts(fake.library) }),
    })
    await flushPromises()
    fake.handlers.click?.({ dataIndex: 0 })
    await flushPromises()
    expect(container.querySelector(".picked")?.textContent).toBe("Jan")
    // A chart whose props didn't change is not drawn again.
    expect(fake.options).toHaveLength(1)

    // The same type keeps its instance and moves to the new values.
    view.update({ source: SALES.replace("digits={0}", "digits={2}") })
    await flushPromises()
    expect(fake.log).toEqual(["init canvas"])
    expect(fake.options).toHaveLength(2)
    expect(fake.options[1].yAxis.axisLabel.formatter(1200)).toBe("$1,200.00")
    expect(fake.settings.at(-1)).toEqual({ replaceMerge: ["series"] })

    view.update({ source: SALES.replace('type="bar"', 'type="line"') })
    await flushPromises()
    expect(fake.options.at(-1).series[0].type).toBe("line")
    expect(fake.settings.at(-1)).toEqual({ notMerge: true })
    view.unmount()
    expect(fake.log).toContain("dispose")
  })

  test("a product edits the option, picks the renderer, and names the types it takes over", async () => {
    const fake = fakeECharts()
    const charts = echartsCharts(fake.library, {
      renderer: "svg",
      types: ["bar", "radar"],
      option: (option, spec) => ({ ...option, title: { text: spec.type } }),
    })
    const { container } = await draw({
      source: `${SALES}\n\n<Chart class="trend" type="line" data={rows} x="month" y="web" />`,
      library: defineLibrary({ charts }),
    })
    await flushPromises()
    expect(fake.log).toEqual(["init svg"])
    expect(fake.options[0].title).toEqual({ text: "bar" })
    // What the engine doesn't take stays with the built-in SVG.
    expect(container.querySelector(".trend")?.hasAttribute("data-engine")).toBe(false)
    expect(container.querySelector(".trend svg")).not.toBeNull()

    const prompt = buildSystemPrompt({ library: defineLibrary({ charts }) })
    expect(prompt).toContain("ECharts")
    expect(prompt).toContain("`radar`")
    expect(prompt).not.toContain("`funnel`")
  })

  test("a library that fails to load leaves a warning and the rest of the surface", async () => {
    const warnings: string[] = []
    const { container } = await draw({
      source: SALES,
      library: defineLibrary({
        charts: echartsCharts(async () => {
          throw new Error("offline")
        }),
      }),
      onWarning: (message) => warnings.push(message),
    })
    await flushPromises()
    expect(warnings.join("\n")).toContain("offline")
    expect(container.querySelector(".picked")?.textContent).toBe("none")
  })
})

function fakeG2() {
  const log: string[] = []
  const options: Loose[] = []
  const handlers: Record<string, (event: Loose) => void> = {}
  class Chart {
    constructor(given: { container: HTMLElement; autoFit: boolean }) {
      log.push(`new autoFit=${given.autoFit}`)
      given.container.append(Object.assign(document.createElement("canvas"), { className: "g2" }))
    }
    options(next: Loose) {
      options.push(next)
    }
    render() {
      log.push("render")
      return Promise.resolve()
    }
    on(event: string, handler: (event: Loose) => void) {
      handlers[event] = handler
    }
    forceFit() {
      log.push("fit")
    }
    destroy() {
      log.push("destroy")
    }
  }
  return { library: { Chart }, log, options, handlers }
}

describe("g2Charts", () => {
  test("draws the chart as one row per value, and a press selects its row", async () => {
    const fake = fakeG2()
    const warnings: string[] = []
    const { container, view } = await draw({
      source: SALES,
      library: defineLibrary({ charts: g2Charts(() => fake.library) }),
      onWarning: (message) => warnings.push(message),
    })
    await flushPromises()
    expect(warnings).toEqual([])
    expect(fake.log).toEqual(["new autoFit=true", "render"])
    expect(container.querySelector(".sales")?.getAttribute("data-engine")).toBe("antv-g2")
    const text = JSON.stringify(fake.options[0])
    expect(text).toContain('"type":"interval"')
    expect(text).toContain('"label":"Jan","series":"<b>Web</b>","value":120')

    fake.handlers["element:click"]?.({ data: { data: { index: 0 } } })
    await flushPromises()
    expect(container.querySelector(".picked")?.textContent).toBe("Jan")
    view.unmount()
    expect(fake.log.at(-1)).toBe("destroy")
  })

  test("a donut has its total in the middle, and a pie doesn't", async () => {
    const fake = fakeG2()
    await draw({
      source: `<state rows={[{ month: "Jan", web: 120 }, { month: "Feb", web: 150 }]} />

<Chart type="donut" data={rows} x="month" y="web" />

<Chart type="pie" data={rows} x="month" y="web" />`,
      library: defineLibrary({ charts: g2Charts(() => fake.library) }),
    })
    await flushPromises()
    const words = (options: Loose) =>
      options.children.filter((mark: Loose) => mark.type === "text").map((mark: Loose) => mark.style.text)
    expect(fake.options.map(words)).toEqual([["270", "Total"], []])
    expect(fake.options[0].children[0]).toMatchObject({ type: "interval", encode: { y: "value", color: "label" } })
  })

  test("its tooltip is built from elements too, and a product edits the options", async () => {
    const fake = fakeG2()
    await draw({
      source: SALES,
      library: defineLibrary({
        charts: g2Charts(fake.library, { options: (built) => ({ ...built, theme: "classicDark" }) }),
      }),
    })
    await flushPromises()
    const built = fake.options[0]
    expect(built.theme).toBe("classicDark")
    const tip = built.interaction.tooltip.render(null, {
      title: "<script>alert(1)</script>",
      items: [{ name: "<i>Web</i>", value: "$150", color: "red" }],
    }) as HTMLElement
    expect(tip.querySelector("script")).toBeNull()
    expect(tip.querySelector("strong")?.textContent).toBe("<script>alert(1)</script>")
    expect(tip.querySelector("span")?.textContent).toBe("<i>Web</i>$150")
  })
})

describe("what the adapters share", () => {
  test("tooltipElement writes text, with a swatch only for a color", () => {
    const tip = tooltipElement(document, undefined, [{ name: "<u>A</u>", value: "1" }])
    expect(tip.innerHTML).toBe("<span>&lt;u&gt;A&lt;/u&gt;<b>1</b></span>")
  })

  test("whenSized waits for an element to have a size, then reports each change", () => {
    vi.restoreAllMocks()
    let observed: (() => void) | undefined
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed = callback
        }
        observe() {}
        disconnect() {
          observed = undefined
        }
      }
    )
    try {
      const element = document.createElement("div")
      const size = { width: 0 }
      Object.defineProperty(element, "clientWidth", { get: () => size.width })
      Object.defineProperty(element, "clientHeight", { get: () => size.width })
      const log: string[] = []
      const stop = whenSized(element, () => log.push("start"), () => log.push("resize"))
      expect(log).toEqual([])
      size.width = 300
      observed?.()
      observed?.()
      expect(log).toEqual(["start", "resize"])
      stop()
      expect(observed).toBeUndefined()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
