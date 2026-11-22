import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { IntelligentUI, type IntelligentUIHandle, preloadUiSdk } from "../src"

function text(container: HTMLElement): string {
  const root = container.querySelector(".iui-root")?.cloneNode(true) as HTMLElement
  for (const hidden of root.querySelectorAll("style, .iui-toasts")) hidden.remove()
  return (root.textContent ?? "").replace(/\s+/g, " ").trim()
}

describe("what the prompt promises", () => {
  afterEach(() => {
    Reflect.deleteProperty(document, "startViewTransition")
  })

  test("a button stays pending while its handler awaits", async () => {
    await preloadUiSdk("Button")
    let finish: (value: unknown) => void = () => {}
    const createTask = vi.fn(() => new Promise((resolve) => (finish = resolve)))
    const { container } = render(
      <IntelligentUI
        source={`<state done={false} />
<Button on:click={await call("createTask", { title: "A" }); done = true}>Create</Button>
{#if done}<text>Created</text>{/if}`}
        tools={{ createTask }}
      />
    )
    const button = screen.getByRole("button", { name: "Create" })
    fireEvent.click(button)
    await waitFor(() => expect(button.hasAttribute("data-pending")).toBe(true))
    expect(createTask).toHaveBeenCalledWith({ title: "A" })
    await act(async () => {
      finish({ id: 1 })
    })
    await waitFor(() => expect(button.hasAttribute("data-pending")).toBe(false))
    expect(text(container)).toContain("Created")
  })

  test("keyboard events reach a handler with their key, and blocks run", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state draft="" todos={[]} />
<input aria-label="New" bind:value={draft} on:keydown={if ($event.key == "Enter") { todos.push({ title: draft }); draft = "" }} />
{#each todos as todo}<text>{todo.title}</text>{/each}`}
      />
    )
    const input = screen.getByLabelText("New") as HTMLInputElement
    fireEvent.change(input, { target: { value: "Milk" } })
    fireEvent.keyDown(input, { key: "a" })
    expect(container.querySelectorAll(".iui-text")).toHaveLength(0)
    fireEvent.keyDown(input, { key: "Enter" })
    expect(text(container)).toContain("Milk")
    expect(input.value).toBe("")
  })

  test("DOM event names are matched whatever their casing", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state n={0} over={false} />
<div data-testid="t" on:dblclick={n += 1} on:mouseenter={over = true}>{n} {over ? "in" : "out"}</div>`}
      />
    )
    const target = screen.getByTestId("t")
    fireEvent.doubleClick(target)
    fireEvent.mouseEnter(target)
    expect(text(container)).toBe("1 in")
  })

  test("a backslash keeps a brace literal", () => {
    const { container } = render(<IntelligentUI source={`<state n={2} />\n\n<text>\\{n} is {n}</text>`} />)
    expect(text(container)).toBe("{n} is 2")
  })

  test("attributes mix text and values", () => {
    render(<IntelligentUI source={`<state user="Ada" />\n\n<image alt="Photo of {user}" src="https://example.com/a.png" />`} />)
    expect(screen.getByAltText("Photo of Ada")).not.toBeNull()
  })

  test("a query reloads every few seconds while enabled", async () => {
    vi.useFakeTimers()
    try {
      const getQuote = vi.fn(async () => ({ price: 10 }))
      render(
        <IntelligentUI
          source={`<state symbol="ACME" />\n<query id="price" tool="getQuote" input={{ symbol }} every={30} enabled={symbol != ""} />`}
          tools={{ getQuote }}
        />
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })
      expect(getQuote).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(29_000)
      })
      expect(getQuote).toHaveBeenCalledTimes(1)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500)
      })
      expect(getQuote).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  test("a chart takes design colors and reports the row that was picked", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state picked={null} rows={[{ month: "Jan", plan: 10, actual: 8 }, { month: "Feb", plan: 12, actual: 15 }]} />
<Chart type="bar" data={rows} x="month" y={["plan", "actual"]} colors={["chart-3", "accent"]} names={{ plan: "Plan" }} legend on:select={picked = $value} aria-label="Plan against actual" />
<text>{picked ? picked.month : "none"}</text>`}
      />
    )
    const svg = container.querySelector("svg.iui-chart-svg, .iui-chart svg") as SVGElement
    expect(svg).not.toBeNull()
    expect(container.querySelector(".iui-chart")?.innerHTML).toContain("var(--iui-color-chart-3")
    expect(container.querySelector(".iui-chart")?.innerHTML).toContain("var(--iui-color-accent")
    expect(text(container)).toContain("Plan")
    const bars = container.querySelectorAll(".iui-chart rect")
    expect(bars.length).toBeGreaterThanOrEqual(4)
    fireEvent.click(bars[bars.length - 1] as Element)
    expect(text(container)).toContain("Feb")
  })

  test("a table reports the row that was picked", () => {
    const { container } = render(
      <IntelligentUI
        source={`<state row={null} rows={[{ id: 1, name: "Ada", price: 12 }, { id: 2, name: "Lin", price: 30 }]} />
<DataTable data={rows} columns={["name", { key: "price", label: "Price", format: "currency", align: "right" }]} rowKey="id" on:select={row = $value} selected={row?.id} />
<text>{row ? row.name : "none"}</text>`}
      />
    )
    expect(text(container)).toContain("$12")
    fireEvent.click(screen.getByText("Lin"))
    expect(container.querySelector(".iui-text")?.textContent).toBe("Lin")
  })

  test("a stat shows its change as a percent", async () => {
    const { container } = render(
      <IntelligentUI source={`<Stat label="Revenue" value={1200} format="currency" delta={0.08} caption="vs last month" />`} />
    )
    await waitFor(() => expect(text(container)).toMatch(/Revenue.*\$1,200.*8%.*vs last month/))
  })

  test("morph runs handlers inside a view transition", async () => {
    const names: string[][] = []
    const start = vi.fn((update: () => void) => {
      const named = () =>
        [...document.querySelectorAll<HTMLElement>("[data-iui-morph]")].map(
          (element) => element.style.viewTransitionName
        )
      names.push(named())
      update()
      names.push(named())
      return { finished: Promise.resolve() }
    })
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
    const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement
    ) {
      const hidden = this.textContent === "Below the fold"
      const top = hidden ? 5000 : 10
      return { top, left: 10, bottom: top + 40, right: 210, width: 200, height: 40, x: 10, y: top, toJSON() {} }
    })
    const { container } = render(
      <IntelligentUI
        source={`<state big={false} />
<card morph="hero" on:click={big = !big}>{big ? "Large" : "Small"}</card>
<card morph="hero">Same name again</card>
<card morph="far">Below the fold</card>`}
      />
    )
    const card = container.querySelector<HTMLElement>(".iui-card") as HTMLElement
    expect(card.style.viewTransitionName).toBe("")
    fireEvent.click(card)
    expect(start).toHaveBeenCalledTimes(1)
    expect(card.textContent).toBe("Large")
    expect(names).toEqual([
      ["hero", "", ""],
      ["hero", "", ""],
    ])
    await waitFor(() => expect(card.style.viewTransitionName).toBe(""))
    rect.mockRestore()
  })

  test("without morph, handlers run directly", () => {
    const start = vi.fn()
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true })
    const { container } = render(
      <IntelligentUI source={`<state n={0} />\n<card on:click={n += 1}>{n}</card>`} />
    )
    fireEvent.click(container.querySelector(".iui-card") as HTMLElement)
    expect(start).not.toHaveBeenCalled()
    expect(text(container)).toBe("1")
  })

  test("model CSS can't pin things to the viewport", () => {
    const { container } = render(
      <IntelligentUI source={`<style>.x { position: fixed; top: 0 }</style>\n<div class="x">Hi</div>`} />
    )
    const css = [...container.querySelectorAll("style")].map((el) => el.textContent).join("\n")
    expect(css).not.toMatch(/position:\s*fixed/)
  })
})
