import type { ChartContext, ChartEngine, ChartHandle, ChartSpec } from "../renderer/chart-engine"
import {
  type ChartAdapterOptions,
  engineSpec,
  type Loader,
  loader,
  niceMax,
  tooltipElement,
  whenSized,
} from "./shared"

interface EChartsInstance {
  // biome-ignore lint/suspicious/noExplicitAny: ECharts' own types are wider than what the adapter passes
  setOption(option: any, settings?: any): unknown
  resize(): unknown
  dispose(): unknown
  // biome-ignore lint/suspicious/noExplicitAny: as above
  on(event: any, handler: any): unknown
}

/** The part of ECharts the adapter calls: `import * as echarts from "echarts"`. */
export interface EChartsLike {
  // biome-ignore lint/suspicious/noExplicitAny: as above
  init(element: any, theme?: any, settings?: any): EChartsInstance
}

export interface EChartsOptions extends ChartAdapterOptions {
  /** `canvas` (the default) or `svg`. */
  renderer?: "canvas" | "svg"
  /**
   * Changes the ECharts option before it is drawn: return a new one, or
   * edit the one given. The place for a house style the design can't say.
   */
  option?: (option: Record<string, unknown>, spec: ChartSpec) => Record<string, unknown> | undefined
}

interface Item {
  seriesName?: string
  name?: string
  value?: unknown
  color?: unknown
  dataIndex?: number
  axisValueLabel?: string
}

type Option = Record<string, unknown>

