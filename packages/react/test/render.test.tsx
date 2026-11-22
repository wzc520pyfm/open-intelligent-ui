import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import { IntelligentUI, type IntelligentUIHandle, preloadUiSdk } from "../src"

/** The words on the surface, without its stylesheets and toasts. */
function text(container: HTMLElement): string {
  const root = container.querySelector(".iui-root")?.cloneNode(true) as HTMLElement
  for (const hidden of root.querySelectorAll("style, .iui-toasts")) hidden.remove()
  return (root.textContent ?? "").replace(/\s+/g, " ").trim()
}

describe("markdown and primitives", () => {
  test("renders Markdown next to layout tags", () => {
    const { container } = render(
      <IntelligentUI
        source={`# Trip plan

Two **great** options:

<row gap="4">
  <card padding="4"><text size="lg" weight="semibold">Kyoto</text></card>
  <card><badge color="success">Cheaper</badge></card>
</row>

- one
- two`}
      />
    )
    expect(container.querySelector("h1")?.textContent).toBe("Trip plan")
    expect(container.querySelector("strong")?.textContent).toBe("great")
    expect(container.querySelectorAll(".iui-card")).toHaveLength(2)
    expect(container.querySelector(".iui-row")).not.toBeNull()
    expect(container.querySelectorAll("li")).toHaveLength(2)
    const card = container.querySelector<HTMLElement>(".iui-card")
    expect(card?.style.padding).toBe("calc(var(--iui-space-unit) * 4)")
    expect(container.querySelector<HTMLElement>(".iui-badge")?.style.getPropertyValue("--iui-tone")).toBe(
      "var(--iui-color-success, success)"
    )
  })

  test("writes the design as CSS variables scoped to this surface", () => {
    const { container } = render(
      <IntelligentUI
        source="Hello"
        design={`---
colors:
  primary: "#ff5500"
---`}
      />
    )
    const root = container.querySelector<HTMLElement>(".iui-root")
    const id = root?.getAttribute("data-iui-id")
    const css = container.querySelector("style")?.textContent ?? ""
    expect(css).toContain(`.iui-root[data-iui-id="${id}"]`)
    expect(css).toContain("--iui-color-primary: #ff5500")
  })

  test("uses the built-in design when none is given", () => {
    const { container } = render(<IntelligentUI source="Hello" />)
    expect(container.querySelector("style")?.textContent).toContain("--iui-color-accent: #2f6feb")
  })
})

