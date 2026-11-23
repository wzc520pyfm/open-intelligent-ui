import { runMorph } from "@open-intelligent-ui/core/renderer"
import { describe, expect, test, vi } from "vitest"
import { type IntelligentUIHandle, preloadUiSdk } from "../src"
import BareLink from "./fixtures/BareLink.svelte"
import Broken from "./fixtures/Broken.svelte"
import Flaky, { flaky } from "./fixtures/Flaky.svelte"
import Map from "./fixtures/Map.svelte"
import PlainButton from "./fixtures/PlainButton.svelte"
import PlainLink from "./fixtures/PlainLink.svelte"
import PlainSpan from "./fixtures/PlainSpan.svelte"
import PlainVideo from "./fixtures/PlainVideo.svelte"
import Stepper from "./fixtures/Stepper.svelte"
import {
  afterTest,
  byLabel,
  byRole,
  byText,
  click,
  draw,
  drawNow,
  flushPromises,
  text,
  topLevelCloses,
  type,
  until,
} from "./helpers.svelte"

describe("markdown and primitives", () => {
  test("renders Markdown next to layout tags", async () => {
    const { container } = await draw({
      source: `# Trip plan

Two **great** options:

<row gap="4">
  <card padding="4"><text size="lg" weight="semibold">Kyoto</text></card>
  <card><badge color="success">Cheaper</badge></card>
</row>

- one
- two`,
    })
    expect(container.querySelector("h1")?.textContent).toBe("Trip plan")
    expect(container.querySelector("strong")?.textContent).toBe("great")
    expect(container.querySelectorAll(".iui-card")).toHaveLength(2)
    expect(container.querySelector(".iui-row")).not.toBeNull()
    expect(container.querySelectorAll("li")).toHaveLength(2)
    const card = container.querySelector<HTMLElement>(".iui-card")
    expect(card?.style.padding).toBe("calc(var(--iui-space-unit) * 4)")
    expect(
      container.querySelector<HTMLElement>(".iui-badge")?.style.getPropertyValue("--iui-tone")
    ).toBe("var(--iui-color-success, success)")
  })

  test("writes the design as CSS variables scoped to this surface", async () => {
    const { container } = await draw({
      source: "Hello",
      design: `---
colors:
  primary: "#ff5500"
---`,
    })
    const id = container.getAttribute("data-iui-id")
    const css = container.querySelector("style")?.textContent ?? ""
    expect(css).toContain(`.iui-root[data-iui-id="${id}"]`)
    expect(css).toContain("--iui-color-primary: #ff5500")
  })

  test("uses the built-in design when none is given", async () => {
    const { container } = await draw({ source: "Hello" })
    expect(container.querySelector("style")?.textContent).toContain("--iui-color-accent: #2f6feb")
  })

  test("class and style given to the component land on the root", async () => {
    const { container } = await draw({ source: "Hello", class: "mine", style: "max-width: 40rem" })
    expect(container.className).toBe("iui-root mine")
    expect(container.style.maxWidth).toBe("40rem")
  })
})

