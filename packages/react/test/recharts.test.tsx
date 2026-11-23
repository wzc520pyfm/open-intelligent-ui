import { defineLibrary } from "@open-intelligent-ui/core"
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { act, cleanup, render } from "@testing-library/react"
import type { ComponentType, ReactNode } from "react"
import { afterEach, describe, expect, test } from "vitest"
import { IntelligentUI } from "../src"
import { type RechartsLike, rechartsCharts } from "../src/recharts"

// biome-ignore lint/suspicious/noExplicitAny: the props of a fake part are read loosely
type Loose = any

const BASE = [
  "ResponsiveContainer",
  "BarChart",
  "Bar",
  "LineChart",
  "Line",
  "AreaChart",
  "Area",
  "PieChart",
  "Pie",
  "Cell",
  "XAxis",
  "YAxis",
  "CartesianGrid",
  "Tooltip",
  "Legend",
] as const
const MORE = ["ScatterChart", "Scatter", "RadarChart", "Radar", "PolarGrid", "PolarAngleAxis", "FunnelChart", "Funnel", "LabelList"] as const

/** Recharts as parts that draw themselves as named elements and remember the props they were given. */
function fakeRecharts(names: readonly string[] = [...BASE, ...MORE]) {
  const seen: { part: string; props: Loose }[] = []
  const parts: Record<string, ComponentType<Loose>> = {}
  for (const name of names) {
    parts[name] = (props: { children?: ReactNode }) => {
      seen.push({ part: name, props })
      return <div data-part={name}>{props.children}</div>
    }
  }
  const last = (part: string) => seen.filter((entry) => entry.part === part).at(-1)?.props
  const all = (part: string) => seen.filter((entry) => entry.part === part).map((entry) => entry.props)
  return { recharts: parts as unknown as RechartsLike, seen, last, all }
}

const SALES = `<state rows={[
  { month: "Jan", web: 120, store: 80 },
  { month: "<img src=x onerror=alert(1)>", web: 150, store: 95 }
]} picked={null} />

<Chart class="sales" type="bar" data={rows} x="month" y={["web", "store"]} names={{ web: "<b>Web</b>" }} format="currency" digits={0} on:select={picked = $value.month} />

<text class="picked">{picked ?? "none"}</text>`

