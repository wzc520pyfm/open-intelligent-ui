import type { ChartContext, ChartEngine, ChartHandle, ChartSpec } from "../renderer/chart-engine"
import {
  type ChartAdapterOptions,
  engineSpec,
  type Loader,
  loader,
  tooltipElement,
  whenSized,
} from "./shared"

interface G2Chart {
  // biome-ignore lint/suspicious/noExplicitAny: G2's own types are wider than what the adapter passes
  options(options: any): unknown
  render(): unknown
  destroy(): unknown
  forceFit?(): unknown
  // biome-ignore lint/suspicious/noExplicitAny: as above
  on(event: any, handler: any): unknown
}

/** The part of G2 the adapter calls: `import * as G2 from "@antv/g2"`. */
export interface G2Like {
  // biome-ignore lint/suspicious/noExplicitAny: as above
  Chart: new (options: any) => G2Chart
}

export interface G2Options extends ChartAdapterOptions {
  /**
   * Changes the G2 options before they are drawn: return new ones, or edit
   * the ones given.
   */
  options?: (options: Record<string, unknown>, spec: ChartSpec) => Record<string, unknown> | undefined
}

type Options = Record<string, unknown>

interface Datum {
  index: number
  label: string
  series: string
  value: number
}

interface TooltipItem {
  name?: unknown
  value?: unknown
  color?: unknown
}