describe("state", () => {
  test("declares state, shows it and derives from it", async () => {
    const { container } = await draw({
      source: `<state price={40} qty={3} />
<derive total={price * qty} />

Total: {currency(total, "USD")}`,
    })
    expect(text(container)).toBe("Total: $120")
  })

  test("bind: on a native input reads and writes state", async () => {
    const { container } = await draw({
      source: `<state name="Ada" count={2} />
<input aria-label="Name" bind:value={name} />
<input aria-label="Count" type="number" bind:value={count} />
<text>Hello {name}, {count * 2}</text>`,
    })
    const name = byLabel<HTMLInputElement>(container, "Name")
    expect(name.value).toBe("Ada")
    await type(name, "Grace")
    await type(byLabel<HTMLInputElement>(container, "Count"), "5")
    expect(text(container)).toBe("Hello Grace, 10")
  })

  test("bind: on a checkbox, a select and details", async () => {
    const { container } = await draw({
      source: `<state agreed={false} size="m" open={false} />
<input aria-label="Agree" type="checkbox" bind:checked={agreed} />
<select aria-label="Size" bind:value={size}><option value="s">S</option><option value="m">M</option></select>
<details bind:open={open}><summary>More</summary>Hidden</details>
<text>{agreed ? "yes" : "no"} {size} {open ? "open" : "shut"}</text>`,
    })
    expect(text(container)).toContain("no m shut")
    const box = byLabel<HTMLInputElement>(container, "Agree")
    box.checked = true
    box.dispatchEvent(new Event("change", { bubbles: true }))
    const select = byLabel<HTMLSelectElement>(container, "Size")
    expect(select.value).toBe("m")
    select.value = "s"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    const details = container.querySelector("details") as HTMLDetailsElement
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await flushPromises()
    expect(text(container)).toContain("yes s open")
  })

  test("on:change on a text input fires on every edit", async () => {
    const { container } = await draw({
      source: `<state seen="" />
<input aria-label="Query" on:change={e => seen = e.value} />
<text>Seen {seen}</text>`,
    })
    await type(byLabel<HTMLInputElement>(container, "Query"), "ab")
    expect(text(container)).toBe("Seen ab")
  })

  test("on:click runs statements against state", async () => {
    const { container } = await draw({
      source: `<state count={0} log={[]} />
<button on:click={count += 1; log = [...log, count]}>Add</button>
<text>{count} / {log.join(",")}</text>`,
    })
    const button = byText(container, "Add")
    await click(button)
    await click(button)
    expect(text(container)).toBe("Add2 / 1,2")
  })

  test("events with two-word names reach the element", async () => {
    const { container } = await draw({
      source: `<state key="" moved={0} />
<input aria-label="Field" on:keydown={e => key = e.key} onKeyUp={e => key = key + "!"} />
<box aria-label="Pad" on:pointermove={moved += 1} on:pointerout={moved += 10} on:doubleclick={moved += 100}>pad</box>
<text>{key} {moved}</text>`,
    })
    const field = byLabel(container, "Field")
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }))
    for (const event of ["pointermove", "pointerout", "dblclick"]) {
      byLabel(container, "Pad").dispatchEvent(new Event(event, { bubbles: true }))
    }
    await flushPromises()
    expect(text(container)).toBe("pada! 111")
  })

  test("writes to an item inside each reach the list", async () => {
    const { container } = await draw({
      source: `<state todos={[{ title: "Book flights", done: false }, { title: "Pack", done: true }]} />
{#each todos as todo, i (todo.title)}
  <button on:click={todo.done = !todo.done}>{i + 1}. {todo.title}{todo.done ? " ✓" : ""}</button>
{/each}
<text>{todos.filter(t => t.done).length} done</text>`,
    })
    await click(byText(container, /Book flights/))
    expect(text(container)).toContain("1. Book flights ✓")
    expect(text(container)).toContain("2 done")
  })

  test("if, else if and else follow state", async () => {
    const { container } = await draw({
      source: `<state step={1} />
<button on:click={step += 1}>Next</button>
{#if step == 1}
  <text>First</text>
{:else if step == 2}
  <text>Second</text>
{:else}
  <text>Done</text>
{/if}`,
    })
    expect(text(container)).toBe("NextFirst")
    await click(byText(container, "Next"))
    expect(text(container)).toBe("NextSecond")
    await click(byText(container, "Next"))
    expect(text(container)).toBe("NextDone")
  })

  test("state survives the source growing while it streams", async () => {
    const first = `<state count={0} />
<button on:click={count += 1}>Add</button>
<text>Count {count}</text>`
    const { view, container } = await draw({ source: first, streaming: true })
    await click(byText(container, "Add"))
    await view.setProps({ source: `${first}\n\nAnd **more** text` })
    expect(text(container)).toBe("AddCount 1And more text")
    await view.setProps({ streaming: false })
    expect(text(container)).toBe("AddCount 1And more text")
  })

  test("a half-written document renders what is complete", async () => {
    const { container } = await draw({
      source: `<state tab="a" />
<card>
  <title>Budget</title>
  <row><text>Spent</text><badge color="warn`,
      streaming: true,
    })
    expect(container.querySelector(".iui-title")?.textContent).toBe("Budget")
    expect(text(container)).toBe("BudgetSpent")
  })

  test("the host can read and write state through the ref", async () => {
    const onStateChange = vi.fn()
    const { view, container } = await draw({
      source: `<state city="Kyoto" />\n<text>{city}</text>`,
      onStateChange,
    })
    const handle = view.vm as unknown as IntelligentUIHandle
    expect(handle.getState()).toEqual({ city: "Kyoto" })
    expect(onStateChange).toHaveBeenLastCalledWith({ city: "Kyoto" })
    handle.setState({ city: "Osaka" })
    await flushPromises()
    expect(text(container)).toBe("Osaka")
    expect(onStateChange).toHaveBeenLastCalledWith({ city: "Osaka" })
  })

  test("state a later piece of the stream declares is reported to the host", async () => {
    const onStateChange = vi.fn()
    const { view } = await draw({ source: "Thinking", streaming: true, onStateChange })
    expect(onStateChange).toHaveBeenLastCalledWith({})
    await view.setProps({ source: `Thinking\n<state city="Kyoto" />` })
    await until(() => expect(onStateChange).toHaveBeenLastCalledWith({ city: "Kyoto" }))
    const calls = onStateChange.mock.calls.length
    await view.setProps({ source: `Thinking\n<state city="Kyoto" />\nmore` })
    expect(onStateChange).toHaveBeenCalledTimes(calls)
  })

  test("parse problems are reported for each source", async () => {
    const onDiagnostics = vi.fn()
    const { view } = await draw({ source: "<card>open", onDiagnostics })
    expect(onDiagnostics.mock.lastCall?.[0]).not.toHaveLength(0)
    await view.setProps({ source: "<card>closed</card>" })
    expect(onDiagnostics).toHaveBeenLastCalledWith([])
  })
})

