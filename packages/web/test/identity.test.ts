import { describe, expect, test } from "vitest"
import { preloadUiSdk } from "../src"
import { byLabel, byRole, byText, click, draw, flushPromises, text, type } from "./helpers"

/**
 * The tree on the page is patched, never rebuilt: an element that is still
 * in the markup is the same element after state changes and after the
 * source grows, with whatever the reader did to it.
 */
describe("DOM identity", () => {
  test("an input keeps focus and what was typed across a state change", async () => {
    const { container } = await draw({
      source: `<state n={0} />
<input aria-label="Free" />
<input aria-label="Bound" bind:value={n} />
<button on:click={n += 1}>add</button>
<text>n is {n}</text>
{#if n > 0}<badge>changed</badge>{/if}`,
    })
    const free = byLabel<HTMLInputElement>(container, "Free")
    free.focus()
    free.value = "typed by hand"
    free.setSelectionRange(3, 5)
    byText(container, "add").dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await flushPromises()
    expect(text(container)).toContain("n is 1")
    expect(text(container)).toContain("changed")
    expect(byLabel(container, "Free")).toBe(free)
    expect(free.value).toBe("typed by hand")
    expect(document.activeElement).toBe(free)
    expect([free.selectionStart, free.selectionEnd]).toEqual([3, 5])
  })

  test("an input keeps focus and what was typed while the source streams in", async () => {
    const full = `<state name="" />
<card>
<input aria-label="Name" bind:value={name} />
<input aria-label="Free" />
</card>

Hello **{name}**

<row><badge>one</badge><badge>two</badge></row>

- first
- second
`
    const { container, view } = await draw({ source: full.slice(0, 110), streaming: true })
    const bound = byLabel<HTMLInputElement>(container, "Name")
    const free = byLabel<HTMLInputElement>(container, "Free")
    const card = container.querySelector(".iui-card")
    await type(bound, "Ada")
    free.value = "kept"
    free.focus()
    for (let end = 111; end <= full.length; end += 7) {
      view.update({ source: full.slice(0, end), streaming: true })
      await flushPromises()
      expect(byLabel(container, "Name")).toBe(bound)
      expect(byLabel(container, "Free")).toBe(free)
      expect(document.activeElement).toBe(free)
    }
    view.update({ source: full, streaming: false })
    await flushPromises()
    expect(container.querySelector(".iui-card")).toBe(card)
    expect(byLabel(container, "Name")).toBe(bound)
    expect(bound.value).toBe("Ada")
    expect(free.value).toBe("kept")
    expect(document.activeElement).toBe(free)
    expect(text(container)).toContain("Hello Ada")
    expect(text(container)).toContain("second")
  })

  test("UI SDK tabs keep the tab the reader picked across a state change and streamed growth", async () => {
    await preloadUiSdk("Tabs")
    const full = `<state n={0} />
<Tabs defaultValue="a">
  <TabsList><TabsTab value="a">Alpha</TabsTab><TabsTab value="b">Beta</TabsTab></TabsList>
  <TabsPanel value="a">First panel {n}</TabsPanel>
  <TabsPanel value="b">Second panel {n}</TabsPanel>
</Tabs>
<button on:click={n += 1}>add</button>

More text arrives after the tabs.
`
    const cut = full.indexOf("<button")
    const { container, view } = await draw({ source: full.slice(0, cut), streaming: true })
    const tabs = container.querySelector("ui-tabs")
    const [, beta] = byRole(container, "tab")
    await click(beta as HTMLElement)
    expect(beta?.getAttribute("aria-selected")).toBe("true")
    const selected = () =>
      byRole(container, "tab")
        .filter((tab) => tab.getAttribute("aria-selected") === "true")
        .map((tab) => tab.textContent)

    view.update({ source: full.slice(0, cut + 30), streaming: true })
    await flushPromises()
    view.update({ source: full, streaming: false })
    await flushPromises()
    expect(selected()).toEqual(["Beta"])
    expect(container.querySelector("ui-tabs")).toBe(tabs)
    expect(byRole(container, "tab")[1]).toBe(beta)

    await click(byText(container, "add"))
    expect(text(container)).toContain("Second panel 1")
    expect(selected()).toEqual(["Beta"])
    expect(container.querySelector("ui-tabs")).toBe(tabs)
    expect(byRole(container, "tab")[1]).toBe(beta)
    expect(byRole(container, "tabpanel").find((panel) => !panel.hidden)?.textContent).toContain("Second panel 1")
  })

  test("UI SDK tabs are the same element before and after their closing tag arrives", async () => {
    await preloadUiSdk("Tabs")
    const full = `<Tabs defaultValue="a">
  <TabsList><TabsTab value="a">Alpha</TabsTab><TabsTab value="b">Beta</TabsTab></TabsList>
  <TabsPanel value="a">First panel</TabsPanel>
  <TabsPanel value="b">Second panel</TabsPanel>
</Tabs>

Text after the tabs.`
    const { container, view } = await draw({
      source: full.slice(0, full.indexOf("<TabsPanel")),
      streaming: true,
    })
    const tabs = container.querySelector("ui-tabs")
    const [, beta] = byRole(container, "tab")
    await click(beta as HTMLElement)
    for (const end of [full.indexOf(`<TabsPanel value="b"`), full.indexOf("</Tabs>"), full.indexOf("Text after")]) {
      view.update({ source: full.slice(0, end), streaming: true })
      await flushPromises()
    }
    view.update({ source: full, streaming: false })
    await flushPromises()
    expect(container.querySelector("ui-tabs")).toBe(tabs)
    expect(byRole(container, "tab")[1]).toBe(beta)
    expect(beta?.getAttribute("aria-selected")).toBe("true")
    expect(byRole(container, "tabpanel").find((panel) => !panel.hidden)?.textContent).toBe("Second panel")
  })

  test("a root that reads its parts once is drawn anew when its closing tag arrives, and never again", async () => {
    await preloadUiSdk("Field", "Input")
    const full = `<state name="" />
<Field>
  <FieldLabel>Name</FieldLabel>
  <Input aria-label="Bound" bind:value={name} />
  <Input aria-label="Free" />
  <FieldDescription>As it is on your passport.</FieldDescription>
</Field>

You typed {name}. More text arrives after the field.`
    const { container, view } = await draw({
      source: full.slice(0, full.indexOf("<FieldDescription")),
      streaming: true,
    })
    const open = container.querySelector("ui-field")
    const bound = byLabel<HTMLInputElement>(container, "Bound")
    await type(bound, "Ada")
    const free = byLabel<HTMLInputElement>(container, "Free")
    free.focus()
    free.value = "typed by hand"
    free.setSelectionRange(3, 5)

    view.update({ source: full.slice(0, full.indexOf("</Field>")), streaming: true })
    await flushPromises()
    expect(container.querySelector("ui-field")).toBe(open)
    expect(byLabel(container, "Free")).toBe(free)

    view.update({ source: full.slice(0, full.indexOf("You typed")), streaming: true })
    await flushPromises()
    const whole = container.querySelector("ui-field")
    expect(whole).not.toBe(open)
    expect(container.querySelectorAll("ui-field")).toHaveLength(1)
    const again = byLabel<HTMLInputElement>(container, "Free")
    expect(again).not.toBe(free)
    expect(document.activeElement).toBe(again)
    expect(again.value).toBe("typed by hand")
    expect([again.selectionStart, again.selectionEnd]).toEqual([3, 5])
    expect(byLabel<HTMLInputElement>(container, "Bound").value).toBe("Ada")

    view.update({ source: full.slice(0, full.indexOf("More text")), streaming: true })
    await flushPromises()
    view.update({ source: full, streaming: false })
    await flushPromises()
    expect(container.querySelector("ui-field")).toBe(whole)
    expect(byLabel(container, "Free")).toBe(again)
    expect(document.activeElement).toBe(again)
    expect(text(container)).toContain("You typed Ada.")
  })

  test("a keyed list moves its elements instead of making new ones", async () => {
    const { container } = await draw({
      source: `<state items={[{ id: "a" }, { id: "b" }, { id: "c" }]} />
<button on:click={items = [items[2], items[0], { id: "d" }, items[1]]}>shuffle</button>
{#each items as item (item.id)}<input aria-label={item.id} />{/each}`,
    })
    const before = Object.fromEntries(
      ["a", "b", "c"].map((id) => [id, byLabel<HTMLInputElement>(container, id)])
    )
    ;(before.b as HTMLInputElement).value = "typed in b"
    await click(byText(container, "shuffle"))
    const order = [...container.querySelectorAll("input")].map((input) => input.getAttribute("aria-label"))
    expect(order).toEqual(["c", "a", "d", "b"])
    for (const id of ["a", "b", "c"]) expect(byLabel(container, id)).toBe(before[id])
    expect(byLabel<HTMLInputElement>(container, "b").value).toBe("typed in b")
  })

  test("a block that loads late takes its place without disturbing its neighbours", async () => {
    const { container } = await draw({
      source: `<input aria-label="Before" />
<Tabs defaultValue="a"><TabsList><TabsTab value="a">Late</TabsTab></TabsList></Tabs>
<input aria-label="After" />`,
    })
    const before = byLabel<HTMLInputElement>(container, "Before")
    const after = byLabel<HTMLInputElement>(container, "After")
    before.value = "one"
    after.value = "two"
    await preloadUiSdk("Tabs")
    await flushPromises()
    expect(byRole(container, "tab")).toHaveLength(1)
    expect(byLabel(container, "Before")).toBe(before)
    expect(byLabel(container, "After")).toBe(after)
    expect([before.value, after.value]).toEqual(["one", "two"])
    const order = [...container.querySelectorAll("input, ui-tabs")].map((element) => element.localName)
    expect(order).toEqual(["input", "ui-tabs", "input"])
  })
})