function buildOption(spec: ChartSpec, context: ChartContext, doc: Document): Option {
  const { theme, type } = spec
  const label = { color: theme.muted, fontSize: theme.fontSize, fontFamily: theme.fontFamily }
  const swatch = (color: unknown) => (typeof color === "string" ? color : undefined)
  const number = (value: unknown) => {
    const read = Array.isArray(value) ? value[value.length - 1] : value
    return typeof read === "number" ? spec.format(read) : String(read ?? "")
  }
  const tooltip = (trigger: "axis" | "item", pointer = "line"): Option => ({
    trigger,
    confine: true,
    // The box is `.iui-chart-tip`, styled from the design; the engine's own stands down.
    backgroundColor: "transparent",
    borderWidth: 0,
    padding: 0,
    extraCssText: "box-shadow: none;",
    axisPointer: {
      type: pointer,
      lineStyle: { color: theme.border },
      shadowStyle: { color: theme.muted, opacity: 0.08 },
    },
    // Elements, not a string of HTML: the names in it came from a model.
    formatter: (params: Item | Item[]) => {
      const items = Array.isArray(params) ? params : [params]
      const first = items[0]
      if (trigger === "axis") {
        return tooltipElement(
          doc,
          first?.axisValueLabel ?? first?.name,
          items.map((item) => ({ name: item.seriesName ?? "", value: number(item.value), color: swatch(item.color) }))
        )
      }
      if (type === "radar") {
        const values = Array.isArray(first?.value) ? first.value : []
        return tooltipElement(
          doc,
          first?.name,
          spec.labels.map((name, index) => ({ name, value: number(values[index]) }))
        )
      }
      if (type === "scatter") {
        const pair = Array.isArray(first?.value) ? first.value : []
        return tooltipElement(doc, first?.seriesName, [
          { name: String(pair[0] ?? ""), value: number(pair[1]), color: swatch(first?.color) },
        ])
      }
      return tooltipElement(doc, undefined, [
        { name: first?.name ?? "", value: number(first?.value), color: swatch(first?.color) },
      ])
    },
  })
  const legend: Option = {
    show: spec.legend,
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: label,
    inactiveColor: theme.border,
  }
  const base: Option = {
    backgroundColor: "transparent",
    animation: !context.reducedMotion,
    animationDuration: 600,
    animationDurationUpdate: 400,
    textStyle: { fontFamily: theme.fontFamily, color: theme.muted },
    color: spec.series.map((series) => series.color),
  }
  const first = spec.series[0]

  if (type === "donut" || type === "pie" || type === "funnel") {
    const data = spec.labels.map((name, index) => ({
      name,
      value: first?.values[index] ?? 0,
      itemStyle: { color: spec.palette[index] },
    }))
    const words = {
      show: spec.valueLabels,
      color: theme.muted,
      fontSize: theme.fontSize,
      formatter: (item: Item) => `${item.name ?? ""} ${number(item.value)}`,
    }
    const space = spec.legend ? 32 : 4
    const middle = spec.legend ? 0.44 : 0.5
    const sum = data.reduce((all, item) => all + Math.max(0, item.value), 0)
    return {
      ...base,
      tooltip: tooltip("item"),
      legend,
      // The total in the middle of a donut, as the built-in chart has it.
      ...(type === "donut"
        ? {
            title: {
              text: spec.format(Math.round(sum * 100) / 100),
              subtext: "Total",
              left: "50%",
              // The number sits on this line and the word under it; together they are centered.
              top: Math.round(spec.height * middle) - 8,
              textAlign: "center",
              textVerticalAlign: "middle",
              itemGap: 4,
              textStyle: { color: theme.foreground, fontSize: 20, fontWeight: 650, fontFamily: theme.fontFamily },
              subtextStyle: { color: theme.muted, fontSize: 12, fontFamily: theme.fontFamily },
            },
          }
        : {}),
      series: [
        type === "funnel"
          ? {
              type: "funnel",
              data,
              sort: "none",
              left: "8%",
              width: "84%",
              top: 4,
              bottom: space,
              gap: 2,
              minSize: "8%",
              itemStyle: { borderWidth: 0 },
              label: { ...words, show: true, position: "inside", color: "#fff" },
            }
          : {
              type: "pie",
              data,
              radius: type === "donut" ? ["58%", "82%"] : [0, "82%"],
              center: ["50%", `${middle * 100}%`],
              padAngle: type === "donut" ? 2 : 0,
              itemStyle: { borderRadius: type === "donut" ? 4 : 0 },
              label: words,
              labelLine: { show: spec.valueLabels, lineStyle: { color: theme.border } },
              emphasis: { scaleSize: 4 },
            },
      ],
    }
  }

  if (type === "radar") {
    const max = niceMax(spec.series.flatMap((series) => series.values))
    return {
      ...base,
      tooltip: tooltip("item"),
      legend,
      radar: {
        indicator: spec.labels.map((name) => ({ name, max })),
        radius: spec.legend ? "62%" : "70%",
        center: ["50%", spec.legend ? "46%" : "52%"],
        axisName: label,
        axisLine: { lineStyle: { color: theme.border } },
        splitLine: { lineStyle: { color: theme.border } },
        splitArea: { show: false },
      },
      series: [
        {
          type: "radar",
          symbolSize: 4,
          data: spec.series.map((series) => ({
            name: series.name,
            value: series.values,
            lineStyle: { color: series.color, width: 2 },
            itemStyle: { color: series.color },
            areaStyle: { color: series.color, opacity: 0.16 },
          })),
        },
      ],
    }
  }

  if (type === "spark") {
    return {
      ...base,
      grid: { left: 1, right: 1, top: 3, bottom: 3 },
      xAxis: { type: "category", show: false, boundaryGap: false, data: spec.labels },
      yAxis: { type: "value", show: false, scale: true },
      series: spec.series.map((series) => ({
        type: "line",
        data: series.values,
        smooth: true,
        showSymbol: false,
        silent: true,
        lineStyle: { width: 2, color: series.color },
        areaStyle: { color: series.color, opacity: 0.12 },
      })),
    }
  }

  const scatter = type === "scatter"
  const values = { ...label, formatter: (value: number) => spec.format(value) }
  const rule = { show: spec.grid, lineStyle: { color: theme.border } }
  const value = {
    show: spec.valueLabels,
    position: "top",
    color: theme.muted,
    fontSize: theme.fontSize - 1,
    formatter: (item: Item) => number(item.value),
  }
  return {
    ...base,
    tooltip: scatter ? tooltip("item") : tooltip("axis", type === "bar" ? "shadow" : "line"),
    legend,
    // A line runs to the edge of the plot, so its last label needs room past it.
    grid: { left: 4, right: type === "bar" ? 8 : 18, top: 14, bottom: spec.legend ? 30 : 4, containLabel: true },
    xAxis: scatter
      ? { type: "value", scale: true, axisLabel: label, splitLine: rule, axisLine: { show: false }, axisTick: { show: false } }
      : {
          type: "category",
          data: spec.labels,
          boundaryGap: type === "bar",
          axisLabel: label,
          axisLine: { lineStyle: { color: theme.border } },
          axisTick: { show: false },
        },
    yAxis: {
      type: "value",
      scale: scatter,
      axisLabel: values,
      splitLine: rule,
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: spec.series.map((series) => {
      if (scatter) {
        return {
          name: series.name,
          type: "scatter",
          symbolSize: 9,
          itemStyle: { color: series.color, opacity: 0.85 },
          data: series.values.map((y, index) => [Number(spec.labels[index]), y]),
        }
      }
      if (type === "bar") {
        return {
          name: series.name,
          type: "bar",
          data: series.values,
          stack: spec.stacked ? "total" : undefined,
          barMaxWidth: 36,
          itemStyle: { color: series.color, borderRadius: spec.stacked ? 0 : [4, 4, 0, 0] },
          label: value,
        }
      }
      return {
        name: series.name,
        type: "line",
        data: series.values,
        smooth: 0.3,
        showSymbol: spec.valueLabels,
        symbolSize: 6,
        stack: type === "area" && spec.stacked ? "total" : undefined,
        lineStyle: { width: 2, color: series.color },
        itemStyle: { color: series.color },
        areaStyle: type === "area" ? { color: series.color, opacity: 0.16 } : undefined,
        label: value,
        emphasis: { focus: "series" },
      }
    }),
  }
}

/**
 * Draws `<Chart>` with [Apache ECharts](https://echarts.apache.org), and
 * adds the `scatter`, `radar` and `funnel` types.
 *
 * ```ts
 * const library = defineLibrary({ charts: echartsCharts(() => import("echarts")) })
 * ```
 *
 * Colors, type and the number format come from the design and the chart's
 * props, so a chart looks at home whichever engine draws it.
 */
export function echartsCharts(echarts: Loader<EChartsLike>, options: EChartsOptions = {}): ChartEngine {
  const load = loader(echarts, "init")
  return {
    ...engineSpec("ECharts", options),
    async mount(element, first, context): Promise<ChartHandle> {
      const library = await load()
      let spec = first
      let chart: EChartsInstance | undefined
      let kind = ""
      const draw = () => {
        if (!chart) return
        const built = buildOption(spec, context, element.ownerDocument)
        const option = options.option?.(built, spec) ?? built
        // Another type of chart has other parts; the same type moves to its new values.
        chart.setOption(option, kind === spec.type ? { replaceMerge: ["series"] } : { notMerge: true })
        kind = spec.type
      }
      const stop = whenSized(
        element,
        () => {
          chart = library.init(element, undefined, { renderer: options.renderer ?? "canvas" })
          chart.on("click", (params: { dataIndex?: unknown }) => {
            if (typeof params.dataIndex === "number") context.select(params.dataIndex)
          })
          draw()
        },
        () => chart?.resize()
      )
      return {
        update: (next) => {
          spec = next
          draw()
        },
        destroy: () => {
          stop()
          chart?.dispose()
          chart = undefined
        },
      }
    },
  }
}