describe("components", () => {
  test("define makes a reusable component with props and a slot", async () => {
    const { container } = await draw({
      source: `<state unit="km" />
<define name="Metric" props="label, value">
  <card><text>{label}: {value} {unit}</text><slot /></card>
</define>
<Metric label="Distance" value={12}><badge>new</badge></Metric>
<Metric label="Climb" value={3 * 2} />`,
    })
    expect(container.querySelectorAll(".iui-card")).toHaveLength(2)
    expect(text(container)).toBe("Distance: 12 kmnewClimb: 6 km")
  })

  test("a component that defines itself in terms of itself stops", async () => {
    const onWarning = vi.fn()
    await draw({ source: `<define name="Loop"><Loop /></define>\n<Loop />`, onWarning })
    await until(() =>
      expect(onWarning).toHaveBeenCalledWith("<Loop> is nested inside itself too deeply")
    )
  })

  test("host components are used by name and get evaluated props", async () => {
    const { container } = await draw({
      source: `<state city="Lisbon" picked="" />
<Map city={city} zoom={4 + 1} on:pick={value => picked = value}><text>!</text></Map>
<text>Picked {picked}</text>`,
      components: { Map },
    })
    const map = container.querySelector('[data-testid="map"]') as HTMLElement
    expect(map.textContent).toBe("Lisbon@5!")
    await click(map)
    expect(text(container)).toContain("Picked Lisbon")
  })

  test("bind: works with a component built for bind:", async () => {
    const { container } = await draw({
      source: `<state n={2} />\n<Stepper bind:value={n} />\n<text>n is {n}</text>`,
      components: { Stepper },
    })
    await click(byText(container, "Step 2"))
    expect(text(container)).toBe("Step 3n is 3")
  })

  test("one failing component doesn't take down the surface", async () => {
    const onWarning = vi.fn()
    const { container } = await draw({
      source: `<text>Before</text>\n<Broken />\n<text>After</text>`,
      components: { Broken },
      onWarning,
    })
    expect(text(container)).toContain("Before")
    expect(text(container)).toContain("After")
    expect(container.querySelector(".iui-error")?.textContent).toContain("boom")
    await until(() => expect(onWarning).toHaveBeenCalledWith("boom"))
  })

  test("a block that failed is tried again when the source changes", async () => {
    flaky.broken = true
    const { view, container } = await draw({ source: "<Flaky />", components: { Flaky } })
    expect(container.querySelector(".iui-error")).not.toBeNull()
    flaky.broken = false
    await view.setProps({ source: "<Flaky />\n" })
    expect(container.querySelector(".iui-error")).toBeNull()
    expect(text(container)).toBe("fine")
  })

  test("while streaming a failed block stays hidden", async () => {
    const { container } = await draw({
      source: "<Broken />",
      components: { Broken },
      streaming: true,
    })
    expect(container.querySelector(".iui-error")).toBeNull()
    expect(container.querySelector(".iui-pending")).not.toBeNull()
  })

  test("unknown components render their children and warn", async () => {
    const onWarning = vi.fn()
    const { container } = await draw({
      source: `<Mystery><text>inside</text></Mystery>`,
      onWarning,
    })
    expect(text(container)).toBe("inside")
    await until(() => expect(onWarning).toHaveBeenCalledWith("<Mystery> is not a known component"))
  })
})

describe("presets", () => {
  test("Stat shows a formatted value and its change", async () => {
    const { container } = await draw({
      source: `<Stat label="Revenue" value="$12.4k" delta={0.082} caption="vs last month" />`,
    })
    expect(container.querySelector(".iui-stat-label")?.textContent).toBe("Revenue")
    expect(container.querySelector(".iui-stat-value")?.textContent).toBe("$12.4k")
    expect(container.querySelector(".iui-stat-delta")?.getAttribute("data-tone")).toBe("success")
    expect(container.querySelector(".iui-stat-delta")?.textContent).toBe("8.2%")
  })

  test("a number counts up to its value", async () => {
    const { container } = await draw({ source: `<Stat label="Users" value={1200} />` })
    const number = container.querySelector(".iui-number")
    expect(number?.getAttribute("aria-label")).toBe("1,200")
    await until(() => expect(number?.textContent).toBe("1,200"))
  })

  test("DataTable sorts, pages and reports the selected row", async () => {
    const { container } = await draw({
      source: `<state picked={null} rows={[
  { name: "Pear", price: 3 },
  { name: "Apple", price: 5 },
  { name: "Fig", price: 1 }
]} />
<DataTable data={rows} columns={["name", { key: "price", format: "currency" }]} pageSize={2} sortable onSelect={row => picked = row.name} />
<text>Picked: {picked ?? "none"}</text>`,
    })
    const names = () =>
      [...container.querySelectorAll("tbody tr td:first-child")].map((cell) => cell.textContent)
    expect(names()).toEqual(["Pear", "Apple"])
    await click(byText(container, "Price"))
    expect(names()).toEqual(["Fig", "Pear"])
    expect(container.querySelector("th[aria-sort]")?.getAttribute("aria-sort")).toBe("ascending")
    await click(byLabel(container, "Next page"))
    expect(names()).toEqual(["Apple"])
    expect(text(container)).toContain("3–3 of 3")
    await click(byText(container, "Apple"))
    expect(text(container)).toContain("Picked: Apple")
  })

  test("Chart draws one bar per row from state", async () => {
    const { container } = await draw({
      source: `<state sales={[{ month: "Jan", total: 4 }, { month: "Feb", total: 9 }, { month: "Mar", total: 6 }]} picked="" />
<Chart type="bar" data={sales} x="month" y="total" aria-label="Sales by month" onSelect={row => picked = row.month} />
<text>Picked {picked}</text>`,
    })
    const chart = container.querySelector(".iui-chart")
    expect(chart?.getAttribute("aria-label")).toBe("Sales by month")
    expect(container.querySelectorAll(".iui-chart-bar")).toHaveLength(3)
    const plot = container.querySelector(".iui-chart svg") as SVGSVGElement
    plot.dispatchEvent(new MouseEvent("pointermove", { clientX: 0, bubbles: true }))
    await flushPromises()
    expect(container.querySelector(".iui-chart-tooltip strong")?.textContent).toBe("Jan")
    await click(plot)
    expect(text(container)).toContain("Picked Jan")
  })

  test("a fenced code block becomes a CodeBlock that copies", async () => {
    const onAction = vi.fn(() => true)
    const { container } = await draw({ source: "```ts\nconst a = {b: 1}\n```", onAction })
    expect(container.querySelector(".iui-code pre")?.textContent).toBe("const a = {b: 1}")
    expect(container.querySelector(".iui-code-bar")?.textContent).toContain("ts")
    await click(byLabel(container, "Copy code"))
    expect(onAction).toHaveBeenCalledWith({ type: "copy", text: "const a = {b: 1}" })
    expect(byLabel(container, "Copy code").textContent).toBe("Copied")
  })

  test("an image that fails to load leaves a placeholder", async () => {
    const { container } = await draw({
      source: `<image src="https://example.com/a.png" alt="A view" radius="md" />`,
    })
    const image = container.querySelector("img") as HTMLImageElement
    expect(image.getAttribute("referrerpolicy")).toBe("no-referrer")
    image.dispatchEvent(new Event("error"))
    await flushPromises()
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector('.iui-image[data-missing][role="img"]')).not.toBeNull()
  })

  test("a picture that failed is tried again at another address", async () => {
    const { container } = await draw({
      source: `<state file="a" />
<image src={"https://example.com/" + file + ".png"} alt="A view" />
<button on:click={file = "b"}>Next</button>`,
    })
    ;(container.querySelector("img") as HTMLImageElement).dispatchEvent(new Event("error"))
    await flushPromises()
    expect(container.querySelector("img")).toBeNull()
    await click(byText(container, "Next"))
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/b.png")
  })

  test("icons are drawn once they load, and unknown names leave a gap", async () => {
    const { container } = await draw({
      source: `<icon name="arrow-up" size="lg" label="Up" /><icon name="HomeIcon" /><icon name="no-such-icon" />`,
    })
    await until(() => expect(container.querySelectorAll("svg.iui-icon")).toHaveLength(2))
    const up = container.querySelector("svg.lucide-arrow-up")
    expect(up?.getAttribute("width")).toBe("20")
    expect(up?.getAttribute("role")).toBe("img")
    expect(up?.getAttribute("aria-label")).toBe("Up")
    expect(up?.querySelectorAll("path")).toHaveLength(2)
    expect(container.querySelector("svg.lucide-house")?.getAttribute("aria-hidden")).toBe("true")
    expect(container.querySelector("span.iui-icon[data-missing]")).not.toBeNull()
  })
})

