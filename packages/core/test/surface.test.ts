import { describe, expect, test, vi } from "vitest"
import { parseProgram, run } from "../src/expr"
import { parse } from "../src/markup"
import { Surface, type SurfaceAction, type ToolEvent } from "../src/runtime/surface"

function act(surface: Surface, source: string): unknown {
  return run(parseProgram(source), surface.scope.child(), surface.host)
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("state", () => {
  test("declares state and derived values", () => {
    const surface = new Surface()
    surface.update(
      parse(`<state guests={6} name="Roast" items={[{ grams: 250 }, { grams: 180 }]} />
<derive perGuest={sum(items.map(i => i.grams))} total={perGuest * guests} />`)
    )
    expect(surface.snapshot()).toEqual({
      guests: 6,
      name: "Roast",
      items: [{ grams: 250 }, { grams: 180 }],
    })
    expect(surface.get("perGuest")).toBe(430)
    expect(surface.get("total")).toBe(2580)
    surface.set("guests", 2)
    expect(surface.get("total")).toBe(860)
  })

  test("re-parsing while streaming keeps what the user changed", () => {
    const surface = new Surface()
    surface.update(parse("<state count={1} />", { streaming: true }))
    surface.set("count", 5)
    surface.update(
      parse('<state count={1} />\n<state label="new" />', { streaming: true })
    )
    expect(surface.snapshot()).toEqual({ count: 5, label: "new" })
    surface.reset()
    expect(surface.snapshot()).toEqual({ count: 1, label: "new" })
  })

  test("notifies subscribers once per change", () => {
    const surface = new Surface()
    surface.update(parse("<state a={1} b={2} />"))
    const listener = vi.fn()
    surface.subscribe(listener)
    surface.set("a", 1)
    expect(listener).toHaveBeenCalledTimes(0)
    surface.set("a", 2)
    surface.patch({ a: 3, b: 4 })
    expect(listener).toHaveBeenCalledTimes(2)
    expect(surface.getVersion()).toBe(2)
  })

  test("event handlers write state", () => {
    const surface = new Surface()
    surface.update(
      parse(`<state todos={[{ title: "a", done: false }]} draft="b" />
<derive open={todos.filter(t => !t.done).length} />`)
    )
    act(surface, "todos.push({ title: draft, done: false }); draft = ''")
    act(surface, "todos[0].done = true")
    expect(surface.snapshot()).toEqual({
      todos: [
        { title: "a", done: true },
        { title: "b", done: false },
      ],
      draft: "",
    })
    expect(surface.get("open")).toBe(1)
  })

  test("a handler can edit a value it was handed, wherever it lives", () => {
    const surface = new Surface()
    surface.update(
      parse(`<state board={{ cards: [{ id: 1, lane: 0, tags: ["a"] }, { id: 2, lane: 1, tags: [] }] }} />`)
    )
    const board = surface.get("board") as { cards: { id: number; lane: number; tags: string[] }[] }
    const first = board.cards[0]

    // A component prop: a local name that holds an object from state.
    const prop = surface.scope.child().declare("card", first)
    run(parseProgram("card.lane += 2; card.tags.push('b')"), prop, surface.host)
    expect(surface.get("board")).toEqual({
      cards: [{ id: 1, lane: 2, tags: ["a", "b"] }, { id: 2, lane: 1, tags: [] }],
    })
    expect(board.cards[0]).toEqual({ id: 1, lane: 0, tags: ["a"] })

    // An item of a filtered list.
    act(surface, "board.cards.filter(c => c.id == 2)[0].lane = 3")
    expect((surface.get("board") as typeof board).cards[1]?.lane).toBe(3)

    // A value that isn't in state stays local.
    expect(act(surface, "const made = { n: 1 }; made.n = 2; made.n")).toBe(2)
    expect(surface.snapshot()).toEqual({ board: surface.get("board") })
  })

  test("derived values can't be assigned and cycles don't hang", () => {
    const warnings: string[] = []
    const surface = new Surface({ onWarning: (message) => warnings.push(message) })
    surface.update(parse("<state n={1} />\n<derive a={b + n} b={a + 1} double={n * 2} />"))
    act(surface, "double = 10")
    expect(surface.get("double")).toBe(2)
    expect(surface.get("a")).toBeNaN()
    expect(warnings).toEqual([
      '"double" is computed and can\'t be assigned',
      '"a" depends on itself',
    ])
  })

  test("initial state wins over declared defaults", () => {
    const surface = new Surface({ initialState: { tab: "costs" } })
    surface.update(parse('<state tab="overview" zoom={1} />'))
    expect(surface.snapshot()).toEqual({ tab: "costs", zoom: 1 })
  })

  test("persisted state is restored", () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    }
    const source = '<state persist theme="light" />\n<state draft="" />'
    const first = new Surface({ storage, storageKey: "demo" })
    first.update(parse(source))
    first.set("theme", "dark")
    first.set("draft", "not kept")
    expect(JSON.parse(data.get("iui:demo") ?? "")).toEqual({ theme: "dark" })

    const second = new Surface({ storage, storageKey: "demo" })
    second.update(parse(source))
    expect(second.snapshot()).toEqual({ theme: "dark", draft: "" })
  })

  test("collects templates and styles", () => {
    const surface = new Surface()
    surface.update(
      parse(`<style>.hero { color: red; }</style>
<define name="Metric" props="label, value"><text>{label}: {value}</text></define>
<card><style>.x { gap: 1px; }</style></card>`)
    )
    expect([...surface.templates.keys()]).toEqual(["Metric"])
    expect(surface.styles).toEqual([".hero { color: red; }", ".x { gap: 1px; }"])
  })
})