describe("state", () => {
  test("declares state, shows it and derives from it", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state price={40} qty={3} />
<derive total={price * qty} />

Total: {currency(total, "USD")}`}
      />
    )
    expect(text(container)).toBe("Total: $120")
  })

  test("bind: on a native input reads and writes state", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state name="Ada" count={2} />
<input aria-label="Name" bind:value={name} />
<input aria-label="Count" type="number" bind:value={count} />
<text>Hello {name}, {count * 2}</text>`}
      />
    )
    const name = screen.getByLabelText<HTMLInputElement>("Name")
    expect(name.value).toBe("Ada")
    fireEvent.change(name, { target: { value: "Grace" } })
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "5" } })
    expect(text(container)).toBe("Hello Grace, 10")
  })

  test("on:click runs statements against state", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state count={0} log={[]} />
<button on:click={count += 1; log = [...log, count]}>Add</button>
<text>{count} / {log.join(",")}</text>`}
      />
    )
    const button = screen.getByText("Add")
    fireEvent.click(button)
    fireEvent.click(button)
    expect(text(container)).toBe("Add2 / 1,2")
  })

  test("writes to an item inside each reach the list", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state todos={[{ title: "Book flights", done: false }, { title: "Pack", done: true }]} />
{#each todos as todo, i (todo.title)}
  <button on:click={todo.done = !todo.done}>{i + 1}. {todo.title}{todo.done ? " ✓" : ""}</button>
{/each}
<text>{todos.filter(t => t.done).length} done</text>`}
      />
    )
    fireEvent.click(screen.getByText(/Book flights/))
    expect(text(container)).toContain("1. Book flights ✓")
    expect(text(container)).toContain("2 done")
  })

  test("if, else if and else follow state", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state step={1} />
<button on:click={step += 1}>Next</button>
{#if step == 1}
  <text>First</text>
{:else if step == 2}
  <text>Second</text>
{:else}
  <text>Done</text>
{/if}`}
      />
    )
    expect(text(container)).toBe("NextFirst")
    fireEvent.click(screen.getByText("Next"))
    expect(text(container)).toBe("NextSecond")
    fireEvent.click(screen.getByText("Next"))
    expect(text(container)).toBe("NextDone")
  })

  test("state survives the source growing while it streams", () => {
    const first = `<state count={0} />
<button on:click={count += 1}>Add</button>
<text>Count {count}</text>`
    const { container, rerender } = render(<IntelligentUI source={first} streaming />)
    fireEvent.click(screen.getByText("Add"))
    rerender(<IntelligentUI source={`${first}\n\nAnd **more** text`} streaming />)
    expect(text(container)).toBe("AddCount 1And more text")
    rerender(<IntelligentUI source={`${first}\n\nAnd **more** text`} />)
    expect(text(container)).toBe("AddCount 1And more text")
  })

  test("a half-written document renders what is complete", () => {
    const source = `<state tab="a" />
<card>
  <title>Budget</title>
  <row><text>Spent</text><badge color="warn`
    const { container } = render(<IntelligentUI source={source} streaming />)
    expect(container.querySelector(".iui-title")?.textContent).toBe("Budget")
    expect(text(container)).toBe("BudgetSpent")
  })

  test("the host can read and write state through the ref", () => {
    const ref = { current: null as IntelligentUIHandle | null }
    const onStateChange = vi.fn()
    const { container } = render(
      <IntelligentUI
        ref={ref}
        source={`<state city="Kyoto" />\n<text>{city}</text>`}
        onStateChange={onStateChange}
      />
    )
    expect(ref.current?.getState()).toEqual({ city: "Kyoto" })
    act(() => ref.current?.setState({ city: "Osaka" }))
    expect(text(container)).toBe("Osaka")
    expect(onStateChange).toHaveBeenLastCalledWith({ city: "Osaka" })
  })
})