const flush = async () => {
  for (let turn = 0; turn < 4; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

async function draw(source: string, charts = rechartsCharts(fakeRecharts().recharts)) {
  const warnings: string[] = []
  const view = render(
    <IntelligentUI source={source} library={defineLibrary({ charts })} onWarning={(message) => warnings.push(message)} />
  )
  await flush()
  return { container: view.container.querySelector(".iui-root") as HTMLElement, warnings }
}

afterEach(cleanup)

describe("rechartsCharts", () => {
  test("draws a chart with Recharts' parts, in the design's own colors", async () => {
    const fake = fakeRecharts()
    const { container, warnings } = await draw(SALES, rechartsCharts(fake.recharts))
    expect(warnings).toEqual([])
    const host = container.querySelector(".sales") as HTMLElement
    expect(host.className).toBe("iui-el iui-chart iui-chart-engine sales")
    expect(host.getAttribute("data-engine")).toBe("recharts")
    expect(host.getAttribute("role")).toBe("img")
    expect(host.querySelector('[data-part="ResponsiveContainer"] > [data-part="BarChart"]')).not.toBeNull()
    expect(fake.last("BarChart").data).toEqual([
      { "#label": "Jan", web: 120, store: 80 },
      { "#label": "<img src=x onerror=alert(1)>", web: 150, store: 95 },
    ])
    const bars = fake.all("Bar").slice(-2)
    expect(bars.map((bar) => [bar.dataKey, bar.name])).toEqual([
      ["web", "<b>Web</b>"],
      ["store", "store"],
    ])
    // Variables, not resolved colors: the chart restyles with the surface.
    expect(bars.map((bar) => bar.fill)).toEqual(["var(--iui-color-chart-1)", "var(--iui-color-chart-2)"])
    expect(fake.last("YAxis").tickFormatter(1200)).toBe("$1,200")
  })

  test("a tooltip is React elements: what a model named is only ever text", async () => {
    const fake = fakeRecharts()
    await draw(SALES, rechartsCharts(fake.recharts))
    const content = fake.last("Tooltip").content as (shown: Loose) => ReactNode
    expect(content({ active: false })).toBeNull()
    const tip = render(
      <>
        {content({
          active: true,
          label: "<img src=x onerror=alert(1)>",
          payload: [{ name: "<b>Web</b>", value: 150, color: "red" }],
        })}
      </>
    ).container
    expect(tip.querySelector(".iui-chart-tip")).not.toBeNull()
    expect(tip.querySelector("img")).toBeNull()
    expect(tip.querySelector("strong")?.textContent).toBe("<img src=x onerror=alert(1)>")
    expect(tip.querySelector("span")?.textContent).toBe("<b>Web</b>$150")
  })

  test("a press on a bar selects its row", async () => {
    const fake = fakeRecharts()
    const { container } = await draw(SALES, rechartsCharts(fake.recharts))
    expect(fake.last("Bar").cursor).toBe("pointer")
    await act(async () => {
      fake.last("Bar").onClick({}, 0)
    })
    await flush()
    expect(container.querySelector(".picked")?.textContent).toBe("Jan")
    // An index that is no row is nothing to select.
    await act(async () => {
      fake.last("Bar").onClick({}, 9)
    })
    expect(container.querySelector(".picked")?.textContent).toBe("Jan")
  })

  test("a donut starts at twelve o'clock, and a line is picked by its place on the axis", async () => {
    const fake = fakeRecharts()
    const { container } = await draw(
      `${SALES.replace('type="bar"', 'type="line"')}\n\n<Chart class="share" type="donut" data={rows} x="month" y="web" />`,
      rechartsCharts(fake.recharts)
    )
    expect(fake.last("Pie")).toMatchObject({ startAngle: 90, endAngle: -270, innerRadius: "58%" })
    expect(fake.all("Cell").slice(-2).map((cell) => cell.fill)).toEqual([
      "var(--iui-color-chart-1)",
      "var(--iui-color-chart-2)",
    ])
    await act(async () => {
      fake.last("LineChart").onClick({ activeTooltipIndex: 0 })
    })
    await flush()
    expect(container.querySelector(".picked")?.textContent).toBe("Jan")
  })

  test("draws the extra types only with the parts for them, and leaves the rest to the built-in chart", async () => {
    const full = rechartsCharts(fakeRecharts().recharts)
    expect(full.types).toEqual(["bar", "line", "area", "donut", "pie", "scatter", "radar", "funnel"])
    expect(Object.keys(full.extra ?? {})).toEqual(["scatter", "radar", "funnel"])

    const small = rechartsCharts(fakeRecharts(BASE).recharts)
    expect(small.types).toEqual(["bar", "line", "area", "donut", "pie"])
    expect(small.extra).toBeUndefined()
    // The prompt names an engine only for what it changes for the model.
    expect(buildSystemPrompt({ library: defineLibrary({ charts: small }) })).not.toContain("Recharts")
    const prompt = buildSystemPrompt({ library: defineLibrary({ charts: full }) })
    expect(prompt).toContain("`<Chart>` is drawn with Recharts.")
    expect(prompt).toContain("- `funnel`:")

    const { container, warnings } = await draw(
      `<state trend={[3, 5, 4, 8]} />\n\n<Chart class="spark" type="spark" data={trend} />`,
      small
    )
    expect(warnings).toEqual([])
    expect(container.querySelector(".spark")?.hasAttribute("data-engine")).toBe(false)
    expect(container.querySelector(".spark svg")).not.toBeNull()
  })
})