describe("data and actions", () => {
  test("query reads from a tool and call writes then reloads", async () => {
    const tasks = [{ id: 1, title: "Draft" }]
    const tools = {
      listTasks: vi.fn(async () => [...tasks]),
      addTask: vi.fn(async (input: unknown) => {
        tasks.push({ id: tasks.length + 1, title: (input as { title: string }).title })
        return { ok: true }
      }),
    }
    const onTool = vi.fn()
    const { container } = drawNow({
      tools,
      onTool,
      source: `<state draft="Review" />
<query id="tasks" tool="listTasks" />
{#if tasks.loading && !tasks.data}<text>Loading</text>{/if}
{#each tasks.data ?? [] as task (task.id)}<text block>{task.title}</text>{/each}
<button on:click={await call("addTask", { title: draft }); draft = ""}>Add</button>`,
    })
    expect(text(container)).toContain("Loading")
    await until(() => expect(text(container)).toContain("Draft"))
    await click(byText(container, "Add"))
    await until(() => expect(text(container)).toContain("Review"))
    expect(tools.addTask).toHaveBeenCalledWith({ title: "Review" })
    expect(tools.listTasks).toHaveBeenCalledTimes(2)
    expect(onTool).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "addTask", kind: "write", status: "done" })
    )
  })

  test("send hands the host a message with the surface state", async () => {
    const onAction = vi.fn()
    const { container } = await draw({
      onAction,
      source: `<state pick="Kyoto" />
<button on:click={send("Book " + pick, { city: pick })}>Book</button>`,
    })
    await click(byText(container, "Book"))
    expect(onAction).toHaveBeenCalledWith({
      type: "send",
      text: "Book Kyoto",
      data: { city: "Kyoto" },
      state: { pick: "Kyoto" },
    })
  })

  test("a failing action shows a toast instead of throwing", async () => {
    const { container } = await draw({
      source: `<button on:click={await call("missing")}>Go</button>`,
    })
    await click(byText(container, "Go"))
    await until(() =>
      expect(container.querySelector(".iui-toast")?.textContent).toBe(
        'No tool named "missing" is available'
      )
    )
  })

  test("toast() shows a message with its tone", async () => {
    const { container } = await draw({
      source: `<button on:click={toast("Saved", "success")}>Save</button>`,
    })
    await click(byText(container, "Save"))
    const toast = container.querySelector(".iui-toast")
    expect(toast?.textContent).toBe("Saved")
    expect(toast?.getAttribute("data-tone")).toBe("success")
  })

  test("a form submits without leaving the page", async () => {
    const { container } = await draw({
      source: `<state sent={false} />
<form on:submit={sent = true}><button type="submit">Send</button></form>
<text>{sent ? "sent" : "not sent"}</text>`,
    })
    const submit = new Event("submit", { bubbles: true, cancelable: true })
    container.querySelector("form")?.dispatchEvent(submit)
    await flushPromises()
    expect(submit.defaultPrevented).toBe(true)
    expect(text(container)).toContain("Sendsent")
  })
})

