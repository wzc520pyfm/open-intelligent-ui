import { createComponent, render } from "@solidjs/web"
import { createSignal, onCleanup } from "solid-js"
import { claimId } from "@open-intelligent-ui/core/renderer"
import { describe, expect, test, vi } from "vitest"
import { IntelligentUI, type IntelligentUIProps, preloadUiSdk } from "../src"
import { byLabel, byRole, byText, click, draw, flushPromises, h, text, type, until } from "./helpers"

/** Feeds the source a few characters at a time, as a model's reply arrives. */
async function stream(
  view: { setProps(next: { source?: string; streaming?: boolean }): Promise<void> },
  from: string,
  rest: string,
  step = 7
) {
  for (let end = step; end < rest.length; end += step) {
    await view.setProps({ source: from + rest.slice(0, end) })
  }
  await view.setProps({ source: from + rest })
}

// Solid makes each element once. These hold the renderer to the same: a
// change of state or a longer source patches what is on screen in place.
describe("what is on screen survives a change", () => {
  test("an input keeps focus and its typed text across a state change", async () => {
    const { container, handle } = await draw({
      source: `<state n={0} name="" />
<text>Count {n}</text>
<input aria-label="Free" />
<input aria-label="Bound" bind:value={name} />
<button on:click={n += 1}>More</button>
{#if n > 1}<text>Past one</text>{/if}`,
    })
    const free = byLabel<HTMLInputElement>(container, "Free")
    const bound = byLabel<HTMLInputElement>(container, "Bound")
    await type(bound, "Ada")
    free.focus()
    free.value = "typed here"
    free.setSelectionRange(2, 5)

    await click(byText(container, "More"))
    handle.setState({ n: 5 })
    await flushPromises()

    expect(text(container)).toContain("Count 5")
    expect(text(container)).toContain("Past one")
    expect(byLabel(container, "Free")).toBe(free)
    expect(byLabel(container, "Bound")).toBe(bound)
    expect(document.activeElement).toBe(free)
    expect(free.value).toBe("typed here")
    expect([free.selectionStart, free.selectionEnd]).toEqual([2, 5])
    expect(bound.value).toBe("Ada")
  })

  test("an input keeps focus and its typed text across streamed growth", async () => {
    const first = `<state name="" />
<card>
<input aria-label="Free" />
<input aria-label="Bound" bind:value={name} />
</card>
`
    const rest = `**More** arrives, with {name || "nobody"} in it.

<card><row><badge>new</badge><input aria-label="Later" /></row></card>

- one
- two
`
    const { view, container } = await draw({ source: first, streaming: true })
    const free = byLabel<HTMLInputElement>(container, "Free")
    const bound = byLabel<HTMLInputElement>(container, "Bound")
    const card = container.querySelector(".iui-card")
    await type(bound, "Ada")
    free.focus()
    free.value = "typed here"

    await stream(view, first, rest)
    await view.setProps({ streaming: false })

    expect(text(container)).toContain("More arrives, with Ada in it.")
    expect(container.querySelectorAll("li")).toHaveLength(2)
    expect(container.querySelector(".iui-error, .iui-pending")).toBeNull()
    expect(byLabel(container, "Free")).toBe(free)
    expect(byLabel(container, "Bound")).toBe(bound)
    expect(container.querySelector(".iui-card")).toBe(card)
    expect(document.activeElement).toBe(free)
    expect(free.value).toBe("typed here")
    expect(bound.value).toBe("Ada")
  })

  test("a block that grows while it streams keeps the elements it already has", async () => {
    const first = `<card>\n<input aria-label="Free" />\n`
    const rest = `<text>Second line</text>\n<row><badge>a</badge><badge>b</badge></row>\n</card>`
    const { view, container } = await draw({ source: first, streaming: true })
    const free = byLabel<HTMLInputElement>(container, "Free")
    free.focus()
    free.value = "typed here"
    await stream(view, first, rest, 3)
    expect(container.querySelectorAll(".iui-badge")).toHaveLength(2)
    expect(byLabel(container, "Free")).toBe(free)
    expect(document.activeElement).toBe(free)
    expect(free.value).toBe("typed here")
  })

  test("a UI SDK Tabs keeps its selected tab across a state change and streamed growth", async () => {
    await preloadUiSdk("Tabs", "Button")
    const first = `<state n={0} />
<Tabs defaultValue="one">
  <TabsList>
    <TabsTab value="one">One</TabsTab>
    <TabsTab value="two">Two</TabsTab>
  </TabsList>
  <TabsPanel value="one">First panel {n}</TabsPanel>
  <TabsPanel value="two">Second panel {n} <input aria-label="In panel" /></TabsPanel>
</Tabs>
<Button on:click={n += 1}>More</Button>
`
    const rest = `\nAnd then **more** text arrives.\n\n<card>Count {n}</card>\n`
    const { view, container, handle } = await draw({ source: first, streaming: true })
    const two = byText(container, "Two")
    await click(two)
    expect(two.getAttribute("aria-selected")).toBe("true")
    const inside = byLabel<HTMLInputElement>(container, "In panel")
    inside.value = "typed here"

    await click(byText(container, "More"))
    handle.setState({ n: 7 })
    await flushPromises()
    await stream(view, first, rest)
    await view.setProps({ streaming: false })

    expect(text(container)).toContain("Second panel 7")
    expect(text(container)).toContain("Count 7")
    expect(byText(container, "Two")).toBe(two)
    expect(two.getAttribute("aria-selected")).toBe("true")
    expect(byText(container, "One").getAttribute("aria-selected")).toBe("false")
    expect(byLabel(container, "In panel")).toBe(inside)
    expect(inside.value).toBe("typed here")
  })

  test("a host component runs once and keeps its own state", async () => {
    let made = 0
    let gone = 0
    const Counter = (props: { label?: string; children?: unknown }) => {
      made += 1
      onCleanup(() => (gone += 1))
      const [count, setCount] = createSignal(0)
      return h(
        "button",
        { "aria-label": "Counter", onClick: () => setCount((value) => value + 1) },
        () => props.label,
        " ",
        () => count(),
        " ",
        () => props.children
      )
    }
    const first = `<state n={0} />\n<Counter label={"at " + n}><b>kept</b></Counter>\n`
    const { view, container, handle } = await draw({
      source: first,
      streaming: true,
      components: { Counter },
    })
    const button = byLabel(container, "Counter")
    const bold = button.querySelector("b")
    await click(button)
    await click(button)
    expect(text(container)).toBe("at 0 2 kept")

    handle.setState({ n: 3 })
    await flushPromises()
    await stream(view, first, "\nThen a paragraph.\n")
    await view.setProps({ streaming: false })

    expect(byLabel(container, "Counter")).toBe(button)
    expect(button.querySelector("b")).toBe(bold)
    expect(button.textContent).toBe("at 3 2 kept")
    expect([made, gone]).toEqual([1, 0])
    view.unmount()
    expect(gone).toBe(1)
  })

  test("a keyed list moves its rows instead of drawing them again", async () => {
    const { container, handle } = await draw({
      source: `<state rows={[{ id: "a" }, { id: "b" }, { id: "c" }]} />
{#each rows as row (row.id)}<input aria-label={row.id} />{/each}`,
    })
    const inputs = ["a", "b", "c"].map((id) => byLabel<HTMLInputElement>(container, id))
    inputs.forEach((input, index) => (input.value = `typed ${index}`))

    handle.setState({ rows: [{ id: "c" }, { id: "b" }, { id: "d" }, { id: "a" }] })
    await flushPromises()

    const now = [...container.querySelectorAll("input")]
    expect(now.map((input) => input.getAttribute("aria-label"))).toEqual(["c", "b", "d", "a"])
    expect([now[3], now[1], now[0]]).toEqual(inputs)
    expect(now.map((input) => input.value)).toEqual(["typed 2", "typed 1", "", "typed 0"])
  })

  test("children drawn from a component's own state keep their elements", async () => {
    await preloadUiSdk("Collapsible")
    const { container, handle } = await draw({
      source: `<state n={0} />
<Collapsible let:state>
  <CollapsibleTrigger>Toggle</CollapsibleTrigger>
  <text>{state.open ? "open" : "closed"} at {n}</text>
  <input aria-label="Inside" />
</Collapsible>`,
    })
    const inside = byLabel<HTMLInputElement>(container, "Inside")
    inside.value = "typed here"
    expect(text(container)).toContain("closed at 0")

    await click(byText(container, "Toggle"))
    inside.focus()
    handle.setState({ n: 2 })
    await flushPromises()

    expect(text(container)).toContain("open at 2")
    expect(byLabel(container, "Inside")).toBe(inside)
    expect(inside.value).toBe("typed here")
    expect(document.activeElement).toBe(inside)
  })

  test("a component is given children only when the markup has some", async () => {
    // UI SDK's parts ask `"children" in props` to choose between their own text and the markup's.
    const Probe = (props: { label: string; children?: unknown }) =>
      h("span", { "aria-label": props.label }, () => ("children" in props ? "with" : "without"))
    const { container } = await draw({
      source: `<Probe label="a" />\n<Probe label="b">x</Probe>`,
      components: { Probe },
    })
    expect(byLabel(container, "a").textContent).toBe("without")
    expect(byLabel(container, "b").textContent).toBe("with")
  })

  test("a handler that changes stays one listener on one element", async () => {
    const { container, handle } = await draw({
      source: `<state n={0} step={1} />\n<button aria-label="Add" on:click={n += step}>{n}</button>`,
    })
    const button = byLabel(container, "Add")
    const add = vi.spyOn(button, "addEventListener")
    await click(button)
    handle.setState({ step: 10 })
    await flushPromises()
    await click(button)
    expect(byLabel(container, "Add")).toBe(button)
    expect(button.textContent).toBe("11")
    expect(add).not.toHaveBeenCalled()
  })
})

