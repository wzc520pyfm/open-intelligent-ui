import { flushPromises } from "@vue/test-utils"
import { afterEach, describe, expect, test, vi } from "vitest"
import { preloadUiSdk } from "../src"
import { byLabel, byRole, byText, click, draw, text, type, until } from "./helpers"

// The same promises `packages/react/test/claims.test.tsx` holds React to.
describe("what the prompt promises", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition")
  })

  test("a button stays pending while its handler awaits", async () => {
    await preloadUiSdk("Button")
    let finish: (value: unknown) => void = () => {}
    const createTask = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const { container } = await draw({
      source: `<state done={false} />
<Button on:click={await call("createTask", { title: "A" }); done = true}>Create</Button>
{#if done}<text>Created</text>{/if}`,
      tools: { createTask },
    })
    const button = byRole(container, "button", "Create")[0] as HTMLElement
    await click(button)
    await until(() => expect(button.hasAttribute("data-pending")).toBe(true))
    expect(createTask).toHaveBeenCalledWith({ title: "A" })
    finish({ id: 1 })
    await until(() => expect(button.hasAttribute("data-pending")).toBe(false))
    expect(text(container)).toContain("Created")
  })

  test("keyboard events reach a handler with their key, and blocks run", async () => {
    const { container } = await draw({
      source: `<state draft="" todos={[]} />
<input aria-label="New" bind:value={draft} on:keydown={if ($event.key == "Enter") { todos.push({ title: draft }); draft = "" }} />
{#each todos as todo}<text>{todo.title}</text>{/each}`,
    })
    const input = byLabel<HTMLInputElement>(container, "New")
    await type(input, "Milk")
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }))
    await flushPromises()
    expect(container.querySelectorAll(".iui-text")).toHaveLength(0)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    await flushPromises()
    expect(text(container)).toContain("Milk")
    expect(input.value).toBe("")
  })

  test("DOM event names are matched whatever their casing", async () => {
    const { container } = await draw({
      source: `<state n={0} over={false} />
<div aria-label="t" on:dblclick={n += 1} on:mouseEnter={over = true} onDoubleClick={n += 10}>{n} {over ? "in" : "out"}</div>`,
    })
    const target = byLabel(container, "t")
    target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))
    target.dispatchEvent(new MouseEvent("mouseenter"))
    await flushPromises()
    expect(text(container)).toBe("11 in")
  })

  test("a query written after the interface is on screen still loads", async () => {
    const listOrders = vi.fn(async () => [{ id: "A-1" }])
    const first = "**Orders**\n\n"
    const rest = `<query id="orders" tool="listOrders" />\n{#each orders.data ?? [] as order (order.id)}<text>{order.id}</text>{/each}`
    const { view, container } = await draw({ source: first, streaming: true, tools: { listOrders } })
    expect(listOrders).not.toHaveBeenCalled()
    await view.setProps({ source: first + rest.slice(0, 20) })
    await view.setProps({ source: first + rest })
    await until(() => expect(text(container)).toBe("OrdersA-1"))
    await view.setProps({ streaming: false })
    expect(listOrders).toHaveBeenCalledTimes(1)
  })

  test("a query reloads every few seconds while enabled", async () => {
    vi.useFakeTimers()
    try {
      const getQuote = vi.fn(async () => ({ price: 10 }))
      await draw({
        source: `<state symbol="ACME" />\n<query id="price" tool="getQuote" input={{ symbol }} every={30} enabled={symbol != ""} />`,
        tools: { getQuote },
      })
      await vi.advanceTimersByTimeAsync(10)
      expect(getQuote).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(29_000)
      expect(getQuote).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1_500)
      expect(getQuote).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  test("a query stops reloading once the surface is gone", async () => {
    vi.useFakeTimers()
    try {
      const getQuote = vi.fn(async () => ({ price: 10 }))
      const { view } = await draw({
        source: `<query id="price" tool="getQuote" every={30} />`,
        tools: { getQuote },
      })
      await vi.advanceTimersByTimeAsync(10)
      view.unmount()
      await vi.advanceTimersByTimeAsync(120_000)
      expect(getQuote).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  test("a chart takes design colors and reports the row that was picked", async () => {
    const { container } = await draw({
      source: `<state picked={null} rows={[{ month: "Jan", plan: 10, actual: 8 }, { month: "Feb", plan: 12, actual: 15 }]} />
<Chart type="bar" data={rows} x="month" y={["plan", "actual"]} colors={["chart-3", "accent"]} names={{ plan: "Plan" }} legend on:select={picked = $value} aria-label="Plan against actual" />
<text>{picked ? picked.month : "none"}</text>`,
    })
    expect(container.querySelector(".iui-chart")?.innerHTML).toContain("var(--iui-color-chart-3")
    expect(container.querySelector(".iui-chart")?.innerHTML).toContain("var(--iui-color-accent")
    expect(text(container)).toContain("Plan")
    const bars = container.querySelectorAll(".iui-chart rect")
    expect(bars.length).toBeGreaterThanOrEqual(4)
    await click(bars[bars.length - 1] as Element)
    expect(text(container)).toContain("Feb")
  })

  test("a table reports the row that was picked", async () => {
    const { container } = await draw({
      source: `<state row={null} rows={[{ id: 1, name: "Ada", price: 12 }, { id: 2, name: "Lin", price: 30 }]} />
<DataTable data={rows} columns={["name", { key: "price", label: "Price", format: "currency", align: "right" }]} rowKey="id" on:select={row = $value} selected={row?.id} />
<text>{row ? row.name : "none"}</text>`,
    })
    expect(text(container)).toContain("$12")
    await click(byText(container, "Lin"))
    expect(container.querySelector(".iui-text")?.textContent).toBe("Lin")
    expect(container.querySelector("tr[aria-selected='true'], tr[data-selected]")).not.toBeNull()
  })

  test("morph runs handlers inside a view transition", async () => {
    const names: string[][] = []
    const start = vi.fn((update: () => unknown) => {
      const named = () =>
        [...document.querySelectorAll<HTMLElement>("[data-iui-morph]")].map(
          (element) => element.style.viewTransitionName
        )
      names.push(named())
      const finished = Promise.resolve(update()).then(() => {
        names.push(named())
      })
      return { finished }
    })
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const hidden = this.textContent === "Below the fold"
      const top = hidden ? 5000 : 10
      return { top, left: 10, bottom: top + 40, right: 210, width: 200, height: 40, x: 10, y: top, toJSON() {} }
    })
    const { container } = await draw({
      source: `<state big={false} />
<card morph="hero" on:click={big = !big}>{big ? "Large" : "Small"}</card>
<card morph="hero">Same name again</card>
<card morph="far">Below the fold</card>`,
    })
    const card = container.querySelector<HTMLElement>(".iui-card") as HTMLElement
    expect(card.style.viewTransitionName).toBe("")
    await click(card)
    expect(start).toHaveBeenCalledTimes(1)
    expect(card.textContent).toBe("Large")
    expect(names).toEqual([
      ["hero", "", ""],
      ["hero", "", ""],
    ])
    await until(() => expect(card.style.viewTransitionName).toBe(""))
    rect.mockRestore()
  })

  test("without morph, handlers run directly", async () => {
    const start = vi.fn()
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
    const { container } = await draw({ source: `<state n={0} />\n<card on:click={n += 1}>{n}</card>` })
    await click(container.querySelector(".iui-card") as HTMLElement)
    expect(start).not.toHaveBeenCalled()
    expect(text(container)).toBe("1")
  })
})
