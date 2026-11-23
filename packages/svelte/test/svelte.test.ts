import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { mount, unmount } from "svelte"
import { describe, expect, test, vi } from "vitest"
import { preloadUiSdk } from "../src"
import { UI_SDK_PROPS } from "../src/registry/ui-sdk.generated"
import { held } from "../src/render/held"
import Nodes from "../src/render/Nodes.svelte"
import { componentProps, cssText, nativeProps, PROPERTY_SINKS } from "../src/render/props"
import Counter from "./fixtures/Counter.svelte"
import Dump, { dumped } from "./fixtures/Dump.svelte"
import PlainLink from "./fixtures/PlainLink.svelte"
import Rating from "./fixtures/Rating.svelte"
import Stepper from "./fixtures/Stepper.svelte"
import { byLabel, byRole, byText, click, draw, flushPromises, text, type, until } from "./helpers.svelte"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/** Draws with React, lets `use` look at and operate what it drew, and takes it down again. */
async function withReact<T>(
  props: Record<string, unknown>,
  use: (container: HTMLElement, settle: () => Promise<void>) => T | Promise<T>
): Promise<T> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const host = document.body.appendChild(document.createElement("div"))
  const root = createRoot(host)
  try {
    await act(async () => root.render(createElement(ReactUI, props as never)))
    return await use(host.firstElementChild as HTMLElement, () => act(async () => {}))
  } finally {
    await act(async () => root.unmount())
    host.remove()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
}

/** What an element carries, by name. */
const attributes = (element: Element) =>
  Object.fromEntries([...element.attributes].map(({ name, value }) => [name, value]))

const tabs = `<Tabs defaultValue="plan">
  <TabsList aria-label="Sections">
    <TabsTab value="plan">Plan</TabsTab>
    <TabsTab value="cost">Cost</TabsTab>
  </TabsList>
  <TabsPanel value="plan">The plan</TabsPanel>
  <TabsPanel value="cost">The cost</TabsPanel>
</Tabs>`

describe("what is on screen is kept", () => {
  test("an input keeps its focus and what was typed when state changes", async () => {
    const { container } = await draw({
      source: `<state n={0} name="Ada" open={true} />
<card>
  {#if open}<row><input aria-label="Free" /><input aria-label="Name" bind:value={name} /></row>{/if}
</card>
<button on:click={n += 1}>Add</button>
<text>{n} {name}</text>`,
    })
    const free = byLabel<HTMLInputElement>(container, "Free")
    const name = byLabel<HTMLInputElement>(container, "Name")
    free.value = "typed, and in no state"
    free.focus()
    free.setSelectionRange(3, 5)
    await click(byText(container, "Add"))
    await type(name, "Grace")
    expect(text(container)).toBe("Add1 Grace")
    expect(byLabel(container, "Free")).toBe(free)
    expect(byLabel(container, "Name")).toBe(name)
    expect(document.activeElement).toBe(free)
    expect(free.value).toBe("typed, and in no state")
    expect([free.selectionStart, free.selectionEnd]).toEqual([3, 5])
  })

  test("an input keeps its focus and what was typed while the source streams in", async () => {
    const source = `<state name="" />
<card>
  <input aria-label="Free" />
  <input aria-label="Name" bind:value={name} />
</card>

Hello **{name}**, here is a table:

<row gap="2"><badge>one</badge><badge>two</badge></row>

${tabs}`
    const start = source.indexOf("Hello")
    const { view, container } = await draw({ source: source.slice(0, start), streaming: true })
    const free = byLabel<HTMLInputElement>(container, "Free")
    const name = byLabel<HTMLInputElement>(container, "Name")
    free.value = "typed"
    await type(name, "Ada")
    name.focus()
    for (let end = start + 1; end <= source.length; end += 7) {
      await view.setProps({ source: source.slice(0, end) })
      expect(byLabel(container, "Free")).toBe(free)
      expect(byLabel(container, "Name")).toBe(name)
      expect(document.activeElement).toBe(name)
    }
    await view.setProps({ source, streaming: false })
    expect(byLabel(container, "Free")).toBe(free)
    expect(document.activeElement).toBe(name)
    expect(free.value).toBe("typed")
    expect(name.value).toBe("Ada")
    expect(text(container)).toContain("Hello Ada, here is a table:")
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a UI SDK Tabs keeps its selected tab", async () => {
    await preloadUiSdk("Tabs")
    const source = `<state n={0} />
${tabs}
<button on:click={n += 1}>Add</button>
<text>{n}</text>`
    const { view, container } = await draw({ source, streaming: true })
    const cost = byRole(container, "tab", "Cost")[0] as HTMLElement
    const list = container.querySelector('[data-slot="tabs-list"]')
    await click(cost)
    expect(cost.hasAttribute("data-selected")).toBe(true)
    cost.focus()

    await click(byText(container, "Add"))
    expect(text(container)).toContain("Add1")
    await view.setProps({ source: `${source}\n\nAnd **more**` })
    await view.setProps({ source: `${source}\n\nAnd **more** text`, streaming: false })

    expect(byRole(container, "tab", "Cost")[0]).toBe(cost)
    expect(container.querySelector('[data-slot="tabs-list"]')).toBe(list)
    expect(cost.hasAttribute("data-selected")).toBe(true)
    expect(document.activeElement).toBe(cost)
    expect(text(container)).toContain("The cost")
    expect(text(container)).not.toContain("The plan")
  })

  test("a component of the host's keeps its own state", async () => {
    const source = `<state n={0} />
<Counter label="Clicks" />
<button on:click={n += 1}>Add</button>`
    const { view, container } = await draw({ source, components: { Counter }, streaming: true })
    await click(byText(container, "Clicks 0"))
    await click(byText(container, "Add"))
    await view.setProps({ source: `${source}\n<text>{n}</text>` })
    expect(text(container)).toBe("Clicks 1Add1")
  })

  test("rows are kept by their key when a list is put in another order", async () => {
    const { container } = await draw({
      source: `<state rows={[{ id: "a" }, { id: "b" }, { id: "c" }]} />
{#each rows as row (row.id)}<input aria-label={row.id} />{/each}
<button on:click={rows = [rows[2], rows[0], rows[1]]}>Turn</button>`,
    })
    const before = ["a", "b", "c"].map((id) => byLabel<HTMLInputElement>(container, id))
    before.forEach((input, index) => {
      input.value = `typed ${index}`
    })
    await click(byText(container, "Turn"))
    const after = [...container.querySelectorAll("input")]
    expect(after.map((input) => input.getAttribute("aria-label"))).toEqual(["c", "a", "b"])
    expect(after).toEqual([before[2], before[0], before[1]])
    expect(after.map((input) => input.value)).toEqual(["typed 2", "typed 0", "typed 1"])
  })

  test("what the reader opened or scrolled stays as they left it", async () => {
    const { container } = await draw({
      source: `<state n={0} />
<details><summary>More</summary>Hidden</details>
<box aria-label="Pane" style="height: 40px; overflow: auto"><text>{n}</text></box>
<button on:click={n += 1}>Add</button>`,
    })
    const details = container.querySelector("details") as HTMLDetailsElement
    const pane = byLabel(container, "Pane")
    details.open = true
    pane.scrollTop = 30
    await click(byText(container, "Add"))
    expect(container.querySelector("details")).toBe(details)
    expect(details.open).toBe(true)
    expect(byLabel(container, "Pane")).toBe(pane)
    expect(pane.scrollTop).toBe(30)
    expect(pane.textContent).toBe("1")
  })
})