describe("safety", () => {
  test("drops script, inline handlers and unsafe URLs", async () => {
    const { container } = await draw({
      source: `<script>window.hacked = true</script>
<a href="javascript:alert(1)">bad link</a>
<a href="https://example.com/a">good link</a>
<div onclick="alert(1)" style="background: url(https://evil.test/x.png); color: red">box</div>
<img src="https://example.com/pic.png" onerror="alert(1)" alt="pic">
<iframe src="https://evil.test"></iframe>
<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><circle r="2" onclick="alert(1)" /></a><foreignObject><div>x</div></foreignObject></svg>`,
    })
    expect(container.querySelector("script, iframe, foreignObject")).toBeNull()
    expect(byText(container, "bad link").getAttribute("href")).toBeNull()
    const good = byText(container, "good link")
    expect(good.getAttribute("href")).toBe("https://example.com/a")
    expect(good.getAttribute("rel")).toBe("noopener noreferrer")
    const box = byText(container, "box")
    expect(box.getAttribute("onclick")).toBeNull()
    expect(box.onclick).toBeNull()
    expect(box.style.color).toBe("red")
    expect(box.getAttribute("style")).not.toContain("url")
    const image = container.querySelector("img")
    expect(image?.getAttribute("onerror")).toBeNull()
    expect(image?.onerror).toBeNull()
    expect(container.querySelector("svg a")?.getAttribute("href")).toBeNull()
    expect(container.querySelector("circle")?.getAttribute("onclick")).toBeNull()
  })

  test("markup can't set HTML or reach Svelte's own attribute syntax", async () => {
    const { container } = await draw({
      source: `<state bag={{ innerHTML: "<b>x</b>", "{@html}": "<b>y</b>", "bind:innerHTML": "<b>y</b>", "use:action": "x", "transition:fade": "x", onclick: "alert(1)", onClick: "alert(1)", title: "ok" }} />
<div aria-label="Target" {...bag} innerHTML="<i>z</i>" bind:innerHTML={bag.innerHTML} bind:this={bag} use:action transition:fade this="script" ref="r">safe</div>`,
    })
    const target = byLabel(container, "Target")
    // Svelte's own comments aside, the text is all there is.
    expect(target.innerHTML.replace(/<!---->/g, "")).toBe("safe")
    expect(target.children).toHaveLength(0)
    expect(target.getAttribute("title")).toBe("ok")
    expect(target.getAttribute("onclick")).toBeNull()
    expect(target.onclick).toBeNull()
    expect([...target.attributes].map((attribute) => attribute.name).sort()).toEqual([
      "aria-label",
      "title",
    ])
  })

  test("a component's element can't be rewritten through its DOM properties", async () => {
    await preloadUiSdk("Button", "Toolbar")
    const { container } = await draw({
      source: `<state bag={{}} html={null} />
<button on:click={bag = { outerHTML: "<img id='pwn' src='x'>", innerHTML: "<img id='pwn' src='x'>", textContent: "gone", innerText: "gone", hostname: "evil.test", protocol: "javascript", title: "ok" }; html = "<img id='pwn' src='x'>"}>go</button>
<Button aria-label="Kept" {...bag} bind:outerHTML={html}><icon name="x" /></Button>
<Toolbar aria-label="Tools"><ToolbarLink href="https://example.com/a" {...bag}>link</ToolbarLink></Toolbar>
<Plain {...bag} />`,
      components: { Plain: PlainLink },
    })
    await click(byText(container, "go"))
    await until(() => expect(byLabel(container, "Kept").getAttribute("title")).toBe("ok"))
    expect(container.querySelector("#pwn")).toBeNull()
    expect(byLabel(container, "Kept").querySelector(".iui-icon")).not.toBeNull()
    for (const link of [byText(container, "link"), byText(container, "plain")]) {
      expect((link as HTMLAnchorElement).href).toBe("https://example.com/a")
      expect(link.getAttribute("title")).toBe("ok")
    }
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a component can't be handed a URL the host wasn't asked about", async () => {
    await preloadUiSdk("Button")
    const asked: string[] = []
    const { container } = await draw({
      source: `<state bag={{ srcSet: "https://evil.test/a.png 1x", imageSrcSet: "https://evil.test/b.png 1x", ping: "https://evil.test/ping", attributionSrc: "https://evil.test/c", poster: "https://evil.test/d.png", title: "ok" }} />
<Button aria-label="Kept" {...bag} srcset="https://evil.test/e.png 2x" PING="https://evil.test/f">Keep</Button>
<Plain {...bag} />`,
      components: { Plain: PlainVideo },
      allowUrl: (url) => {
        asked.push(url)
        return false
      },
    })
    expect(byLabel(container, "Kept").getAttribute("title")).toBe("ok")
    expect(byLabel(container, "Plain").getAttribute("title")).toBe("ok")
    expect(container.innerHTML).not.toContain("evil.test")
    expect(new Set(asked)).toEqual(new Set(["https://evil.test/d.png"]))
  })

  test("a component's props are checked however they are spelled or bound", async () => {
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state u="https://evil.test/x" code="window.pwned = 'evil.test'" css={{ backgroundImage: "url(https://evil.test/bg.png)" }} />
<Button aria-label="Kept" title="ok" FORMACTION="https://evil.test/f" SRCDOC="<p>evil.test</p>" HREF="https://evil.test/h" SRC="https://evil.test/s" Poster="https://evil.test/p" bind:srcset={u} bind:SRCSET={u} bind:ping={u} bind:href={u} bind:src={u} bind:poster={u} bind:formAction={u} bind:onclick={code} bind:style={css}>Keep</Button>
<Plain title="ok" FORMACTION="https://evil.test/f" HREF="https://evil.test/h" bind:onclick={code} bind:style={css} bind:href={u} />
<Bare hostname="other.test" />`,
      components: { Plain: PlainButton, Bare: BareLink },
      allowUrl: () => false,
    })
    for (const button of [byLabel(container, "Kept"), byLabel(container, "Plain")]) {
      expect(button.getAttribute("title")).toBe("ok")
      expect(button.getAttribute("onclick")).toBeNull()
    }
    expect((byText(container, "bare") as HTMLAnchorElement).href).toBe("https://example.com/a")
    expect(container.innerHTML).not.toContain("evil.test")
  })

  test("markup can't reach what Svelte passes a component besides its props", async () => {
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state seen={null} bag={{ "$$slots": { default: true }, "$$events": { click: 1 }, "$$legacy": true, children: "x", render: "x", "@attach": "x" }} />
<Button aria-label="One" {...bag} $$slots={bag} children={seen = "children"} render={seen = "render"} use:action={seen = "use"} transition:fade={seen = "transition"} bind:this={seen} this="script">One</Button>
<Plain {...bag} $$events={bag} children={seen = "children"} use:action={seen = "use"} bind:this={seen} this="script" />
<div {...bag} on:introstart={seen = "div"} use:action={seen = "use"} bind:this={seen}>Two</div>
<card {...bag} use:action={seen = "use"} bind:this={seen}>Three</card>
<text>seen: {seen ?? "nothing"}</text>`,
      components: { Plain: PlainSpan },
    })
    await flushPromises()
    expect(text(container)).toContain("seen: nothing")
    expect(byLabel(container, "One").tagName).toBe("BUTTON")
    expect(byLabel(container, "One").textContent).toBe("One")
    expect(byText(container, "plain").tagName).toBe("SPAN")
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("the host can refuse URLs", async () => {
    const { container } = await draw({
      source: `<a href="https://example.com/a">link</a><image src="https://cdn.test/a.png" alt="A" />`,
      allowUrl: (url) => url.startsWith("https://example.com/"),
    })
    expect(byText(container, "link").getAttribute("href")).toBe("https://example.com/a")
    expect(container.querySelector("img")).toBeNull()
  })

  test("a reply can't add to or submit a form outside it, and an address a function returns is checked", async () => {
    await preloadUiSdk("Input", "Checkbox", "Button", "Pagination")
    const form = document.body.appendChild(document.createElement("form"))
    form.id = "host-form"
    form.innerHTML = '<input name="amount" value="10">'
    const { container } = await draw({
      source: `<state id="host-form" />
<Input aria-label="To" form="host-form" name="to" defaultValue="someone" />
<Checkbox aria-label="Admin" FORM="host-form" name="admin" defaultChecked />
<Button aria-label="Go" type="submit" form="host-form" bind:form={id} {...{ form: id }}>Go</Button>
<Pagination aria-label="Pages" pageCount={3} getHref={(page) => page == 2 ? "javascript:alert(1)" : "/list?page=" + page}>
  <PaginationList>
    <PaginationItem><PaginationLink page={1} /></PaginationItem>
    <PaginationItem><PaginationLink page={2} /></PaginationItem>
  </PaginationList>
</Pagination>`,
    })
    await until(() => expect(container.querySelectorAll('[data-slot="pagination-link"]')).toHaveLength(2))
    const links = [...container.querySelectorAll('[data-slot="pagination-link"]')]
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/list?page=1", null])
    expect(container.querySelector("[form]")).toBeNull()
    expect([...new FormData(form)]).toEqual([["amount", "10"]])
    form.remove()
  })

  test("a drop zone can't be told to take the files dropped on or pasted into the page around it", async () => {
    await preloadUiSdk("FileInput")
    const composer = document.body.appendChild(document.createElement("textarea"))
    composer.id = "composer"
    const { container } = await draw({
      source: `<state where="document" n={0} />
<FileInput aria-label="Files" on:valueChange={n = n + 1}>
  <FileInputDropzone aria-label="Zone" target="document" TARGET="document" pasteTarget="document" paste-target="#composer" PASTETARGET="document" bind:target={where} bind:pasteTarget={where} {...{ target: where, pasteTarget: where }}>Drop here</FileInputDropzone>
</FileInput>
<p>got {n}</p>`,
    })
    const zone = byLabel(container, "Zone")
    const file = new File(["secret"], "passport.png", { type: "image/png" })
    const carry = (type: string, field: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperty(event, field, { value: { types: ["Files"], files: [file], items: [] } })
      return event
    }
    const paste = carry("paste", "clipboardData")
    composer.dispatchEvent(paste)
    document.body.dispatchEvent(carry("drop", "dataTransfer"))
    await until(() => expect(text(container)).toContain("got 0"))
    expect(paste.defaultPrevented).toBe(false)
    zone.dispatchEvent(carry("paste", "clipboardData"))
    await until(() => expect(text(container)).toContain("got 1"))
    composer.remove()
  })

  test("a link the host refuses is not opened by an action either", async () => {
    const opened = vi.spyOn(window, "open").mockImplementation(() => null)
    const { container } = await draw({
      source: `<button on:click={open("https://example.com/a")}>Kept</button>
<button on:click={open("https://evil.test/a")}>Refused</button>`,
      allowUrl: (url) => url.startsWith("https://example.com/"),
    })
    await click(byText(container, "Refused"))
    await click(byText(container, "Kept"))
    expect(opened.mock.calls.map((call) => call[0])).toEqual(["https://example.com/a"])
    opened.mockRestore()
  })

  test("expressions can't reach globals or prototypes", async () => {
    const { container } = await draw({
      source: `<text>[{typeof window}] [{constructor}] [{"a".constructor}] [{[].__proto__}]</text>`,
    })
    expect(text(container)).toBe("[undefined] [] [] []")
  })

  test("an SVG attribute that is CSS can't load anything", async () => {
    const { container } = await draw({
      source: String.raw`<svg viewBox="0 0 10 10">
<defs><linearGradient id="g"><stop stop-color="red" /></linearGradient></defs>
<rect id="kept" width="4" height="4" fill="url(#g)" transform="translate(1 1)" />
<rect id="plain" width="4" height="4" fill="url(https://evil.test/a.svg#p)" />
<rect id="escaped" width="4" height="4" fill="u\72l(https://evil.test/b.svg#p)" filter="\75rl(https://evil.test/c.svg#f)" />
<rect id="set" width="4" height="4" cursor="image-set('https://evil.test/d.png' 1x), auto" />
<rect id="image(1)" class="src(a)" aria-label="Profile image (large)" data-note="url(https://example.com/a)" width="4" height="4" />
</svg>`,
    })
    expect(container.innerHTML).not.toContain("evil.test")
    expect(container.querySelector("#kept")?.getAttribute("fill")).toMatch(/^url\(#/)
    expect(container.querySelector("#kept")?.getAttribute("transform")).toBe("translate(1 1)")
    expect(container.querySelector("#escaped")?.getAttribute("width")).toBe("4")
    // A name or a label is text, not CSS, so it may spell anything.
    const labelled = byLabel(container, "Profile image (large)")
    expect(labelled.getAttribute("id")).toBe("image(1)")
    expect(labelled.getAttribute("class")).toContain("src(a)")
    expect(labelled.getAttribute("data-note")).toBe("url(https://example.com/a)")
  })

  test("model CSS can't reach the page through the surface's own name", async () => {
    const { container } = await draw({
      source: String.raw`<style>
.app:has(&) .sidebar, & + .next, ~ * { display: none }
.card { --x: \{ } } .page { display: none }
.card { --y: \" ; background: url(https://evil.test/a.png) ; --z: " }
</style>
<div class="card">Hi</div>`,
    })
    const root = `.iui-root[data-iui-id="${container.getAttribute("data-iui-id")}"]`
    const guard = `:where(${root}, ${root} *)`
    const css = [...container.querySelectorAll("style")].map((el) => el.textContent).join("\n")
    expect(css).toContain(`.app:has(&) .sidebar${guard}, & + .next${guard}, ~ *${guard} { display: none }`)
    expect(css).not.toContain("evil.test")
    // The surface's rule is the only thing at the top level, and it ends last.
    const model = css.slice(css.lastIndexOf(`${root} {\n.app`)).trimEnd()
    expect(topLevelCloses(model)).toEqual([model.length - 1])
  })

  test("model CSS is confined to its surface", async () => {
    const { container } = await draw({
      source: `<style>
body { display: none }
.hero { color: red; position: fixed; background: url(https://evil.test/a.png) }
@keyframes glow { to { opacity: 0.5 } }
.hero { animation: glow 1s }
@import url("https://evil.test/x.css");
</style>
<div class="hero">Hi</div>`,
    })
    const id = container.getAttribute("data-iui-id")
    const css = [...container.querySelectorAll("style")].map((el) => el.textContent).join("\n")
    expect(css).toContain(`.iui-root[data-iui-id="${id}"] {`)
    expect(css).not.toContain("evil.test")
    expect(css).not.toContain("@import")
    expect(css).not.toContain("position: fixed")
    expect(css).toContain(`@keyframes iui-${id}-glow`)
    expect(css).toContain(`animation: iui-${id}-glow 1s`)
    expect(css).not.toMatch(/(^|\n)\s*body\s*\{/)
  })
})

describe("motion hooks", () => {
  test("motion, delay and stagger become CSS hooks", async () => {
    const { container } = await draw({
      source: `<row stagger={60}><card motion="scale" delay={120}>A</card><card>B</card></row>`,
    })
    const row = container.querySelector<HTMLElement>(".iui-row")
    expect(row?.hasAttribute("data-iui-stagger")).toBe(true)
    expect(row?.style.getPropertyValue("--iui-stagger")).toBe("60ms")
    const card = container.querySelector<HTMLElement>(".iui-card")
    expect(card?.getAttribute("data-iui-motion")).toBe("scale")
    expect(card?.style.getPropertyValue("--iui-delay")).toBe("120ms")
  })

  test("a bare stagger leaves the pause to the design", async () => {
    const { container } = await draw({ source: `<row stagger><card>A</card><card>B</card></row>` })
    const row = container.querySelector<HTMLElement>(".iui-row")
    expect(row?.hasAttribute("data-iui-stagger")).toBe(true)
    expect(row?.style.getPropertyValue("--iui-stagger")).toBe("")
  })

  test("show mounts and unmounts with state", async () => {
    const { container } = await draw({
      source: `<state open={false} />
<button on:click={open = !open}>Toggle</button>
<card show={open}>Details</card>`,
    })
    expect(container.querySelector(".iui-card")).toBeNull()
    await click(byText(container, "Toggle"))
    expect(container.querySelector(".iui-presence .iui-card")?.textContent).toBe("Details")
    await click(byText(container, "Toggle"))
    expect(container.querySelector(".iui-card")).toBeNull()
  })

  test("show keeps an element until its exit animation ends", async () => {
    let finish = () => {}
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const animations = vi
      .spyOn(Element.prototype, "getAnimations")
      .mockReturnValue([{ finished } as unknown as Animation])
    const { container } = await draw({
      source: `<state open={true} />
<button on:click={open = !open}>Toggle</button>
<card show={open}>Details</card>`,
    })
    await click(byText(container, "Toggle"))
    expect(container.querySelector(".iui-presence")?.hasAttribute("data-iui-exit")).toBe(true)
    expect(container.querySelector(".iui-card")).not.toBeNull()
    finish()
    await flushPromises()
    expect(container.querySelector(".iui-card")).toBeNull()
    animations.mockRestore()
  })

  test("morph runs the change inside a view transition", async () => {
    const started = vi.fn((update: () => unknown) => {
      const finished = Promise.resolve(update())
      return { finished }
    })
    Object.assign(document, { startViewTransition: started })
    const { container } = await draw({
      source: `<state big={false} />
<card morph="hero" on:click={big = !big}>{big ? "Large" : "Small"}</card>`,
    })
    await click(byText(container, "Small"))
    await flushPromises()
    expect(started).toHaveBeenCalledTimes(1)
    expect(text(container)).toBe("Large")
    Reflect.deleteProperty(document, "startViewTransition")
  })

  test("a morph on one surface leaves another surface's names to its own morph", async () => {
    const finish: (() => void)[] = []
    Object.assign(document, {
      startViewTransition: (update: () => unknown) => {
        update()
        return { finished: new Promise<void>((resolve) => finish.push(resolve)) }
      },
    })
    const box = { width: 10, height: 10, top: 0, left: 0, bottom: 10, right: 10 } as DOMRect
    const boxes = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(box)
    const surface = (name: string) => {
      const root = document.createElement("div")
      root.innerHTML = `<div data-iui-morph="${name}"></div>`
      document.body.append(root)
      afterTest(() => root.remove())
      return root
    }
    const first = surface("a")
    const second = surface("b")
    const name = (root: HTMLElement) => (root.firstElementChild as HTMLElement).style.viewTransitionName
    runMorph(() => first, () => {})
    runMorph(() => second, () => {})
    expect([name(first), name(second)]).toEqual(["a", "b"])
    finish[0]?.()
    await flushPromises()
    expect([name(first), name(second)]).toEqual(["", "b"])
    finish[1]?.()
    await flushPromises()
    expect([name(first), name(second)]).toEqual(["", ""])
    boxes.mockRestore()
    first.remove()
    second.remove()
    Reflect.deleteProperty(document, "startViewTransition")
  })
})

describe("UI SDK components", () => {
  const tabs = `<Tabs defaultValue="plan">
  <TabsList aria-label="Sections">
    <TabsTab value="plan">Plan</TabsTab>
    <TabsTab value="cost">Cost</TabsTab>
  </TabsList>
  <TabsPanel value="plan">The plan</TabsPanel>
  <TabsPanel value="cost">The cost</TabsPanel>
</Tabs>`

  test("load on first use and render", async () => {
    const { container } = drawNow({ source: tabs })
    await until(() => expect(container.querySelector('[data-slot="tabs"]')).not.toBeNull())
    expect(byRole(container, "tab")).toHaveLength(2)
    expect(byRole(container, "tab", "Plan")[0]?.hasAttribute("data-selected")).toBe(true)
  })

  test("bind:value connects a component to state both ways", async () => {
    await preloadUiSdk("Tabs", "Button")
    const { container } = await draw({
      source: `<state tab="plan" />
${tabs.replace('defaultValue="plan"', "bind:value={tab}")}
<Button variant="solid" on:click={tab = "plan"}>Back to plan</Button>
<text>Now: {tab}</text>`,
    })
    const cost = byRole(container, "tab", "Cost")[0] as HTMLElement
    await click(cost)
    await until(() => expect(text(container)).toContain("Now: cost"))
    expect(cost.hasAttribute("data-selected")).toBe(true)
    const button = byRole(container, "button", "Back to plan")[0] as HTMLElement
    expect(button.getAttribute("data-variant")).toBe("solid")
    await click(button)
    await until(() => expect(text(container)).toContain("Now: plan"))
    expect(byRole(container, "tab", "Plan")[0]?.hasAttribute("data-selected")).toBe(true)
  })

  test("bind:checked on a Switch and bind:value on an Input", async () => {
    await preloadUiSdk("Switch", "Input")
    const { container } = await draw({
      source: `<state on={false} name="" />
<label>Alerts <Switch bind:checked={on}><SwitchThumb /></Switch></label>
<Input aria-label="Name" bind:value={name} />
<text>{on ? "on" : "off"} / {name}</text>`,
    })
    await click(byRole(container, "switch")[0] as HTMLElement)
    await until(() => expect(text(container)).toContain("on /"))
    await type(byLabel<HTMLInputElement>(container, "Name"), "Ada")
    await until(() => expect(text(container)).toContain("on / Ada"))
  })

  test("a button that holds only an icon is marked as one", async () => {
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<Button aria-label="Close"><icon name="x" /></Button><Button>Close <icon name="x" /></Button>`,
    })
    const [only, both] = byRole(container, "button")
    expect(only?.hasAttribute("data-iui-icon-only")).toBe(true)
    expect(both?.hasAttribute("data-iui-icon-only")).toBe(false)
  })
})

describe("children as a function of component state", () => {
  test("let: passes what the component provides to the children", async () => {
    await preloadUiSdk("Calendar", "Pagination", "Progress")
    const { container } = await draw({
      source: `<state day="2026-10-16" page={2} pct={40} />
<Calendar bind:value={day}>
  <CalendarHeading />
  <CalendarGrid>
    <CalendarWeekdays let:index><CalendarWeekday index={index} /></CalendarWeekdays>
    <CalendarWeeks let:cell><CalendarDay value={cell.date} /></CalendarWeeks>
  </CalendarGrid>
</Calendar>
<text>Day {day}</text>
<Pagination aria-label="Pages" pageCount={10} bind:page={page}>
  <PaginationList let:pages>
    {#each pages.items as item (item)}
      <PaginationItem>
        {#if typeof item == "number"}<PaginationLink page={item} />{:else}<PaginationEllipsis />{/if}
      </PaginationItem>
    {/each}
  </PaginationList>
</Pagination>
<text>Page {page}</text>
<Progress value={pct}>
  <ProgressValue let:progress>{progress.value} of 100</ProgressValue>
</Progress>
<button on:click={pct = 75}>More</button>`,
    })
    await until(() =>
      expect(container.querySelectorAll('[data-slot="calendar-weekday"]')).toHaveLength(7)
    )
    expect(container.querySelector('[data-slot="calendar-day"][data-selected]')?.textContent).toBe(
      "16"
    )
    await click(byLabel(container, "Tuesday, October 20, 2026"))
    await until(() => expect(text(container)).toContain("Day 2026-10-20"))

    const links = () => [...container.querySelectorAll<HTMLElement>('[data-slot="pagination-link"]')]
    expect(links().length).toBeGreaterThan(3)
    await click(links().find((link) => link.textContent === "5") as HTMLElement)
    await until(() => expect(text(container)).toContain("Page 5"))
    expect(container.querySelector("[data-current]")?.textContent).toBe("5")

    expect(text(container)).toContain("40 of 100")
    await click(byText(container, "More"))
    await until(() => expect(text(container)).toContain("75 of 100"))
  })
})