function buildOptions(spec: ChartSpec, context: ChartContext, doc: Document): Options {
  const { theme, type } = spec
  const names = spec.series.map((series) => series.name)
  const long: Datum[] = spec.series.flatMap((series) =>
    series.values.map((value, index) => ({
      index,
      label: spec.labels[index] ?? String(index + 1),
      series: series.name,
      value,
    }))
  )
  const text = {
    labelFill: theme.muted,
    labelFillOpacity: 1,
    // G2's themes fade labels; the design's muted color is already the faded one.
    labelOpacity: 1,
    labelFontSize: theme.fontSize,
    labelFontFamily: theme.fontFamily,
  }
  // Labels stay level: a few may be hidden on a narrow chart, none are turned on their side.
  const quiet = { title: false, tick: false, line: false, labelAutoRotate: false, ...text }
  const all = spec.series.flatMap((series) => series.values)
  // An axis starts at zero unless a value is below it, as the built-in chart's does.
  const fromZero = all.every((value) => value >= 0) ? { domainMin: 0 } : {}
  const axis = {
    x: { ...quiet, line: true, lineStroke: theme.border, lineStrokeOpacity: 1 },
    y: {
      ...quiet,
      labelFormatter: (value: number) => spec.format(value),
      grid: spec.grid,
      gridStroke: theme.border,
      gridStrokeOpacity: 1,
      gridLineDash: [0, 0],
    },
  }
  const legend = (channel: string) =>
    spec.legend
      ? {
          [channel]: {
            position: "bottom",
            layout: { justifyContent: "center" },
            itemLabelFill: theme.muted,
            itemLabelFillOpacity: 1,
            itemLabelOpacity: 1,
            itemLabelFontSize: theme.fontSize,
            itemLabelFontFamily: theme.fontFamily,
            itemMarker: "square",
          },
        }
      : false
  const tooltip = (title: boolean): Options => ({
    ...(title ? { title: (datum: Datum) => datum.label } : { title: false }),
    items: [
      (datum: Datum) => ({
        name: title ? datum.series : datum.label,
        value: spec.format(datum.value),
      }),
    ],
  })
  const interaction = {
    tooltip: {
      // The box is `.iui-chart-tip`, styled from the design; the engine's own stands down.
      css: {
        ".g2-tooltip": { background: "transparent", "box-shadow": "none", padding: "0", "border-radius": "0" },
      },
      // Elements, not a string of HTML: the names in it came from a model.
      render: (_event: unknown, shown: { title?: unknown; items?: TooltipItem[] }) =>
        tooltipElement(
          doc,
          shown.title === undefined || shown.title === null || shown.title === "" ? undefined : String(shown.title),
          (shown.items ?? []).map((item) => ({
            name: String(item.name ?? ""),
            value: String(item.value ?? ""),
            color: typeof item.color === "string" ? item.color : undefined,
          }))
        ),
    },
  }
  const base: Options = {
    autoFit: true,
    theme: { type: theme.dark ? "classicDark" : "classic", view: { viewFill: "transparent" } },
    animate: context.reducedMotion ? false : undefined,
    interaction,
    margin: 4,
    // Room for the top tick's label and a value above the tallest mark, and for the last label across.
    marginTop: 14,
    marginRight: 14,
  }
  const colors = { domain: names, range: spec.series.map((series) => series.color) }
  const first = spec.series[0]
  const slices = spec.labels.map((label, index) => ({
    index,
    label,
    series: first?.name ?? "",
    value: first?.values[index] ?? 0,
  }))
  const valueLabels = spec.valueLabels
    ? [
        {
          text: (datum: Datum) => spec.format(datum.value),
          fill: theme.muted,
          fillOpacity: 1,
          fontSize: theme.fontSize - 1,
          fontFamily: theme.fontFamily,
          position: "top",
          textBaseline: "bottom",
          dy: -4,
        },
      ]
    : []

  if (type === "donut" || type === "pie") {
    const sum = slices.reduce((all, slice) => all + Math.max(0, slice.value), 0)
    const words = { x: "50%", y: "50%", textAlign: "center", textBaseline: "middle", fontFamily: theme.fontFamily }
    return {
      ...base,
      type: "view",
      coordinate: { type: "theta", innerRadius: type === "donut" ? 0.62 : 0, outerRadius: 0.92 },
      children: [
        {
          type: "interval",
          data: slices,
          encode: { y: "value", color: "label" },
          transform: [{ type: "stackY" }],
          scale: { color: { domain: spec.labels, range: spec.palette } },
          style: { stroke: theme.surface, lineWidth: type === "donut" ? 2 : 1, radius: type === "donut" ? 4 : 0 },
          legend: legend("color"),
          tooltip: tooltip(false),
          labels: spec.valueLabels
            ? [{ text: (datum: Datum) => `${datum.label} ${spec.format(datum.value)}`, position: "outside", fill: theme.muted, fontSize: theme.fontSize }]
            : [],
        },
        // The total in the middle of a donut, as the built-in chart has it.
        ...(type === "donut"
          ? [
              {
                type: "text",
                style: { ...words, text: spec.format(Math.round(sum * 100) / 100), dy: -8, fontSize: 20, fontWeight: 650, fill: theme.foreground },
                tooltip: false,
              },
              {
                type: "text",
                style: { ...words, text: "Total", dy: 12, fontSize: 12, fill: theme.muted },
                tooltip: false,
              },
            ]
          : []),
      ],
    }
  }

  if (type === "funnel") {
    return {
      ...base,
      type: "interval",
      data: slices,
      encode: { x: "label", y: "value", color: "label", shape: "funnel" },
      transform: [{ type: "symmetryY" }],
      coordinate: { transform: [{ type: "transpose" }] },
      scale: { x: { padding: 0 }, color: { domain: spec.labels, range: spec.palette } },
      axis: false,
      legend: legend("color"),
      tooltip: tooltip(false),
      labels: [{ text: (datum: Datum) => `${datum.label} ${spec.format(datum.value)}`, position: "inside", fill: "#fff", fontSize: theme.fontSize }],
    }
  }

  if (type === "radar") {
    const mark = { encode: { x: "label", y: "value", color: "series" }, tooltip: tooltip(true) }
    return {
      ...base,
      type: "view",
      data: long,
      coordinate: { type: "polar" },
      scale: { x: { padding: 0.5, align: 0 }, y: { domainMin: 0, nice: true, tickCount: 4 }, color: colors },
      axis: {
        x: {
          ...quiet,
          labelAlign: "horizontal",
          grid: true,
          gridStroke: theme.border,
          gridStrokeOpacity: 1,
          gridLineDash: [0, 0],
        },
        y: {
          ...quiet,
          label: false,
          grid: true,
          gridConnect: "line",
          gridStroke: theme.border,
          gridStrokeOpacity: 1,
          gridLineDash: [0, 0],
          gridAreaFill: "transparent",
        },
      },
      legend: legend("color"),
      children: [
        { ...mark, type: "area", style: { fillOpacity: 0.16 }, tooltip: false },
        { ...mark, type: "line", style: { lineWidth: 2 } },
      ],
    }
  }

  if (type === "spark") {
    const mark = { encode: { x: "label", y: "value", color: "series", shape: "smooth" } }
    return {
      ...base,
      type: "view",
      data: long,
      margin: 0,
      padding: 0,
      inset: 3,
      axis: false,
      legend: false,
      interaction: { tooltip: false },
      // A trend, not a quantity: the line uses the whole height.
      scale: { color: colors, y: { nice: false, domain: [Math.min(...all), Math.max(...all)] } },
      children: [
        { ...mark, type: "area", style: { fillOpacity: 0.12 }, tooltip: false },
        { ...mark, type: "line", style: { lineWidth: 2 }, tooltip: false },
      ],
    }
  }

  if (type === "scatter") {
    return {
      ...base,
      type: "point",
      data: long.map((datum) => ({ ...datum, across: Number(datum.label) })),
      encode: { x: "across", y: "value", color: "series", shape: "point" },
      scale: { color: colors, x: { nice: true }, y: { nice: true } },
      axis: { x: { ...axis.x, grid: spec.grid, gridStroke: theme.border, gridStrokeOpacity: 1, gridLineDash: [0, 0] }, y: axis.y },
      style: { fillOpacity: 0.85, r: 4.5 },
      legend: legend("color"),
      tooltip: tooltip(true),
    }
  }

  if (type === "bar") {
    return {
      ...base,
      type: "interval",
      data: long,
      encode: { x: "label", y: "value", color: "series" },
      transform: [{ type: spec.stacked ? "stackY" : "dodgeX" }],
      scale: { color: colors, y: { nice: true, ...fromZero } },
      axis,
      style: spec.stacked ? { maxWidth: 36 } : { maxWidth: 36, radiusTopLeft: 4, radiusTopRight: 4 },
      legend: legend("color"),
      tooltip: tooltip(true),
      labels: valueLabels,
      interaction: { ...interaction, elementHighlight: { background: true } },
    }
  }

  const stack = type === "area" && spec.stacked ? [{ type: "stackY" }] : []
  const mark = { encode: { x: "label", y: "value", color: "series", shape: "smooth" }, transform: stack }
  return {
    ...base,
    type: "view",
    data: long,
    scale: { color: colors, y: { nice: true, ...fromZero }, x: { padding: 0.05 } },
    axis,
    legend: legend("color"),
    children: [
      ...(type === "area" ? [{ ...mark, type: "area", style: { fillOpacity: 0.16 }, tooltip: false }] : []),
      { ...mark, type: "line", style: { lineWidth: 2 }, tooltip: tooltip(true), labels: valueLabels },
    ],
  }
}