describe("binding", () => {
  test("bind: writes state when a $bindable prop is assigned", async () => {
    const { container } = await draw({
      source: `<state n={2} />\n<Stepper bind:value={n} />\n<button on:click={n = 10}>Ten</button>\n<text>n is {n}</text>`,
      components: { Stepper },
    })
    await click(byText(container, "Step 2"))
    await click(byText(container, "Step 3"))
    expect(text(container)).toBe("Step 4Tenn is 4")
    await click(byText(container, "Ten"))
    expect(text(container)).toBe("Step 10Tenn is 10")
  })

  test("bind: works with a component that reports a change through a callback", async () => {
    const { container } = await draw({
      source: `<state stars={1} />\n<Rating bind:value={stars} />\n<text>{stars} stars</text>`,
      components: { Rating },
    })
    await click(byText(container, "Rated 1"))
    expect(text(container)).toBe("Rated 22 stars")
  })

  test("without bind: a $bindable prop is the component's own to change", async () => {
    const { container } = await draw({
      source: `<state n={2} />\n<Stepper value={n} />\n<text>n is {n}</text>`,
      components: { Stepper },
    })
    await click(byText(container, "Step 2"))
    expect(text(container)).toBe("Step 3n is 2")
  })

  // UI SDK's Svelte components keep a value they were given without
  // `bind:` as their own once the reader changes it. In React such a value
  // is held by whoever gave it, and so it is here.
  test("a value written without bind: is held, as it is in React", async () => {
    await Promise.all([preloadReact(), preloadUiSdk()])
    const source = `<state tab="plan" n={0} on={false} word="a" pick="x" />
<Switch aria-label="Held" checked={true}><SwitchThumb /></Switch>
<Switch aria-label="Free" defaultChecked={true}><SwitchThumb /></Switch>
<Switch aria-label="Counted" checked={true} on:checkedChange={n += 1}><SwitchThumb /></Switch>
<Switch aria-label="Followed" checked={on} on:checkedChange={v => on = v}><SwitchThumb /></Switch>
<Checkbox aria-label="Box" checked={false}><CheckboxIndicator /></Checkbox>
${tabs.replace('defaultValue="plan"', "value={tab}")}
<Tabs value={pick} on:valueChange={v => pick = v}><TabsList aria-label="Picks"><TabsTab value="x">X</TabsTab><TabsTab value="y">Y</TabsTab></TabsList></Tabs>
<Input aria-label="Fixed" value="fixed" />
<Input aria-label="Word" value={word} on:valueChange={v => word = v} />
<Accordion value={["a"]}>
  <AccordionItem value="a"><AccordionTrigger>A</AccordionTrigger><AccordionContent>a</AccordionContent></AccordionItem>
  <AccordionItem value="b"><AccordionTrigger>B</AccordionTrigger><AccordionContent>b</AccordionContent></AccordionItem>
</Accordion>
<text>n {n}, {on ? "on" : "off"}, {word}, {pick}</text>`

    const read = (container: HTMLElement) => ({
      switches: ["Held", "Free", "Counted", "Followed", "Box"].map((label) =>
        byLabel(container, label).getAttribute("aria-checked")
      ),
      tabs: byRole(container, "tab").map((tab) => tab.hasAttribute("data-selected")),
      inputs: ["Fixed", "Word"].map((label) => byLabel<HTMLInputElement>(container, label).value),
      open: [...container.querySelectorAll('[data-slot="accordion-trigger"]')].map((trigger) =>
        trigger.getAttribute("aria-expanded")
      ),
      state: byText(container, /^n \d/).textContent,
    })
    const operate = async (container: HTMLElement, settle: () => Promise<void>) => {
      const before = read(container)
      const press = async (element: Element | undefined) => {
        element?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
        await settle()
      }
      const write = async (label: string, value: string) => {
        const input = byLabel<HTMLInputElement>(container, label)
        // React only hears of a value set through the element's own setter.
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value)
        input.dispatchEvent(new Event("input", { bubbles: true }))
        await settle()
      }
      for (const label of ["Held", "Free", "Counted", "Followed", "Box"]) await press(byLabel(container, label))
      await press(byRole(container, "tab", "Cost")[0])
      await press(byRole(container, "tab", "Y")[0])
      await write("Fixed", "typed")
      await write("Word", "abc")
      for (const trigger of container.querySelectorAll('[data-slot="accordion-trigger"]')) await press(trigger)
      return { before, after: read(container) }
    }

    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const react = await withReact({ source }, operate)
    errors.mockRestore()
    const { container } = await draw({ source })
    const svelte = await operate(container, flushPromises)

    expect(svelte).toEqual(react)
    expect(svelte.after).toEqual({
      switches: ["true", "false", "true", "true", "false"],
      tabs: [true, false, false, true],
      inputs: ["fixed", "abc"],
      open: ["true", "false"],
      state: "n 1, on, abc, y",
    })
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a field's value written without bind: is held too, as it is in React", async () => {
    const source = `<state n={0} word="w" q={5} />
<input id="plain" value="fixed" />
<textarea id="area" value="fixed"></textarea>
<input id="box" type="checkbox" checked />
<input id="one" type="radio" name="pick" checked={true} />
<input id="two" type="radio" name="pick" checked={false} />
<select id="select" value="b"><option value="a">A</option><option value="b">B</option></select>
<input id="counted" value={"n" + n} on:input={n += 1} />
<input id="set" value={word} on:input={word = "set"} />
<input id="refused" value={word} on:input={n = n} />
<input id="free" defaultvalue="start" />
<input id="number" type="number" bind:value={q} />
<text>{n} {word} {q}</text>`

    const operate = async (container: HTMLElement, settle: () => Promise<void>) => {
      const find = <T extends Element>(id: string) => container.querySelector(`#${id}`) as T
      const write = async (id: string, value: string) => {
        const field = find<HTMLInputElement>(id)
        // React only hears of a value set through the element's own setter.
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set?.call(field, value)
        field.dispatchEvent(new Event("input", { bubbles: true }))
        await settle()
      }
      await write("plain", "typed")
      await write("area", "typed")
      for (const id of ["box", "two"]) {
        find<HTMLInputElement>(id).click()
        await settle()
      }
      const select = find<HTMLSelectElement>("select")
      select.selectedIndex = 0
      select.dispatchEvent(new Event("change", { bubbles: true }))
      await settle()
      for (const id of ["counted", "set", "refused", "free"]) await write(id, "typed")
      await write("number", "7.0")
      return {
        values: ["plain", "area", "select", "counted", "set", "refused", "free", "number"].map(
          (id) => find<HTMLInputElement>(id).value
        ),
        checked: ["box", "one", "two"].map((id) => find<HTMLInputElement>(id).checked),
        state: container.querySelector(".iui-text")?.textContent,
      }
    }

    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const react = await withReact({ source }, operate)
    errors.mockRestore()
    const { container } = await draw({ source })
    const svelte = await operate(container, flushPromises)

    expect(svelte).toEqual(react)
    expect(svelte).toEqual({
      values: ["fixed", "fixed", "b", "n1", "set", "set", "typed", "7.0"],
      checked: [true, true, false],
      state: "1 set 7",
    })
  })

  test("a held value follows state", async () => {
    await preloadUiSdk("Tabs")
    const { container } = await draw({
      source: `<state tab="plan" />
${tabs.replace('defaultValue="plan"', "value={tab}")}
<button on:click={tab = "cost"}>Go</button>`,
    })
    await click(byText(container, "Go"))
    await until(() => expect(byRole(container, "tab", "Cost")[0]?.hasAttribute("data-selected")).toBe(true))
    expect(text(container)).toContain("The cost")
  })
})