describe("components", () => {
  test("define makes a reusable component with props and a slot", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state unit="km" />
<define name="Metric" props="label, value">
  <card><text>{label}: {value} {unit}</text><slot /></card>
</define>
<Metric label="Distance" value={12}><badge>new</badge></Metric>
<Metric label="Climb" value={3 * 2} />`}
      />
    )
    expect(container.querySelectorAll(".iui-card")).toHaveLength(2)
    expect(text(container)).toBe("Distance: 12 kmnewClimb: 6 km")
  })

  test("a component that defines itself in terms of itself stops", () => {
    const onWarning = vi.fn()
    render(
      <IntelligentUI
        source={`<define name="Loop"><Loop /></define>\n<Loop />`}
        onWarning={onWarning}
      />
    )
    return waitFor(() =>
      expect(onWarning).toHaveBeenCalledWith("<Loop> is nested inside itself too deeply")
    )
  })

  test("host components are used by name and get evaluated props", () => {
    const Map = (props: { city: string; zoom: number }) => (
      <div data-testid="map">
        {props.city}@{props.zoom}
      </div>
    )
    render(
      <IntelligentUI
        source={`<state city="Lisbon" />\n<Map city={city} zoom={4 + 1} />`}
        components={{ Map: Map as never }}
      />
    )
    expect(screen.getByTestId("map").textContent).toBe("Lisbon@5")
  })

  test("one failing component doesn't take down the surface", () => {
    const Broken = () => {
      throw new Error("boom")
    }
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const { container } = render(
      <IntelligentUI
        source={`<text>Before</text>\n<Broken />\n<text>After</text>`}
        components={{ Broken: Broken as never }}
      />
    )
    error.mockRestore()
    expect(text(container)).toContain("Before")
    expect(text(container)).toContain("After")
    expect(container.querySelector(".iui-error")?.textContent).toContain("boom")
  })

  test("unknown components render their children and warn", async () => {
    const onWarning = vi.fn()
    const { container } = render(
      <IntelligentUI source={`<Mystery><text>inside</text></Mystery>`} onWarning={onWarning} />
    )
    expect(text(container)).toBe("inside")
    await waitFor(() =>
      expect(onWarning).toHaveBeenCalledWith("<Mystery> is not a known component")
    )
  })
})

describe("presets", () => {
  test("Stat shows a formatted value and its change", () => {
    const { container } = render(
      <IntelligentUI
        source={`<Stat label="Revenue" value="$12.4k" delta={0.082} caption="vs last month" />`}
      />
    )
    expect(container.querySelector(".iui-stat-label")?.textContent).toBe("Revenue")
    expect(container.querySelector(".iui-stat-value")?.textContent).toBe("$12.4k")
    expect(container.querySelector(".iui-stat-delta")?.getAttribute("data-tone")).toBe("success")
    expect(container.querySelector(".iui-stat-delta")?.textContent).toBe("8.2%")
  })

  test("DataTable sorts and reports the selected row", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state picked={null} rows={[
  { name: "Pear", price: 3 },
  { name: "Apple", price: 5 },
  { name: "Fig", price: 1 }
]} />
<DataTable data={rows} columns={["name", { key: "price", format: "currency" }]} sortable onSelect={row => picked = row.name} />
<text>Picked: {picked ?? "none"}</text>`}
      />
    )
    const names = () =>
      [...container.querySelectorAll("tbody tr td:first-child")].map((cell) => cell.textContent)
    expect(names()).toEqual(["Pear", "Apple", "Fig"])
    fireEvent.click(screen.getByText("Price"))
    expect(names()).toEqual(["Fig", "Pear", "Apple"])
    fireEvent.click(screen.getByText("Apple"))
    expect(text(container)).toContain("Picked: Apple")
  })

  test("Chart draws one bar per row from state", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state sales={[{ month: "Jan", total: 4 }, { month: "Feb", total: 9 }, { month: "Mar", total: 6 }]} />
<Chart type="bar" data={sales} x="month" y="total" aria-label="Sales by month" />`}
      />
    )
    const chart = container.querySelector(".iui-chart")
    expect(chart?.getAttribute("aria-label")).toBe("Sales by month")
    expect(container.querySelectorAll(".iui-chart-bar")).toHaveLength(3)
  })

  test("a fenced code block becomes a CodeBlock", () => {
    const { container } = render(
      <IntelligentUI source={"```ts\nconst a = {b: 1}\n```"} />
    )
    expect(container.querySelector(".iui-code pre")?.textContent).toBe("const a = {b: 1}")
    expect(container.querySelector(".iui-code-bar")?.textContent).toContain("ts")
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
    const { container } = render(
      <IntelligentUI
        tools={tools}
        onTool={onTool}
        source={`<state draft="Review" />
<query id="tasks" tool="listTasks" />
{#if tasks.loading && !tasks.data}<text>Loading</text>{/if}
{#each tasks.data ?? [] as task (task.id)}<text block>{task.title}</text>{/each}
<button on:click={await call("addTask", { title: draft }); draft = ""}>Add</button>`}
      />
    )
    expect(text(container)).toContain("Loading")
    await waitFor(() => expect(text(container)).toContain("Draft"))
    fireEvent.click(screen.getByText("Add"))
    await waitFor(() => expect(text(container)).toContain("Review"))
    expect(tools.addTask).toHaveBeenCalledWith({ title: "Review" })
    expect(tools.listTasks).toHaveBeenCalledTimes(2)
    expect(onTool).toHaveBeenCalledWith(
      expect.objectContaining({ tool: "addTask", kind: "write", status: "done" })
    )
  })

  test("send hands the host a message with the surface state", () => {
    const onAction = vi.fn()
    render(
      <IntelligentUI
        onAction={onAction}
        source={`<state pick="Kyoto" />
<button on:click={send("Book " + pick, { city: pick })}>Book</button>`}
      />
    )
    fireEvent.click(screen.getByText("Book"))
    expect(onAction).toHaveBeenCalledWith({
      type: "send",
      text: "Book Kyoto",
      data: { city: "Kyoto" },
      state: { pick: "Kyoto" },
    })
  })

  test("a failing action shows a toast instead of throwing", async () => {
    const { container } = render(
      <IntelligentUI source={`<button on:click={await call("missing")}>Go</button>`} />
    )
    fireEvent.click(screen.getByText("Go"))
    await waitFor(() =>
      expect(container.querySelector(".iui-toast")?.textContent).toBe(
        'No tool named "missing" is available'
      )
    )
  })

  test("toast() shows a message with its tone", () => {
    const { container } = render(
      <IntelligentUI source={`<button on:click={toast("Saved", "success")}>Save</button>`} />
    )
    fireEvent.click(screen.getByText("Save"))
    const toast = container.querySelector(".iui-toast")
    expect(toast?.textContent).toBe("Saved")
    expect(toast?.getAttribute("data-tone")).toBe("success")
  })
})

describe("safety", () => {
  test("drops script, inline handlers and unsafe URLs", () => {
    const { container } = render(
      <IntelligentUI
        source={`<script>window.hacked = true</script>
<a href="javascript:alert(1)">bad link</a>
<a href="https://example.com/a">good link</a>
<div onclick="alert(1)" style="background: url(https://evil.test/x.png); color: red">box</div>
<img src="https://example.com/pic.png" onerror="alert(1)" alt="pic">
<iframe src="https://evil.test"></iframe>
<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><circle r="2" onclick="alert(1)" /></a><foreignObject><div>x</div></foreignObject></svg>`}
      />
    )
    expect(container.querySelector("script, iframe, foreignObject")).toBeNull()
    expect(screen.getByText("bad link").getAttribute("href")).toBeNull()
    const good = screen.getByText("good link")
    expect(good.getAttribute("href")).toBe("https://example.com/a")
    expect(good.getAttribute("rel")).toBe("noopener noreferrer")
    const box = screen.getByText("box")
    expect(box.getAttribute("onclick")).toBeNull()
    expect(box.style.color).toBe("red")
    expect(box.getAttribute("style")).not.toContain("url")
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull()
    expect(container.querySelector("svg a")?.getAttribute("href")).toBeNull()
    expect(container.querySelector("circle")?.getAttribute("onclick")).toBeNull()
  })

  test("the host can refuse URLs", () => {
    const { container } = render(
      <IntelligentUI
        source={`<a href="https://example.com/a">link</a><image src="https://cdn.test/a.png" alt="A" />`}
        allowUrl={(url) => url.startsWith("https://example.com/")}
      />
    )
    expect(screen.getByText("link").getAttribute("href")).toBe("https://example.com/a")
    expect(container.querySelector("img")).toBeNull()
  })

  test("expressions can't reach globals or prototypes", () => {
    const { container } = render(
      <IntelligentUI
        source={`<text>[{typeof window}] [{constructor}] [{"a".constructor}] [{[].__proto__}]</text>`}
      />
    )
    expect(text(container)).toBe("[undefined] [] [] []")
  })

  test("model CSS is confined to its surface", () => {
    const { container } = render(
      <IntelligentUI
        source={`<style>
body { display: none }
.hero { color: red; position: fixed; background: url(https://evil.test/a.png) }
@keyframes glow { to { opacity: 0.5 } }
.hero { animation: glow 1s }
@import url("https://evil.test/x.css");
</style>
<div class="hero">Hi</div>`}
      />
    )
    const id = container.querySelector(".iui-root")?.getAttribute("data-iui-id")
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
  test("motion, delay and stagger become CSS hooks", () => {
    const { container } = render(
      <IntelligentUI
        source={`<row stagger={60}><card motion="scale" delay={120}>A</card><card>B</card></row>`}
      />
    )
    const row = container.querySelector<HTMLElement>(".iui-row")
    expect(row?.hasAttribute("data-iui-stagger")).toBe(true)
    expect(row?.style.getPropertyValue("--iui-stagger")).toBe("60ms")
    const card = container.querySelector<HTMLElement>(".iui-card")
    expect(card?.getAttribute("data-iui-motion")).toBe("scale")
    expect(card?.style.getPropertyValue("--iui-delay")).toBe("120ms")
  })

  test("show mounts and unmounts with state", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state open={false} />
<button on:click={open = !open}>Toggle</button>
<card show={open}>Details</card>`}
      />
    )
    expect(container.querySelector(".iui-card")).toBeNull()
    fireEvent.click(screen.getByText("Toggle"))
    expect(container.querySelector(".iui-card")?.textContent).toBe("Details")
    fireEvent.click(screen.getByText("Toggle"))
    expect(container.querySelector(".iui-card")).toBeNull()
  })
})