const HOSTILE = "<img id='pwn' src='x' onerror='window.hacked = true'>"

/** A host component that hands everything it is given to its element, as Solid components often do. */
const Plain = (props: object) => h("a", props, "plain")

const names = (element: Element) => [...element.attributes].map((attribute) => attribute.name).sort()

// What Solid itself does with a prop, on top of what every renderer refuses.
// `@solidjs/web` gives an element its props by name: `ref` is called with the
// element, `prop:x` sets the property `x`, `innerHTML`, `textContent` and
// `innerText` are set as properties, `on` and a capital starts a listener,
// `class` and `style` take objects, and anything else becomes an attribute.
// UI SDK's parts spread the props they don't know onto their element this
// way, so a component is a path to all of it.
describe("Solid's own ways to reach the DOM", () => {
  const draws = async (source: string) => {
    await preloadUiSdk("Button")
    const drawn = await draw({ source, components: { Plain } })
    return {
      ...drawn,
      html: () => byLabel(drawn.container, "html"),
      part: () => byLabel(drawn.container, "part"),
      host: () => byLabel(drawn.container, "host"),
    }
  }

  const everywhere = (props: string) => `<div aria-label="html" ${props}>safe</div>
<Button aria-label="part" ${props}>safe</Button>
<Plain aria-label="host" ${props} />`

  test("innerHTML, outerHTML, textContent and innerText don't rewrite an element", async () => {
    const source = `<state html={${JSON.stringify(HOSTILE)}} bag={{ innerHTML: ${JSON.stringify(HOSTILE)}, outerHTML: ${JSON.stringify(HOSTILE)}, textContent: "gone", innerText: "gone" }} />
${everywhere(`innerHTML={html} outerHTML={html} textContent="gone" innerText="gone" {...bag} bind:innerHTML={html} bind:textContent={html}`)}`
    const { container, html, part, host } = await draws(source)
    expect(container.querySelector("#pwn")).toBeNull()
    expect(html().innerHTML).toBe("safe")
    expect(part().innerHTML).toBe("safe")
    expect(host().innerHTML).toBe("plain")
    for (const element of [html(), part(), host()]) {
      expect(names(element).filter((name) => /html|text/i.test(name))).toEqual([])
    }
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("prop: can't set a DOM property", async () => {
    const source = `<state html={${JSON.stringify(HOSTILE)}} bag={{ "prop:innerHTML": ${JSON.stringify(HOSTILE)}, "prop:hidden": true, "prop:textContent": "gone", "prop:className": "pwn" }} />
${everywhere(`prop:innerHTML={html} prop:hidden prop:onclick="window.hacked = true" {...bag}`)}`
    const { container, html, part, host } = await draws(source)
    expect(container.querySelector("#pwn, .pwn")).toBeNull()
    for (const element of [html(), part(), host()]) {
      expect((element as HTMLElement).hidden).toBe(false)
      expect((element as HTMLElement).onclick).toBeNull()
      expect(names(element).filter((name) => name.includes(":"))).toEqual([])
    }
    expect(html().innerHTML).toBe("safe")
    expect(part().innerHTML).toBe("safe")
    expect(host().innerHTML).toBe("plain")
  })

  test("attr:, bool:, use: and Solid's on: spelling given as data do nothing", async () => {
    const source = `<state bag={{ "attr:onclick": "window.hacked = true", "bool:hidden": true, "use:anything": "x", "on:click": "window.hacked = true", "on:Click": ["window.hacked = true"], "oncapture:click": "window.hacked = true" }} />
${everywhere(`attr:onclick="window.hacked = true" bool:hidden use:anything="x" oncapture:click="window.hacked = true" {...bag}`)}`
    const { container, html, part, host } = await draws(source)
    for (const element of [html(), part(), host()]) {
      expect(names(element).filter((name) => name.includes(":") || name.startsWith("on"))).toEqual([])
      expect((element as HTMLElement).hidden).toBe(false)
      expect((element as HTMLElement).onclick).toBeNull()
      await click(element)
    }
    expect((window as { hacked?: boolean }).hacked).toBeUndefined()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("ref gives markup nothing, whatever it holds", async () => {
    const seen: unknown[] = []
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state bag={{ ref: "r" }} list={{ ref: ["a", ["b"]] }} />
<div aria-label="html" ref="r" {...bag} {...list}>safe</div>
<Button aria-label="part" ref="r" {...bag} {...list} bind:ref={bag}>safe</Button>
<Plain aria-label="host" ref="r" {...bag} {...list} />
<Seen aria-label="seen" ref="r" {...list} />`,
      components: {
        Plain,
        Seen: (props: { ref?: unknown }) => {
          seen.push(props.ref, "ref" in props)
          return h("span", null, "seen")
        },
      },
    })
    expect(seen).toEqual([undefined, false])
    expect(container.querySelector("[ref]")).toBeNull()
    expect(container.querySelector(".iui-error")).toBeNull()
    expect(byLabel(container, "part").textContent).toBe("safe")
  })

  test("text under an on… name is never an inline handler, however it is spelled", async () => {
    const source = `<state bag={{ onclick: "window.hacked = true", onClick: "window.hacked = true", ONCLICK: "window.hacked = true", oNcLiCk: "window.hacked = true", onmouseover: "window.hacked = true", onFocus: "window.hacked = true" }} />
${everywhere(`onclick="window.hacked = true" ONCLICK="window.hacked = true" onerror="window.hacked = true" {...bag}`)}`
    const { container, html, part, host } = await draws(source)
    for (const element of [html(), part(), host()]) {
      expect(names(element).filter((name) => name.startsWith("on"))).toEqual([])
      expect((element as HTMLElement).onclick).toBeNull()
      expect((element as HTMLElement).onmouseover).toBeNull()
      await click(element)
      element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
    }
    expect((window as { hacked?: boolean }).hacked).toBeUndefined()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a list or an object under an on… name is not taken for a handler", async () => {
    // Solid reads `[handler, data]` as a handler bound to its data, and calls it.
    const source = `<state bag={{ onClick: ["window.hacked = true", 1], onKeyDown: { handleEvent: "window.hacked = true" }, onInput: 3, onFocusIn: true }} />
${everywhere(`onClick={["alert", 1]} onPointerDown={{ handleEvent: 1 }} {...bag}`)}`
    const errors: unknown[] = []
    const fail = (event: ErrorEvent) => errors.push(event.error)
    window.addEventListener("error", fail)
    const { container, html, part, host } = await draws(source)
    for (const element of [html(), part(), host()]) {
      await click(element)
      element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
      element.dispatchEvent(new Event("pointerdown", { bubbles: true }))
      element.dispatchEvent(new Event("input", { bubbles: true }))
      expect(names(element).filter((name) => name.startsWith("on"))).toEqual([])
    }
    await flushPromises()
    window.removeEventListener("error", fail)
    expect(errors).toEqual([])
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("class takes text only, and classList is not a way in", async () => {
    const source = everywhere(
      `class={{ pwn: true }} className={["pwn"]} classList={{ pwn: true }} class:tone={true} class="named"`
    )
    const { container, html, part, host } = await draws(source)
    expect(container.querySelector(".pwn")).toBeNull()
    for (const element of [html(), part(), host()]) {
      expect(element.classList.contains("named")).toBe(true)
      expect(element.classList.contains("tone")).toBe(true)
    }
    // An unknown prop of a component reaches its element as text, as it does in React.
    expect(html().hasAttribute("classlist")).toBe(false)
    expect(part().getAttribute("classlist")).toBe("[object Object]")
  })

  test("a style reaches an element one checked property at a time", async () => {
    const source = `<state bag={{ style: "position: fixed; color: red; background: url(https://evil.test/a.png)" }} />
<div aria-label="html" style={{ fontSize: "12px", "--tone": "red", "background-color": "blue", backgroundImage: "url(https://evil.test/a.png)", position: "fixed" }} style:zIndex={3}>safe</div>
<Button aria-label="part" style={{ fontSize: "12px", "--tone": "red", "background-color": "blue", backgroundImage: "url(https://evil.test/a.png)", position: "fixed" }} style:zIndex={3}>safe</Button>
<Plain aria-label="host" style={{ fontSize: "12px", "--tone": "red", "background-color": "blue", backgroundImage: "url(https://evil.test/a.png)", position: "fixed" }} style:zIndex={3} />
<div aria-label="html text" {...bag}>safe</div>
<Button aria-label="part text" {...bag}>safe</Button>
<Plain aria-label="host text" {...bag} />`
    const { container } = await draws(source)
    for (const label of ["html", "part", "host"]) {
      const style = byLabel(container, label).style
      expect(style.fontSize).toBe("12px")
      expect(style.getPropertyValue("--tone")).toBe("red")
      expect(style.backgroundColor).toBe("blue")
      expect(style.zIndex).toBe("3")
      expect(style.position).toBe("absolute")
      expect(style.backgroundImage).toBe("")
      const written = byLabel(container, `${label} text`).style
      expect(written.color).toBe("red")
      expect(written.position).toBe("absolute")
      expect(written.cssText).not.toContain("evil.test")
    }
  })

  test("a style can't be written whole through cssText, or spelled with escapes", async () => {
    // The renderer sets a style property by its script name, and `cssText` is one.
    const style = String.raw`{{ cssText: "position: fixed; inset: 0", position: "f\\69xed", backgroundImage: "u\\72l(https://evil.test/a.png)", color: "red" }}`
    const source = `<div aria-label="html" style=${style}>safe</div>
<Button aria-label="part" style=${style}>safe</Button>
<Plain aria-label="host" style=${style} />`
    const { html, part, host } = await draws(source)
    for (const element of [html(), part(), host()]) {
      const written = (element as HTMLElement).style
      expect(written.color).toBe("red")
      expect(written.position).toBe("absolute")
      expect(written.inset).toBe("")
      expect(written.cssText).not.toContain("evil.test")
    }
  })

  test("a namespaced name is not a way around the URL check", async () => {
    const source = `<svg aria-label="html" viewBox="0 0 10 10">
  <a xlink:href="javascript:window.hacked = true" svg:href="javascript:window.hacked = true"><circle r="2" /></a>
  <use xlink:href="https://evil.test/sprite.svg#a" />
  <image xlink:href="javascript:window.hacked = true" />
</svg>
<Button aria-label="part" xlink:href="javascript:window.hacked = true" xml:base="https://evil.test/" svg:onclick="window.hacked = true">safe</Button>
<Plain aria-label="host" xlink:href="javascript:window.hacked = true" xml:base="https://evil.test/" mathml:href="javascript:window.hacked = true" />`
    const { container, part, host } = await draws(source)
    const xlink = "http://www.w3.org/1999/xlink"
    for (const element of container.querySelectorAll("svg *")) {
      expect(element.getAttribute("href")).toBeNull()
      expect(element.getAttributeNS(xlink, "href")).toBeNull()
      for (const attribute of element.attributes) {
        // A name with a prefix the renderer doesn't know is set as it is
        // written, in no namespace, where it means nothing to the browser.
        expect(attribute.namespaceURI).toBeNull()
        if (/javascript|evil/.test(attribute.value)) expect(attribute.name).toBe("svg:href")
      }
    }
    expect(names(part()).filter((name) => name.includes(":"))).toEqual([])
    expect(names(host()).filter((name) => name.includes(":"))).toEqual([])
  })

  test("children can only be what the markup holds, and text stays text", async () => {
    const source = `<state html={${JSON.stringify(HOSTILE)}} bag={{ children: ${JSON.stringify(HOSTILE)} }} />
<div aria-label="html" children={html} {...bag}>{html}</div>
<Button aria-label="part" children={html} {...bag}>{html}</Button>
<Plain aria-label="host" children={html} {...bag} />
<Shown aria-label="shown">{html}</Shown>`
    await preloadUiSdk("Button")
    const { container } = await draw({
      source,
      components: {
        Plain,
        Shown: (props: { children?: unknown }) => h("span", { "aria-label": "shown" }, () => props.children),
      },
    })
    expect(container.querySelector("#pwn")).toBeNull()
    expect(byLabel(container, "html").textContent).toBe(HOSTILE)
    expect(byLabel(container, "part").textContent).toBe(HOSTILE)
    expect(byLabel(container, "shown").textContent).toBe(HOSTILE)
    expect(byLabel(container, "host").textContent).toBe("plain")
    expect(container.querySelectorAll("[aria-label] *")).toHaveLength(0)
  })

  test("a prop a UI SDK part doesn't know becomes a plain attribute", async () => {
    const source = `<Button aria-label="part" foo={{ a: 1 }} bar={[1, 2]} data-x="1" title="t" tabIndex={3} hidden={false} inert srcdoc="<b>x</b>" formAction="javascript:window.hacked = true" is="x-pwn" href="javascript:window.hacked = true">safe</Button>`
    const { part } = await draws(source)
    expect(names(part())).toEqual([
      "aria-label",
      "bar",
      "data-slot",
      "data-x",
      "foo",
      "inert",
      "tabindex",
      "title",
      "type",
    ])
    expect(part().getAttribute("foo")).toBe("[object Object]")
    expect(part().getAttribute("bar")).toBe("1,2")
    expect(part().textContent).toBe("safe")
  })

  test("a value written back by a component can't name a property of its element", async () => {
    await preloadUiSdk("Input")
    const { container } = await draw({
      source: `<state html="" />
<Input aria-label="part" bind:value={html} bind:innerHTML={html} bind:prop:innerHTML={html} />
<text>{html}</text>`,
    })
    const input = byLabel<HTMLInputElement>(container, "part")
    await type(input, HOSTILE)
    expect(container.querySelector("#pwn")).toBeNull()
    expect(container.querySelector(".iui-text")?.textContent).toBe(HOSTILE)
    expect(input.value).toBe(HOSTILE)
    expect(byRole(container, "textbox")).toHaveLength(0)
    expect(input.children).toHaveLength(0)
  })

  test("a component the host wrote is given no way to the DOM it didn't ask for", async () => {
    const given: Record<string, unknown>[] = []
    const { container } = await draw({
      source: `<state bag={{ innerHTML: "x", "prop:innerHTML": "x", ref: "r", textContent: "x", innerText: "x", outerHTML: "x", children: "x", onClick: "x", "on:click": "x", title: "ok" }} />
<Reads label="kept" {...bag} on:pick={toast("picked")} />`,
      components: {
        Reads: (props: Record<string, unknown>) => {
          given.push({ ...props })
          return h("span", null, "reads")
        },
      },
    })
    await until(() => expect(text(container)).toBe("reads"))
    expect(Object.keys(given[0] ?? {}).sort()).toEqual(["label", "onPick", "title"])
    expect(typeof given[0]?.onPick).toBe("function")
  })
})

describe("several Solid roots on one page", () => {
  const reply = (color: string) =>
    `<style>.note { color: ${color} }</style>\n\n<div class="note">Hello</div>\n\n<Chart type="area" data={[{ x: "a", y: 1 }, { x: "b", y: 3 }]} x="x" y="y" />`
  const idOf = (container: HTMLElement) => container.getAttribute("data-iui-id") as string

  test("each surface's styles are scoped by an id no other surface has", async () => {
    const first = await draw({ source: reply("red") })
    const second = await draw({ source: reply("blue") })
    const ids = [idOf(first.container), idOf(second.container)]
    expect(ids[0]).toBeTruthy()
    expect(ids[1]).not.toBe(ids[0])
    for (const [index, { container }] of [first, second].entries()) {
      const css = [...container.querySelectorAll("style")].map((style) => style.textContent).join("\n")
      expect(css).toContain(`[data-iui-id="${ids[index]}"]`)
      expect(css).not.toContain(`[data-iui-id="${ids[1 - index]}"]`)
    }
    await until(() => expect(document.querySelectorAll("linearGradient").length).toBeGreaterThan(1))
    const gradients = [...document.querySelectorAll("linearGradient")].map((gradient) => gradient.id)
    expect(new Set(gradients).size).toBe(gradients.length)

    first.view.unmount()
    second.view.unmount()
    // Both ids are free again.
    for (const id of ids) {
      const claim = claimId(id)
      expect(claim.id).toBe(id)
      claim.release()
    }
  })

  test("an id a surface from another copy of Solid holds is not taken twice", async () => {
    // Solid numbers its ids from a counter in the module, so a second copy of
    // it on the page, in another bundle, hands out the same ones.
    const probe = await draw({ source: "Hello" })
    const [, prefix, count] = /^(\D+)(\d+)$/.exec(idOf(probe.container)) as RegExpExecArray
    probe.view.unmount()
    const next = `${prefix}${Number(count) + 1}`
    const other = claimId(next)
    expect(other.id).toBe(next)

    const { view, container } = await draw({ source: reply("red") })
    const id = idOf(container)
    expect(id).not.toBe(next)
    expect(id.startsWith(next)).toBe(true)
    const css = [...container.querySelectorAll("style")].map((style) => style.textContent).join("\n")
    expect(css).toContain(`[data-iui-id="${id}"]`)
    view.unmount()
    other.release()
  })
})

describe("props a parent keeps in signals", () => {
  test("a callback is read where it is called, without Solid's warning about an untracked read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const calls: string[] = []
    const one = '<query id="names" tool="listNames" />\n\n<text>{names.data?.[0] ?? "…"}</text>'
    const [given, setGiven] = createSignal({
      source: one,
      tools: { listNames: async () => ["Ada"], listTowns: async () => ["Turin"] },
      onTool: (event: { tool: string; status: string }) => calls.push(`${event.tool} ${event.status}`),
      onStateChange: () => calls.push("state"),
      onDiagnostics: () => calls.push("diagnostics"),
      onWarning: (message: string) => calls.push(`warning ${message}`),
    })
    // What compiled JSX hands a component for `tools={given().tools}`.
    const props = {}
    for (const name of Object.keys(given()) as (keyof ReturnType<typeof given>)[]) {
      Object.defineProperty(props, name, { enumerable: true, get: () => given()[name] })
    }
    const host = document.body.appendChild(document.createElement("div"))
    const dispose = render(() => createComponent(IntelligentUI, props as IntelligentUIProps), host)
    await until(() => expect(host.textContent).toContain("Ada"))
    expect(calls).toContain("listNames done")
    expect(calls).toContain("state")
    expect(calls).toContain("diagnostics")

    // A longer source brings a query that starts while Solid applies the change,
    // and the tools it is given are the ones the parent holds by then.
    setGiven({
      ...given(),
      source: `${one}\n\n<query id="towns" tool="listTowns" />\n\n<text>{towns.data?.[0] ?? "…"}</text>`,
      tools: { listNames: async () => ["Ada"], listTowns: async () => ["Lyon"] },
    })
    await until(() => expect(host.textContent).toContain("Lyon"))
    expect(calls).toContain("listTowns done")
    const untracked = warn.mock.calls.filter(([message]) => String(message).includes("STRICT_READ_UNTRACKED"))
    expect(untracked).toEqual([])
    dispose()
    host.remove()
    warn.mockRestore()
  })
})