describe("values of every type", () => {
  const values = `true, false, 0, 1, 2.5, "", "x", null, undefined, [], ["a", "b"], { a: 1 }, NaN`
  const names = [
    "title",
    "hidden",
    "tabindex",
    "disabled",
    "checked",
    "readonly",
    "required",
    "multiple",
    "open",
    "spellcheck",
    "value",
    "placeholder",
    "width",
    "colspan",
    "start",
    "reversed",
    "aria-hidden",
    "aria-label",
    "data-n",
    "id",
    "name",
    "lang",
    "role",
    "min",
    "rows",
    "for",
    "label",
    "wrap",
    "inputmode",
    "autocomplete",
    "loading",
    "datetime",
    "cite",
    "scope",
    "span",
    "headers",
    "low",
    "pattern",
    "maxlength",
    "type",
    "selected",
    "defaultvalue",
    "defaultchecked",
  ]
  const tags = ["div", "input", "textarea", "button", "td", "ol", "li", "details", "option", "progress", "meter", "img", "a"]

  test("land on an element where React puts them", async () => {
    const source = `<state values={[${values}]} />
{#each values as value, i}
${tags
  .map((tag) =>
    ["input", "img"].includes(tag)
      ? names.map((name) => `<${tag} data-case="${tag} ${name} {i}" ${name}={value} />`).join("\n")
      : names.map((name) => `<${tag} data-case="${tag} ${name} {i}" ${name}={value}></${tag}>`).join("\n")
  )
  .join("\n")}
{/each}`
    const read = (container: HTMLElement) => {
      const found: Record<string, unknown> = {}
      for (const element of container.querySelectorAll("[data-case]")) {
        const { "data-case": name, ...rest } = attributes(element)
        const control = element as HTMLInputElement
        // React keeps a control's value in an attribute as well. Where it sits is its own business.
        if (element instanceof HTMLInputElement) {
          delete rest.value
          delete rest.checked
        }
        found[name as string] = {
          ...rest,
          ...("value" in control ? { ".value": control.value } : {}),
          ...("checked" in control ? { ".checked": control.checked } : {}),
          ...("disabled" in control ? { ".disabled": control.disabled } : {}),
          ...("open" in control ? { ".open": (control as unknown as HTMLDetailsElement).open } : {}),
        }
      }
      return found
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const react = await withReact({ source }, read)
    errors.mockRestore()
    const { container } = await draw({ source })
    const svelte = read(container)
    expect(container.querySelector(".iui-error")).toBeNull()
    expect(Object.keys(react).length).toBeGreaterThan(5000)
    expect(Object.keys(svelte)).toEqual(Object.keys(react))
    const different = Object.keys(react).filter(
      (name) => JSON.stringify(react[name]) !== JSON.stringify(svelte[name])
    )
    expect(different.map((name) => [name, react[name], svelte[name]])).toEqual([])
  }, 60_000)

  test("pick the option of a select that React picks", async () => {
    const options = `<option value="s">S</option><option value="m">M</option><option value="l">L</option>`
    const source = `<state size="m" none={null} />
<select aria-label="value" value="m">${options}</select>
<select aria-label="state" value={size}>${options}</select>
<select aria-label="default" defaultvalue="l">${options}</select>
<select aria-label="option"><option value="s">S</option><option value="m" selected>M</option></select>
<select aria-label="second" ><option value="s">S</option><option value="m" selected={size == "m"}>M</option></select>
<select aria-label="nothing" value={none}>${options}</select>
<select aria-label="missing" value="xl">${options}</select>
<select aria-label="many" multiple value={["s", "l"]}>${options}</select>
<button on:click={size = "l"}>Large</button>`
    const read = (container: HTMLElement) =>
      [...container.querySelectorAll("select")].map((select) => [
        select.getAttribute("aria-label"),
        select.value,
        [...select.selectedOptions].map((option) => option.value),
        select.multiple,
      ])
    const operate = async (container: HTMLElement, settle: () => Promise<void>) => {
      const before = read(container)
      byText(container, "Large").dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await settle()
      return { before, after: read(container) }
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const react = await withReact({ source }, operate)
    errors.mockRestore()
    const { container } = await draw({ source })
    expect(await operate(container, flushPromises)).toEqual(react)
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("leave what the reader picked in a select where React leaves it", async () => {
    const options = `<option value="s">S</option><option value="m">M</option><option value="l">L</option>`
    const source = `<state size="m" n={0} />
<select aria-label="value" value="m">${options}</select>
<select aria-label="bound" bind:value={size}>${options}</select>
<select aria-label="default" defaultvalue="l">${options}</select>
<select aria-label="option"><option value="s">S</option><option value="m" selected>M</option></select>
<select aria-label="free">${options}</select>
<select aria-label="many" multiple value={["s", "l"]}>${options}</select>
<select aria-label="many default" multiple defaultvalue={["s", "l"]}>${options}</select>
<button on:click={n += 1}>Again</button>
<text>{size} {n}</text>`
    const read = (container: HTMLElement) =>
      [...container.querySelectorAll("select")].map((select) => [
        select.getAttribute("aria-label"),
        [...select.selectedOptions].map((option) => option.value),
      ])
    const marked = (container: HTMLElement) =>
      [...container.querySelectorAll("select")].map((select) =>
        [...select.options].map((option) => option.hasAttribute("selected"))
      )
    const operate = async (container: HTMLElement, settle: () => Promise<void>) => {
      const attributes = marked(container)
      for (const select of container.querySelectorAll("select")) {
        for (const option of select.options) option.selected = option.value === "s"
        select.dispatchEvent(new Event("input", { bubbles: true }))
        select.dispatchEvent(new Event("change", { bubbles: true }))
        await settle()
      }
      const picked = read(container)
      byText(container, "Again").dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await settle()
      return {
        attributes,
        picked,
        after: read(container),
        attributesAfter: marked(container),
        state: container.querySelector(".iui-text")?.textContent,
      }
    }
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const react = await withReact({ source }, operate)
    errors.mockRestore()
    const { container } = await draw({ source })
    const svelte = await operate(container, flushPromises)
    expect(svelte).toEqual(react)
    expect(svelte.after).toEqual([
      ["value", ["m"]],
      ["bound", ["s"]],
      ["default", ["s"]],
      ["option", ["s"]],
      ["free", ["s"]],
      ["many", ["s", "l"]],
      ["many default", ["s"]],
    ])
    expect(svelte.state).toBe("s 1")
  })
})

/** Draws nodes as the renderer draws them, without the shared layer in front. */
function drawNodes(nodes: unknown) {
  const target = document.body.appendChild(document.createElement("div"))
  const drawn = mount(Nodes, { target, props: { nodes } })
  return {
    target,
    remove: () => {
      void unmount(drawn)
      target.remove()
    },
  }
}

/** Every file of the renderer, as written. */
const sources = import.meta.glob<string>("../src/**/*.{ts,svelte}", {
  query: "?raw",
  import: "default",
  eager: true,
})

// What Svelte does with a value depends on its type, its name and the
// element it lands on. Each test here is one way markup could use that,
// whether or not it turned out to be open.
describe("safety: Svelte's own channels", () => {
  test("nothing in the renderer writes HTML", () => {
    const files = Object.entries(sources).filter(([file]) => !file.endsWith(".generated.ts"))
    expect(files.length).toBeGreaterThan(20)
    expect(files.some(([file]) => file.endsWith("Nodes.svelte"))).toBe(true)
    for (const [file, code] of files) {
      expect(code, file).not.toMatch(/\{@html|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/)
      // No element is handed to an action or a transition, which a spread could name.
      if (file.endsWith(".svelte")) expect(code, file).not.toMatch(/\s(use|transition|in|out|animate):\w/)
    }
  })

  test("an element is given text and listeners, never a value for a DOM property", () => {
    const listener = () => {}
    const given = nativeProps(
      {
        href: "https://example.com/a",
        hostname: ["evil.test"],
        protocol: { toString: () => "javascript" },
        text: ["gone"],
        innerText: 5,
        innerHTML: ["<img id=pwn>"],
        textContent: 1,
        tabindex: 3,
        title: { a: 1 },
        files: [1],
        srcObject: {},
        popoverTargetElement: {},
        style: { color: "red" },
        onclick: listener,
        onClick: listener,
        ONCLICK: "alert(1)",
        onerror: "alert(1)",
        OnLoad: "alert(1)",
        format: listener,
        mark: Symbol("x"),
        nothing: null,
        missing: undefined,
      },
      "a"
    )
    expect(given).toEqual({
      href: "https://example.com/a",
      hostname: "evil.test",
      protocol: "javascript",
      text: "gone",
      innerText: "5",
      innerHTML: "<img id=pwn>",
      textContent: "1",
      tabindex: "3",
      title: "[object Object]",
      files: "1",
      srcObject: "[object Object]",
      popoverTargetElement: "[object Object]",
      style: "color: red;",
      onclick: listener,
    })
    for (const [name, value] of Object.entries(given)) {
      if (name !== "onclick") expect(typeof value, name).toBe("string")
    }
    expect(Object.getOwnPropertySymbols(nativeProps({ [Symbol("@attach")]: listener }))).toEqual([])

    // Drawn as they are, they are attributes with no meaning: the link and
    // its text are what they were.
    const { target, remove } = drawNodes([
      { kind: "element", tag: "a", key: "a", props: given, children: ["kept"] },
    ])
    const link = target.querySelector("a") as HTMLAnchorElement
    expect(link.href).toBe("https://example.com/a")
    expect(link.textContent).toBe("kept")
    expect(target.querySelector("#pwn")).toBeNull()
    expect(link.getAttribute("onerror")).toBeNull()
    remove()
  })

  test("holding a field adds listeners and attachments of the renderer's own, and nothing else", async () => {
    const given = nativeProps({ type: "number", value: ["7"], checked: "yes", name: "n", oninput: () => {} }, "input")
    const out = held("input", () => given)
    expect(Object.keys(out).sort()).toEqual(["checked", "name", "onchange", "oninput", "type"])
    expect(out.checked).toBe(true)
    // A number field's value is set by the renderer, which compares numbers.
    const attached = Object.getOwnPropertySymbols(out)
    expect(attached).toHaveLength(1)
    expect(attached.every((key) => typeof out[key] === "function")).toBe(true)
    // What isn't a field is passed on as it was given.
    const plain = nativeProps({ value: "x", checked: true }, "div")
    expect(held("div", () => plain)).toBe(plain)
    const free = nativeProps({ name: "n" }, "input")
    expect(held("input", () => free)).toBe(free)

    // A handler that throws doesn't stop the field from being put back.
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})
    const { container } = await draw({
      source: `<input aria-label="Field" value="fixed" on:input={missing.deep.value} />`,
    })
    const field = byLabel<HTMLInputElement>(container, "Field")
    await type(field, "typed")
    expect(field.value).toBe("fixed")
    errors.mockRestore()
  })

  test("a value that isn't text reaches an element as text", async () => {
    const { container } = await draw({
      source: `<state list={["evil.test"]} n={5} bag={{ hostname: ["evil.test"], text: ["gone"], innerText: 1, title: ["a", "b"], tabindex: 2, hidden: 0 }} />
<a aria-label="Link" href="https://example.com/a" hostname={list} host={list} text={list} innerText={n} title={list} lang={n} {...bag}>kept</a>
<svg aria-label="Drawing" viewBox="0 0 10 10" innerHTML={list} textContent={list} {...bag}><circle r={n} cx={[1]} tabindex={list} /></svg>`,
    })
    const link = byLabel<HTMLAnchorElement>(container, "Link")
    expect(link.href).toBe("https://example.com/a")
    expect(link.textContent).toBe("kept")
    expect(attributes(link)).toEqual({
      "aria-label": "Link",
      href: "https://example.com/a",
      target: "_blank",
      rel: "noopener noreferrer",
      title: "a,b",
      lang: "5",
      tabindex: "2",
    })
    const drawing = byLabel(container, "Drawing")
    expect(drawing.querySelector("circle")).not.toBeNull()
    expect(drawing.querySelector("circle")?.getAttribute("r")).toBe("5")
    expect(drawing.textContent).toBe("")
  })

  test("a handler is a listener, never the text of an attribute, in any spelling", async () => {
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state code="window.pwned = true" bag={{ onclick: "window.pwned = true", ONCLICK: "window.pwned = true", OnClick: "window.pwned = true", onClick: "window.pwned = true" }} />
<div aria-label="Div" ONCLICK={code} OnClick="window.pwned = true" onclick={code} {...bag}>div</div>
<Button aria-label="Part" ONCLICK={code} OnClick="window.pwned = true" onclick={code} {...bag}>part</Button>
<Plain aria-label="Host" ONCLICK={code} OnClick="window.pwned = true" onclick={code} {...bag} />
<card aria-label="Card" ONCLICK={code} onclick={code} {...bag}>card</card>
<svg aria-label="Svg" ONCLICK={code} onclick={code} {...bag}><circle r="2" ONLOAD={code} onload={code} {...bag} /></svg>`,
      components: { Plain: PlainLink },
    })
    for (const element of container.querySelectorAll("*")) {
      const names = [...element.attributes].map((attribute) => attribute.name.toLowerCase())
      expect(names.filter((name) => name.startsWith("on"))).toEqual([])
      ;(element as HTMLElement).click?.()
    }
    await flushPromises()
    expect((window as { pwned?: boolean }).pwned).toBeUndefined()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a style value can't start a declaration of its own", async () => {
    expect(cssText({ color: "red", paddingTop: 4, "--iui-tone": "var(--a, b)" })).toBe(
      "color: red; padding-top: 4; --iui-tone: var(--a, b);"
    )
    for (const value of [
      "red; position: fixed",
      "red;position:fixed",
      "red } body { display: none",
      "red /* ; */",
      'url("a;b") ; position: fixed',
      "red) ; position: fixed",
      "red\\",
      '"unclosed',
      "calc(1px",
    ]) {
      expect(cssText({ color: value }), value).toBeUndefined()
    }
    // What is inside a string or brackets is part of the one value.
    expect(cssText({ content: '"a;b"', width: "calc(1px + (2px * 3))" })).toBe(
      'content: "a;b"; width: calc(1px + (2px * 3));'
    )
    expect(cssText({ "color; position": "fixed", "": "x", "-": "x" })).toBeUndefined()

    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state take="red; position: fixed; inset: 0" css={{ color: "red; position: fixed; inset: 0", "--x": "1; position: fixed" }} />
<div aria-label="One" style:color={take} style:background="blue">one</div>
<div aria-label="Two" style={css}>two</div>
<card aria-label="Three" style:color={take} style={css}>three</card>
<Button aria-label="Four" style:color={take} style={css}>four</Button>
<Plain aria-label="Five" style:color={take} style={css} />`,
      components: { Plain: PlainLink },
    })
    for (const label of ["One", "Two", "Three", "Four", "Five"]) {
      const element = byLabel(container, label)
      expect(element.style.position, label).toBe("")
      expect(element.style.inset, label).toBe("")
      expect(element.getAttribute("style") ?? "", label).not.toContain("fixed")
    }
    expect(byLabel(container, "One").style.background).toBe("blue")
  })

  test("this, xmlns and is can't change what an element is", async () => {
    const { container } = await draw({
      source: `<state bag={{ this: "script", xmlns: "http://www.w3.org/2000/svg", is: "x-pwn" }} />
<div aria-label="Div" this="script" is="x-pwn" xmlns="http://www.w3.org/2000/svg" {...bag}>div</div>
<svg aria-label="Svg" this="script" xmlns="http://www.w3.org/1999/xhtml" {...bag} viewBox="0 0 10 10"><circle this="script" xmlns="http://www.w3.org/1999/xhtml" r="2" /></svg>
<x-pwn aria-label="Custom" innerText="gone">custom</x-pwn>`,
    })
    const div = byLabel(container, "Div")
    expect(div.tagName).toBe("DIV")
    expect(div.namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    expect(attributes(div)).toEqual({ "aria-label": "Div" })
    const svg = byLabel(container, "Svg")
    expect(svg.tagName).toBe("svg")
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(svg.querySelector("circle")?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(container.querySelector("script, x-pwn")).toBeNull()
    expect(text(container)).toContain("custom")
  })

  test("names Svelte reads in a spread are not markup's to use", async () => {
    const { container } = await draw({
      source: `<state bag={{ __value: "x", autofocus: true, "$$events": 1 }} />
<input aria-label="Field" __value="x" autofocus $$slots="x" {...bag} />
<button on:click={bag = { ...bag, title: "again" }}>Again</button>`,
    })
    const field = byLabel<HTMLInputElement>(container, "Field")
    expect(attributes(field)).toEqual({ "aria-label": "Field" })
    expect((field as { __value?: unknown }).__value).toBeUndefined()
    expect(document.activeElement).not.toBe(field)
    // Svelte itself focuses an element given `autofocus`. It is never given.
    expect(nativeProps({ autofocus: "x", AUTOFOCUS: "x", autoFocus: true })).toEqual({})
  })

  test("a component of the host's is handed its props and nothing of Svelte's", async () => {
    const { container } = await draw({
      source: `<state seen="" items={[1, 2]} bag={{ "$$slots": { default: true }, "$$events": {}, "$$legacy": true, "bind:this": "x", "use:action": "x", "transition:fade": "x", this: "script", children: "x", render: "x", ref: "x", plain: 1 }} />
<Dump label="A" items={items} count={3} format={v => v * 2} on:pick={seen = "picked"} onKeyDown={seen = "key"} {...bag} $$slots={bag} bind:this={seen} use:action={seen} transition:fade={seen} this="script" children="x" render="x" />
<text>{seen}</text>`,
      components: { Dump },
    })
    // `children` is the renderer's own, and here there are none. The names
    // of directives are names like any other: the component has no such prop.
    expect(container.querySelector('[data-testid="dump"]')?.textContent).toBe(
      "children count format items label onPick onThisChange onkeydown plain this transition:fade use:action"
    )
    expect(dumped.props.children).toBeUndefined()
    expect(dumped.props.items).toEqual([1, 2])
    expect(dumped.props.count).toBe(3)
    expect(dumped.props.this).toBe("script")
    expect(dumped.props["use:action"]).toBe("")
    expect((dumped.props.format as (value: number) => number)(4)).toBe(8)
    ;(dumped.props.onPick as () => void)()
    await flushPromises()
    expect(text(container)).toContain("picked")
    expect(container.querySelector("script")).toBeNull()
  })

  test("a component is given text under the names that are DOM properties", () => {
    const run = () => {}
    const host = componentProps(
      {
        items: [1],
        count: 2,
        format: run,
        hostname: ["evil.test"],
        HOSTNAME: ["evil.test"],
        port: 8080,
        search: { q: 1 },
        text: ["gone"],
        innerText: 5,
        innertext: true,
        outerText: run,
        textContent: [1],
        srcObject: {},
        SRCOBJECT: {},
        className: ["a"],
        htmlFor: "field",
        onClick: run,
        onKeyDown: run,
        onValueChange: run,
        onclick: "alert(1)",
        ONCLICK: "alert(1)",
        onerror: run,
        style: { color: "red; position: fixed", width: "1px" },
      },
      null
    )
    expect(host).toEqual({
      items: [1],
      count: 2,
      format: run,
      hostname: "evil.test",
      HOSTNAME: "evil.test",
      port: "8080",
      search: "[object Object]",
      text: "gone",
      innerText: "5",
      innertext: "",
      textContent: "1",
      srcObject: "[object Object]",
      SRCOBJECT: "[object Object]",
      className: "a",
      for: "field",
      onclick: run,
      onkeydown: run,
      onValueChange: run,
      style: "width: 1px;",
    })

    // A UI SDK part passes on what it doesn't take, so it is given a value
    // that isn't text only under a name UI SDK documents as a prop.
    const part = componentProps(
      {
        value: ["a"],
        defaultValue: 2,
        disabled: true,
        orientation: "vertical",
        tabIndex: 3,
        files: [1],
        popoverTargetElement: {},
        valueAsDate: {},
        hostname: ["evil.test"],
        unknown: { a: 1 },
        hidden: true,
        draggable: false,
        "aria-hidden": true,
        "data-on": false,
        format: run,
        made: run,
        innerText: run,
        onValueChange: run,
      },
      UI_SDK_PROPS
    )
    expect({ ...part }).toEqual({
      value: ["a"],
      defaultValue: 2,
      disabled: true,
      orientation: "vertical",
      tabIndex: "3",
      files: "1",
      popoverTargetElement: "[object Object]",
      valueAsDate: "[object Object]",
      hostname: "evil.test",
      unknown: "[object Object]",
      hidden: true,
      "aria-hidden": "true",
      "data-on": "false",
      format: run,
      onValueChange: run,
    })
  })

  test("no prop UI SDK documents is a DOM property that rewrites an element", () => {
    expect(UI_SDK_PROPS.size).toBeGreaterThan(200)
    expect([...UI_SDK_PROPS].filter((name) => PROPERTY_SINKS.has(name.toLowerCase()))).toEqual([])
    // Setters that throw on a value of the wrong type.
    for (const name of ["files", "valueAsDate", "valueAsNumber", "popoverTargetElement", "srcObject"]) {
      expect(UI_SDK_PROPS.has(name), name).toBe(false)
    }
  })

  test("a UI SDK part's element is given data only under a prop UI SDK documents", async () => {
    await preloadUiSdk("Toolbar", "Button", "Input")
    const { container } = await draw({
      source: `<state list={["evil.test"]} bag={{ hostname: ["evil.test"], port: 8080, search: { q: 1 }, text: ["gone"], innerText: 5, files: [1], popoverTargetElement: {}, valueAsDate: {}, selectionStart: 2, title: ["a", "b"], tabIndex: 3 }} />
<Toolbar aria-label="Tools"><ToolbarLink href="https://example.com/a" hostname={list} text={list} {...bag}>link</ToolbarLink></Toolbar>
<Button aria-label="Kept" {...bag} value={list}>kept</Button>
<Input aria-label="Field" {...bag} />`,
    })
    const link = byText(container, "link") as HTMLAnchorElement
    expect(link.href).toBe("https://example.com/a")
    expect(link.getAttribute("title")).toBe("a,b")
    expect(byLabel(container, "Kept").textContent).toBe("kept")
    expect(byLabel(container, "Kept").getAttribute("tabindex")).toBe("3")
    expect(byLabel<HTMLInputElement>(container, "Field").files).toBeNull()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a function reaches a component only as a handler or as a prop of its own", async () => {
    await preloadUiSdk("Toolbar")
    const { container } = await draw({
      source: `<state seen="" />
<Plain innerText={() => "gone"} hostname={() => "evil.test"} title={v => v} text={v => v} />
<Toolbar aria-label="Tools"><ToolbarLink href="https://example.com/a" innerText={() => "gone"} hostname={v => v} title={v => v}>link</ToolbarLink></Toolbar>`,
      components: { Plain: PlainLink },
    })
    for (const link of [byText(container, "plain"), byText(container, "link")] as HTMLAnchorElement[]) {
      expect(link.href).toBe("https://example.com/a")
      expect(link.hasAttribute("innertext")).toBe(false)
      expect(link.hasAttribute("hostname")).toBe(false)
    }
  })

  test("an icon's name is looked up, not followed", async () => {
    const { container } = await draw({
      source: `<icon name="constructor" /><icon name="__proto__" /><icon name="toString" /><icon name="hasOwnProperty" /><icon name="../../package" /><icon name={["x"]} /><icon name="x" />`,
    })
    await until(() => expect(container.querySelectorAll("svg.iui-icon")).toHaveLength(1))
    expect(container.querySelectorAll("span.iui-icon[data-missing]")).toHaveLength(6)
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("what a part hands its children is data", async () => {
    await preloadUiSdk("Progress")
    const { container } = await draw({
      source: `<Progress value={40}>
  <ProgressValue let:progress>[{progress.value}] [{progress.constructor}] [{progress.__proto__}] [{typeof progress.toString}]</ProgressValue>
</Progress>`,
    })
    await until(() => expect(text(container)).toBe("[40] [] [] [undefined]"))
  })
})
