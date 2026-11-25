import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { checkMarkup } from "@open-intelligent-ui/core/check"
import { IntelligentUI, preloadUiSdk } from "@open-intelligent-ui/react"
import { DEMOS } from "../src/demos"
import { createTicketTools } from "../src/tools"

function text(container: HTMLElement): string {
  const root = container.querySelector(".iui-root")?.cloneNode(true) as HTMLElement
  for (const hidden of root.querySelectorAll("style, .iui-toasts")) hidden.remove()
  return (root.textContent ?? "").replace(/\s+/g, " ").trim()
}

async function mount(id: string) {
  const demo = DEMOS.find((item) => item.id === id)
  if (!demo) throw new Error(`No demo ${id}`)
  const warnings: string[] = []
  const diagnostics: string[] = []
  const sent: { text: string; data?: unknown }[] = []
  await act(async () => {
    await preloadUiSdk()
  })
  const view = render(
    <IntelligentUI
      source={demo.source}
      tools={createTicketTools(0)}
      library={demo.library}
      onWarning={(message) => warnings.push(message)}
      onDiagnostics={(list) => {
        diagnostics.length = 0
        diagnostics.push(...list.map((item) => item.message))
      }}
      onAction={(action) => {
        if (action.type === "send") sent.push({ text: action.text, data: action.data })
        return undefined
      }}
    />
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  return { ...view, warnings, diagnostics, sent }
}

describe("playground demos", () => {
  test.each(DEMOS.map((demo) => demo.id))("%s renders cleanly", async (id) => {
    const view = await mount(id)
    expect(view.container.querySelector(".iui-error")).toBeNull()
    expect(view.container.querySelector(".iui-pending")).toBeNull()
    expect(view.diagnostics).toEqual([])
    expect(view.warnings).toEqual([])
  })

  test.each(DEMOS.map((demo) => demo.id))("%s checks out before it is drawn", (id) => {
    const demo = DEMOS.find((item) => item.id === id) as (typeof DEMOS)[number]
    const result = checkMarkup(demo.source, {
      library: demo.library,
      tools: Object.keys(createTicketTools(0)),
    })
    expect(result.issues).toEqual([])
  })

  test.each(DEMOS.map((demo) => demo.id))("%s survives being streamed", async (id) => {
    const demo = DEMOS.find((item) => item.id === id) as (typeof DEMOS)[number]
    await act(async () => {
      await preloadUiSdk()
    })
    const errors: string[] = []
    const view = render(
      <IntelligentUI source="" streaming tools={createTicketTools(0)} library={demo.library} />
    )
    for (let end = 0; end < demo.source.length; end += 37) {
      view.rerender(
        <IntelligentUI
          source={demo.source.slice(0, end)}
          streaming
          tools={createTicketTools(0)}
          library={demo.library}
        />
      )
      const error = view.container.querySelector(".iui-error")
      if (error) errors.push(`${end}: ${error.textContent}`)
    }
    expect(errors).toEqual([])
    // A demo is drawn again for every 37 characters of it: seconds on a small CI machine.
  }, 30_000)

  test("gears: presets set both sliders and the ratio follows", async () => {
    const view = await mount("gears")
    fireEvent.click(screen.getByRole("button", { name: /Sprint/ }))
    await waitFor(() => expect(text(view.container)).toContain("50 teeth"))
    expect(text(view.container)).toContain("11 teeth")
    await waitFor(() => expect(text(view.container)).toContain("4.55"))
    expect(view.container.querySelectorAll("svg line.tooth")).toHaveLength(61)
  })

  test("invest: the answer is derived from the assumptions", async () => {
    const view = await mount("invest")
    await waitFor(() => expect(text(view.container)).toContain("$247,571"))
    fireEvent.click(screen.getByRole("button", { name: "Make this my plan" }))
    expect(view.sent).toEqual([
      { text: "Turn this into a savings plan I can follow", data: { monthly: 500, rate: 6, years: 20 } },
    ])
  })

  test("trip: priorities re-rank and the choice goes back to the agent", async () => {
    const view = await mount("trip")
    const cards = () => [...view.container.querySelectorAll<HTMLElement>(".iui-grid > .iui-card")]
    expect(cards()).toHaveLength(3)
    fireEvent.click(screen.getByRole("radio", { name: "Budget" }))
    await waitFor(() => expect(within(cards()[1] as HTMLElement).queryByText("Best fit")).not.toBeNull())
    fireEvent.click(cards()[1] as HTMLElement)
    fireEvent.click(screen.getByRole("button", { name: "Plan Lisbon" }))
    expect(view.sent[0]).toEqual({
      text: "Book Lisbon for 6 nights",
      data: { trip: "lisbon", nights: 6, total: 1080 },
    })
  })

  test("dashboard: picking a channel filters the table", async () => {
    const view = await mount("dashboard")
    expect(text(view.container)).toContain("Q4 closed at $1,588,000")
    expect(view.container.querySelectorAll(".iui-table tbody tr")).toHaveLength(6)
    fireEvent.click(view.container.querySelectorAll(".mix-row")[1] as Element)
    await waitFor(() => expect(view.container.querySelectorAll(".iui-table tbody tr")).toHaveLength(2))
    expect(text(view.container)).toContain("Top products · Retail")
  })

  test("workbench: reads, selects, writes and reloads", async () => {
    const view = await mount("workbench")
    await waitFor(() => expect(text(view.container)).toContain("4 open · 2 urgent"))
    expect(view.container.querySelectorAll(".iui-table tbody tr")).toHaveLength(4)
    fireEvent.click(screen.getByText("SSO login loops back to the sign-in page"))
    await waitFor(() => expect(screen.getByRole("button", { name: /Solve/ })).not.toBeNull())
    fireEvent.click(screen.getByRole("button", { name: /Solve/ }))
    await waitFor(() => expect(view.container.querySelectorAll(".iui-table tbody tr")).toHaveLength(3))
    await waitFor(() => expect(text(view.container)).toContain("3 open · 1 urgent"))
    expect(view.warnings).toEqual([])
  })

  test("board: cards move between lanes and progress follows", async () => {
    const view = await mount("board")
    expect(text(view.container)).toContain("1 of 16 points done")
    const lanes = () => [...view.container.querySelectorAll<HTMLElement>(".lane")]
    expect(lanes()[2]?.querySelectorAll(".ticket")).toHaveLength(1)
    fireEvent.click(within(lanes()[2] as HTMLElement).getByRole("button", { name: "Move forward" }))
    await waitFor(() => expect(lanes()[3]?.querySelectorAll(".ticket")).toHaveLength(2))
    expect(text(view.container)).toContain("3 of 16 points done")
    const input = screen.getByLabelText("New card")
    fireEvent.input(input, { target: { value: "Write docs" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(lanes()[0]?.querySelectorAll(".ticket")).toHaveLength(3))
    expect(view.warnings).toEqual([])
  })

  test("claim: the product's own components show the claim and report what was pressed", async () => {
    const view = await mount("claim")
    const stages = () =>
      [...view.container.querySelectorAll(".acme-steps li")].map((item) => item.getAttribute("data-stage"))
    expect(stages()).toEqual(["done", "current", "todo", "todo"])
    expect(view.container.querySelectorAll(".acme-check")).toHaveLength(4)
    expect(text(view.container)).toContain("Mei Tanaka")
    // A stage is a button: pressing it sets the state the markup bound it to.
    fireEvent.click(screen.getByText("4. Paid"))
    await waitFor(() => expect(stages()).toEqual(["done", "done", "done", "current"]))
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }))
    await waitFor(() => expect(text(view.container)).toContain("Approved"))
    expect(stages()).toEqual(["done", "done", "current", "todo"])
    expect(view.sent).toEqual([
      { text: "Approve Mei's claim, with the hotel overage noted", data: { total: 3518, excess: 128 } },
    ])
    expect(view.warnings).toEqual([])
  })
})
