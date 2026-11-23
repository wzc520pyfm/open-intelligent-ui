import { flushPromises, mount } from "@vue/test-utils"
import { describe, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"
import { IntelligentUI, type IntelligentUIHandle, preloadUiSdk } from "../src"
import { byLabel, byRole, byText, click, draw, text, type, until } from "./helpers"

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
    const view = mount(IntelligentUI, {
      props: { source: "Hello" },
      attrs: { class: "mine", style: "max-width: 40rem" },
    })
    await flushPromises()
    expect(view.element.className).toBe("iui-root mine")
    expect((view.element as HTMLElement).style.maxWidth).toBe("40rem")
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
<box aria-label="Pad" on:pointermove={moved += 1}>pad</box>
<text>{key} {moved}</text>`,
    })
    const field = byLabel(container, "Field")
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
    field.dispatchEvent(new KeyboardEvent("keyup", { key: "a", bubbles: true }))
    byLabel(container, "Pad").dispatchEvent(new Event("pointermove", { bubbles: true }))
    await flushPromises()
    expect(text(container)).toBe("pada! 1")
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
    const Map = defineComponent({
      props: { city: String, zoom: Number },
      emits: ["pick"],
      setup: (props, { emit, slots }) => () =>
        h("div", { "data-testid": "map", onClick: () => emit("pick", props.city) }, [
          `${props.city}@${props.zoom}`,
          slots.default?.(),
        ]),
    })
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

  test("bind: works with a component built for v-model", async () => {
    const Stepper = defineComponent({
      props: { value: { type: Number, default: 0 } },
      emits: ["update:value"],
      setup: (props, { emit }) => () =>
        h("button", { onClick: () => emit("update:value", props.value + 1) }, `Step ${props.value}`),
    })
    const { container } = await draw({
      source: `<state n={2} />\n<Stepper bind:value={n} />\n<text>n is {n}</text>`,
      components: { Stepper },
    })
    await click(byText(container, "Step 2"))
    expect(text(container)).toBe("Step 3n is 3")
  })

  test("one failing component doesn't take down the surface", async () => {
    const Broken = defineComponent({
      render() {
        throw new Error("boom")
      },
    })
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
    let broken = true
    const Flaky = defineComponent({
      render() {
        if (broken) throw new Error("boom")
        return h("span", "fine")
      },
    })
    const { view, container } = await draw({ source: "<Flaky />", components: { Flaky } })
    expect(container.querySelector(".iui-error")).not.toBeNull()
    broken = false
    await view.setProps({ source: "<Flaky />\n" })
    expect(container.querySelector(".iui-error")).toBeNull()
    expect(text(container)).toBe("fine")
  })

  test("while streaming a failed block stays hidden", async () => {
    const Broken = defineComponent({
      render() {
        throw new Error("boom")
      },
    })
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
    const view = mount(IntelligentUI, {
      attachTo: document.body,
      props: {
        tools,
        onTool,
        source: `<state draft="Review" />
<query id="tasks" tool="listTasks" />
{#if tasks.loading && !tasks.data}<text>Loading</text>{/if}
{#each tasks.data ?? [] as task (task.id)}<text block>{task.title}</text>{/each}
<button on:click={await call("addTask", { title: draft }); draft = ""}>Add</button>`,
      },
    })
    const container = view.element as HTMLElement
    await view.vm.$nextTick()
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

  test("markup can't set HTML or reach Vue's own attribute syntax", async () => {
    const { container } = await draw({
      source: `<state bag={{ innerHTML: "<b>x</b>", ".innerHTML": "<b>y</b>", "^onclick": "alert(1)", onClick: "alert(1)", title: "ok" }} />
<div aria-label="Target" {...bag} innerHTML="<i>z</i>" v-html="<u>w</u>" ref="r">safe</div>`,
    })
    const target = byLabel(container, "Target")
    expect(target.innerHTML).toBe("safe")
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
    const Plain = defineComponent({ render: () => h("a", { href: "https://example.com/a" }, "plain") })
    const { container } = await draw({
      source: `<state bag={{}} html={null} />
<button on:click={bag = { outerHTML: "<img id='pwn' src='x'>", innerHTML: "<img id='pwn' src='x'>", textContent: "gone", innerText: "gone", hostname: "evil.test", protocol: "javascript", title: "ok" }; html = "<img id='pwn' src='x'>"}>go</button>
<Button aria-label="Kept" {...bag} bind:outerHTML={html}><icon name="x" /></Button>
<Toolbar aria-label="Tools"><ToolbarLink href="https://example.com/a" {...bag}>link</ToolbarLink></Toolbar>
<Plain {...bag} />`,
      components: { Plain },
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

  test("markup can't hook into Vue's own lifecycle", async () => {
    await preloadUiSdk("Button")
    const Plain = defineComponent({ props: { label: String }, render: () => h("span", "plain") })
    const { container } = await draw({
      source: `<state seen={null} hook={v => seen = "bound"} />
<Button on:vnode-mounted={seen = "event"} onVnodeMounted={v => seen = v} onVnodeBeforeMount={seen = "before"} bind:onVnodeUpdated={hook}>One</Button>
<Plain on:vnodeMounted={seen = "plain"} onVnodeMounted={seen = "plain"} />
<div on:vnode-mounted={seen = "div"} onVnodeMounted={seen = "div"}>Two</div>
<card onVnodeMounted={seen = "card"}>Three</card>
<text>seen: {seen ?? "nothing"}</text>`,
      components: { Plain },
    })
    await flushPromises()
    expect(text(container)).toContain("seen: nothing")
  })

  test("the host can refuse URLs", async () => {
    const { container } = await draw({
      source: `<a href="https://example.com/a">link</a><image src="https://cdn.test/a.png" alt="A" />`,
      allowUrl: (url) => url.startsWith("https://example.com/"),
    })
    expect(byText(container, "link").getAttribute("href")).toBe("https://example.com/a")
    expect(container.querySelector("img")).toBeNull()
  })

  test("expressions can't reach globals or prototypes", async () => {
    const { container } = await draw({
      source: `<text>[{typeof window}] [{constructor}] [{"a".constructor}] [{[].__proto__}]</text>`,
    })
    expect(text(container)).toBe("[undefined] [] [] []")
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
    const view = mount(IntelligentUI, { attachTo: document.body, props: { source: tabs } })
    const container = view.element as HTMLElement
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