describe("actions", () => {
  test("send carries the message and the current state", () => {
    const actions: SurfaceAction[] = []
    const surface = new Surface({ onAction: (action) => actions.push(action) })
    surface.update(parse("<state guests={4} />"))
    act(surface, "send(`Plan for ${guests}`, { guests }); open('https://x.dev'); copy('hi'); toast('Saved', 'success')")
    expect(actions).toEqual([
      {
        type: "send",
        text: "Plan for 4",
        data: { guests: 4 },
        state: { guests: 4 },
      },
      { type: "open", url: "https://x.dev" },
      { type: "copy", text: "hi" },
      { type: "toast", message: "Saved", tone: "success" },
    ])
  })

  test("host actions and functions can be added", () => {
    const track = vi.fn()
    const surface = new Surface({
      actions: { track },
      functions: { shout: (text: string) => `${text}!` },
    })
    act(surface, "track(shout('hi'))")
    expect(track).toHaveBeenCalledWith("hi!")
  })
})

describe("queries and tools", () => {
  function setup() {
    const orders = [
      { id: 1, status: "open", total: 40 },
      { id: 2, status: "shipped", total: 15 },
    ]
    const events: ToolEvent[] = []
    const surface = new Surface({
      tools: {
        "orders.list": (input) => {
          const { status } = (input ?? {}) as { status?: string }
          return orders.filter((order) => !status || order.status === status)
        },
        "orders.update": (input) => {
          const { id, status } = input as { id: number; status: string }
          const order = orders.find((item) => item.id === id)
          if (!order) throw new Error("Order not found")
          order.status = status
          return { ok: true }
        },
      },
      onTool: (event) => events.push(event),
    })
    surface.update(
      parse(`<state filter="open" />
<query id="orders" tool="orders.list" input={{ status: filter }} />
<derive revenue={sum((orders.data ?? []).map(o => o.total))} />`)
    )
    return { surface, events }
  }

  test("a query loads once the surface starts", async () => {
    const { surface } = setup()
    expect(surface.get("orders")).toMatchObject({ loading: true, data: undefined })
    surface.start()
    await tick()
    expect(surface.get("orders")).toMatchObject({
      loading: false,
      error: null,
      data: [{ id: 1, status: "open", total: 40 }],
    })
    expect(surface.get("revenue")).toBe(40)
  })

  test("a query reloads when its input changes", async () => {
    const { surface, events } = setup()
    surface.start()
    await tick()
    surface.set("filter", "shipped")
    await tick()
    expect(surface.get("orders")).toMatchObject({
      data: [{ id: 2, status: "shipped", total: 15 }],
    })
    surface.set("filter", "shipped")
    await tick()
    expect(events.filter((event) => event.status === "start")).toHaveLength(2)
  })

  test("writing with call() reloads queries", async () => {
    const { surface, events } = setup()
    surface.start()
    await tick()
    await act(surface, "call('orders.update', { id: 1, status: 'shipped' })")
    await tick()
    expect(surface.get("orders")).toMatchObject({ data: [] })
    expect(
      events.filter((event) => event.status === "done").map((event) => event.kind)
    ).toEqual(["read", "write", "read"])
  })

  test("a failing tool stops the handler and reports the error", async () => {
    const { surface } = setup()
    surface.update(parse('<state note="" />'))
    await expect(
      act(surface, "call('orders.update', { id: 9, status: 'x' }); note = 'saved'")
    ).rejects.toThrow("Order not found")
    expect(surface.get("note")).toBe("")
  })

  test("query errors keep the last data", async () => {
    let fail = false
    const surface = new Surface({
      tools: {
        stats: () => {
          if (fail) throw new Error("Service is down")
          return { visits: 3 }
        },
      },
    })
    surface.update(parse('<query id="stats" tool="stats" />'))
    surface.start()
    await tick()
    fail = true
    surface.refetch("stats")
    await tick()
    expect(surface.get("stats")).toMatchObject({
      data: { visits: 3 },
      error: "Service is down",
      loading: false,
    })
  })

  test("unknown tools and disabled queries", async () => {
    const surface = new Surface()
    surface.update(
      parse(`<state ready={false} />
<query id="a" tool="missing" />
<query id="b" tool="missing" enabled={ready} />`)
    )
    surface.start()
    await tick()
    expect(surface.get("a")).toMatchObject({
      error: 'No tool named "missing" is available',
    })
    expect(surface.get("b")).toMatchObject({ loading: false, error: null })
  })

  test("queries removed from the document are dropped", async () => {
    const { surface } = setup()
    surface.update(parse('<state filter="open" />'))
    expect(surface.get("orders")).toBeUndefined()
  })
})