describe("UI SDK components", () => {
  test("load on first use and render", async () => {
    const { container } = render(
      <IntelligentUI
        source={`<Tabs defaultValue="plan">
  <TabsList aria-label="Sections">
    <TabsTab value="plan">Plan</TabsTab>
    <TabsTab value="cost">Cost</TabsTab>
  </TabsList>
  <TabsPanel value="plan">The plan</TabsPanel>
  <TabsPanel value="cost">The cost</TabsPanel>
</Tabs>`}
      />
    )
    expect(container.querySelector('[data-slot="tabs"]')).toBeNull()
    await waitFor(() => expect(container.querySelector('[data-slot="tabs"]')).not.toBeNull())
    expect(screen.getAllByRole("tab")).toHaveLength(2)
    expect(screen.getByRole("tab", { name: "Plan" }).hasAttribute("data-selected")).toBe(true)
  })

  test("bind:value connects a component to state both ways", async () => {
    await preloadUiSdk("Tabs", "Button")
    const { container } = render(
      <IntelligentUI
        source={`<state tab="plan" />
<Tabs bind:value={tab}>
  <TabsList aria-label="Sections">
    <TabsTab value="plan">Plan</TabsTab>
    <TabsTab value="cost">Cost</TabsTab>
  </TabsList>
  <TabsPanel value="plan">The plan</TabsPanel>
  <TabsPanel value="cost">The cost</TabsPanel>
</Tabs>
<Button variant="solid" on:click={tab = "plan"}>Back to plan</Button>
<text>Now: {tab}</text>`}
      />
    )
    const cost = screen.getByRole("tab", { name: "Cost" })
    fireEvent.click(cost)
    await waitFor(() => expect(text(container)).toContain("Now: cost"))
    expect(cost.hasAttribute("data-selected")).toBe(true)
    const button = screen.getByRole("button", { name: "Back to plan" })
    expect(button.getAttribute("data-variant")).toBe("solid")
    fireEvent.click(button)
    await waitFor(() => expect(text(container)).toContain("Now: plan"))
    expect(screen.getByRole("tab", { name: "Plan" }).hasAttribute("data-selected")).toBe(true)
  })

  test("bind:checked on a Switch and bind:value on an Input", async () => {
    await preloadUiSdk("Switch", "Input")
    const { container } = render(
      <IntelligentUI
        source={`<state on={false} name="" />
<label>Alerts <Switch bind:checked={on}><SwitchThumb /></Switch></label>
<Input aria-label="Name" bind:value={name} />
<text>{on ? "on" : "off"} / {name}</text>`}
      />
    )
    fireEvent.click(screen.getByRole("switch"))
    await waitFor(() => expect(text(container)).toContain("on /"))
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Ada" } })
    await waitFor(() => expect(text(container)).toContain("on / Ada"))
  })
})

describe("children as a function of component state", () => {
  test("let: passes what the component provides to the children", async () => {
    await preloadUiSdk("Calendar", "Pagination", "Progress")
    const { container } = render(
      <IntelligentUI
        source={`<state day="2026-10-16" page={2} />
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
<Progress value={40}>
  <ProgressValue let:progress>{progress.value} of 100</ProgressValue>
</Progress>`}
      />
    )
    await waitFor(() =>
      expect(container.querySelectorAll('[data-slot="calendar-weekday"]')).toHaveLength(7)
    )
    expect(container.querySelector('[data-slot="calendar-day"][data-selected]')?.textContent).toBe(
      "16"
    )
    fireEvent.click(screen.getByLabelText("Tuesday, October 20, 2026"))
    await waitFor(() => expect(text(container)).toContain("Day 2026-10-20"))

    expect(container.querySelectorAll('[data-slot="pagination-link"]').length).toBeGreaterThan(3)
    expect(text(container)).toContain("40 of 100")
  })
})