/**
 * Draws `<Chart>` with [AntV G2](https://g2.antv.antgroup.com), and adds
 * the `scatter`, `radar` and `funnel` types.
 *
 * ```ts
 * const library = defineLibrary({ charts: g2Charts(() => import("@antv/g2")) })
 * ```
 */
export function g2Charts(g2: Loader<G2Like>, options: G2Options = {}): ChartEngine {
  const load = loader(g2, "Chart")
  return {
    ...engineSpec("AntV G2", options),
    async mount(element, first, context): Promise<ChartHandle> {
      const library = await load()
      let spec = first
      let chart: G2Chart | undefined
      const draw = () => {
        if (!chart) return
        const built = buildOptions(spec, context, element.ownerDocument)
        chart.options(options.options?.(built, spec) ?? built)
        // G2 draws in steps that return a promise; a chart removed meanwhile rejects it.
        void Promise.resolve(chart.render()).catch(() => {})
      }
      const stop = whenSized(
        element,
        () => {
          chart = new library.Chart({ container: element, autoFit: true })
          chart.on("element:click", (event: { data?: { data?: { index?: unknown } } }) => {
            const index = event.data?.data?.index
            if (typeof index === "number") context.select(index)
          })
          draw()
        },
        () => chart?.forceFit?.()
      )
      return {
        update: (next) => {
          spec = next
          draw()
        },
        destroy: () => {
          stop()
          chart?.destroy()
          chart = undefined
        },
      }
    },
  }
}
