import { formatValue } from "./format"
import type { ViewProps } from "./primitives"
import { color, flag, textValue } from "./tokens"
import { joinClass, px, type View, view } from "./view"

type Datum = Record<string, unknown>

interface Series {
  key: string
  name: string
  color: string
  values: number[]
}

export interface ChartData {
  rows: Datum[]
  labels: string[]
  series: Series[]
}

/** How wide a chart is drawn before it has been measured. */
export const CHART_WIDTH = 560

function niceScale(min: number, max: number, count = 4) {
  if (min === max) max = min + 1
  const span = max - min
  const rough = span / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const unit = [1, 2, 2.5, 5, 10].find((step) => step * power >= rough) ?? 10
  const step = unit * power
  const low = Math.floor(min / step) * step
  const high = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = low; value <= high + step / 2; value += step) {
    ticks.push(Number(value.toFixed(10)))
  }
  return { low, high, ticks }
}

/** What decides a chart's data. Compare it to know when to read the data again. */
export function chartDataKey(props: ViewProps): string {
  return JSON.stringify([props.data, props.x, props.y, props.names, props.colors])
}

/** Reads a chart's rows, category labels and series from its props. */
export function readChartData(props: ViewProps): ChartData {
  const input = Array.isArray(props.data) ? props.data : []
  const rows: Datum[] = input.map((item, index) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? (item as Datum)
      : { label: String(index + 1), value: item }
  )
  const first = rows[0] ?? {}
  const keys = Object.keys(first)
  const xKey =
    textValue(props.x) ??
    keys.find((key) => typeof first[key] === "string") ??
    keys[0] ??
    "label"
  const yInput = Array.isArray(props.y)
    ? props.y.map(String)
    : textValue(props.y) !== null
      ? [textValue(props.y) as string]
      : keys.filter((key) => key !== xKey && typeof first[key] === "number")
  const names =
    props.names !== null && typeof props.names === "object"
      ? (props.names as Record<string, unknown>)
      : {}
  const palette = Array.isArray(props.colors) ? props.colors : []
  const series = yInput.map((key, index) => ({
    key,
    name: typeof names[key] === "string" ? (names[key] as string) : key,
    color: color(palette[index]) ?? `var(--iui-color-chart-${(index % 6) + 1})`,
    values: rows.map((row) => {
      const value = Number(row[key])
      return Number.isFinite(value) ? value : 0
    }),
  }))
  const labels = rows.map((row) => String(row[xKey] ?? ""))
  return { rows, labels, series }
}

/** Every series' numbers in one list, the shape a tween moves. */
export function chartValues(data: ChartData): number[] {
  return data.series.flatMap((item) => item.values)
}

/**
 * A smooth line through the points that never overshoots them (monotone
 * cubic interpolation), so a steady rise doesn't appear to wobble.
 */
function linePath(points: [number, number][]): string {
  const count = points.length
  if (count === 0) return ""
  const [x0, y0] = points[0] as [number, number]
  let path = `M${x0.toFixed(1)},${y0.toFixed(1)}`
  if (count === 1) return path
  const slopes: number[] = []
  for (let i = 0; i < count - 1; i++) {
    const [ax, ay] = points[i] as [number, number]
    const [bx, by] = points[i + 1] as [number, number]
    slopes.push(bx === ax ? 0 : (by - ay) / (bx - ax))
  }
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0] as number
    if (i === count - 1) return slopes[count - 2] as number
    const before = slopes[i - 1] as number
    const after = slopes[i] as number
    if (before * after <= 0) return 0
    return (2 * before * after) / (before + after)
  })
  for (let i = 0; i < count - 1; i++) {
    const [ax, ay] = points[i] as [number, number]
    const [bx, by] = points[i + 1] as [number, number]
    const third = (bx - ax) / 3
    const c1y = ay + (tangents[i] as number) * third
    const c2y = by - (tangents[i + 1] as number) * third
    path += `C${(ax + third).toFixed(1)},${c1y.toFixed(1)} ${(bx - third).toFixed(1)},${c2y.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`
  }
  return path
}

export interface ChartState {
  data: ChartData
  /** `chartValues(data)` on its way to the new numbers. */
  values: number[]
  /** The measured width of the chart, or `CHART_WIDTH` before it is known. */
  width: number
  /** The row under the pointer. */
  active: number | null
  setActive: (index: number | null) => void
  /** Unique on the page; gradients are named after it. */
  id: string
  /** Framework props for the outer element: the ref that measures it. */
  root?: Record<string, unknown>
}

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens.
 */
export function chartView(props: ViewProps, state: ChartState): View {
  const type = textValue(props.type) ?? "bar"
  const { rows, labels, series } = state.data
  const spark = type === "spark" || type === "sparkline"
  const round = type === "donut" || type === "pie"
  const height = Number(props.height) || (spark ? 36 : round ? 200 : 220)
  const format = (value: number) =>
    formatValue(value, {
      format: props.format ?? "compact",
      currency: props.currency,
      digits: props.digits,
      unit: props.unit,
      locale: props.locale as string | undefined,
    })
  const select =
    typeof props.onSelect === "function"
      ? (index: number) => (props.onSelect as (row: Datum) => void)(rows[index] as Datum)
      : undefined

  const count = labels.length
  const animated = series.map((item, index) => ({
    ...item,
    values: state.values.slice(index * count, (index + 1) * count),
  }))

  const legend =
    props.legend === undefined ? series.length > 1 || round : flag(props.legend)

  let body: View
  if (rows.length === 0 || series.length === 0) {
    body = view("div", { class: "iui-chart-empty" }, ["No data"])
  } else if (round) {
    body = donut({
      series: animated[0] as Series,
      labels,
      height,
      pie: type === "pie",
      active: state.active,
      setActive: state.setActive,
      format,
      select,
      colors: Array.isArray(props.colors) ? props.colors : [],
      legend,
    })
  } else {
    body = cartesian({
      id: state.id,
      type: spark ? "spark" : type,
      series: animated,
      labels,
      width: state.width,
      height,
      stacked: flag(props.stacked),
      grid: props.grid === undefined ? true : flag(props.grid),
      showLabels: flag(props.labels),
      active: state.active,
      setActive: state.setActive,
      format,
      select,
    })
  }

  return view(
    "div",
    {
      pass: state.root ?? {},
      class: joinClass("iui-el iui-chart", props.class),
      "data-type": type,
      role: "img",
      "aria-label": textValue(props["aria-label"]) ?? `${type} chart`,
      style: props.style,
    },
    [
      body,
      legend && !round && !spark
        ? view("div", { class: "iui-chart-legend" }, [
            series.map((item) =>
              view("span", { key: item.key, class: "iui-chart-legend-item" }, [
                view("i", { style: { background: item.color } }),
                item.name,
              ])
            ),
          ])
        : null,
    ]
  )
}

interface CartesianProps {
  id: string
  type: string
  series: Series[]
  labels: string[]
  width: number
  height: number
  stacked: boolean
  grid: boolean
  showLabels: boolean
  active: number | null
  setActive: (index: number | null) => void
  format: (value: number) => string
  select: ((index: number) => void) | undefined
}

interface PointerLike {
  clientX: number
  currentTarget: EventTarget | null
}

function cartesian(props: CartesianProps): View {
  const { id, type, series, labels, width, height, stacked, active, format } = props
  const spark = type === "spark"
  const bars = type === "bar"
  const count = labels.length
  const totals = labels.map((_, index) =>
    series.reduce((sum, item) => sum + Math.max(0, item.values[index] ?? 0), 0)
  )
  const all = series.flatMap((item) => item.values)
  const max = Math.max(0, ...(stacked ? totals : all))
  const min = Math.min(0, ...all)
  const scale = spark
    ? { low: Math.min(...all), high: Math.max(...all), ticks: [] as number[] }
    : niceScale(min, max)
  if (scale.low === scale.high) scale.high = scale.low + 1

  const tickLabels = scale.ticks.map(format)
  const left = spark ? 2 : Math.max(28, ...tickLabels.map((tick) => tick.length * 6.4 + 10))
  const right = spark ? 2 : 8
  const top = spark ? 3 : 10
  const bottom = spark ? 3 : 24
  const plotWidth = Math.max(10, width - left - right)
  const plotHeight = Math.max(10, height - top - bottom)
  const y = (value: number) =>
    top + plotHeight - ((value - scale.low) / (scale.high - scale.low)) * plotHeight
  const band = plotWidth / Math.max(1, count)
  const center = (index: number) =>
    bars || count === 1
      ? left + band * (index + 0.5)
      : left + (plotWidth * index) / (count - 1)

  const every = Math.max(1, Math.ceil((count * 56) / plotWidth))
  const marks: View[] = []

  if (bars) {
    const groupWidth = Math.min(band * 0.72, 56 * (stacked ? 1 : series.length))
    const barWidth = stacked ? groupWidth : groupWidth / series.length
    labels.forEach((_, index) => {
      let offset = 0
      series.forEach((item, seriesIndex) => {
        const value = item.values[index] ?? 0
        const base = stacked ? offset : 0
        const from = y(Math.min(base, base + value))
        const to = y(Math.max(base, base + value))
        if (stacked) offset += Math.max(0, value)
        const x =
          center(index) - groupWidth / 2 + (stacked ? 0 : barWidth * seriesIndex)
        const barHeight = Math.max(0, from - to)
        const corner = Math.min(4, barWidth / 2, barHeight)
        marks.push(
          view("rect", {
            key: `${item.key}-${index}`,
            class: "iui-chart-bar",
            x: x + (stacked ? 0 : 1),
            y: to,
            width: Math.max(1, barWidth - (stacked ? 0 : 2)),
            height: barHeight,
            rx: corner,
            fill: item.color,
            "data-dim": active !== null && active !== index ? "" : undefined,
          })
        )
        if (props.showLabels && barHeight > 0) {
          marks.push(
            view(
              "text",
              {
                key: `label-${item.key}-${index}`,
                class: "iui-chart-value",
                x: x + barWidth / 2,
                y: to - 5,
                "text-anchor": "middle",
              },
              [format(value)]
            )
          )
        }
      })
    })
  } else {
    series.forEach((item, seriesIndex) => {
      const points = item.values.map(
        (value, index) => [center(index), y(value)] as [number, number]
      )
      if (points.length === 0) return
      const path = linePath(points)
      if (type === "area" || spark) {
        const firstPoint = points[0] as [number, number]
        const lastPoint = points[points.length - 1] as [number, number]
        const baseline = y(Math.max(scale.low, 0))
        marks.push(
          view("path", {
            key: `area-${item.key}`,
            d: `${path}L${lastPoint[0].toFixed(1)},${baseline.toFixed(1)}L${firstPoint[0].toFixed(1)},${baseline.toFixed(1)}Z`,
            fill: `url(#${id}-${seriesIndex})`,
            stroke: "none",
          })
        )
      }
      marks.push(
        view("path", {
          key: `line-${item.key}`,
          class: "iui-chart-line",
          d: path,
          fill: "none",
          stroke: item.color,
        })
      )
      if (active !== null && points[active]) {
        const [dotX, dotY] = points[active] as [number, number]
        marks.push(
          view("circle", {
            key: `dot-${item.key}`,
            class: "iui-chart-dot",
            cx: dotX,
            cy: dotY,
            r: 4,
            fill: item.color,
          })
        )
      }
    })
  }

  const locate = (event: PointerLike) => {
    const bounds = (event.currentTarget as Element).getBoundingClientRect()
    const x = event.clientX - bounds.left - left
    const index = bars
      ? Math.floor(x / band)
      : Math.round((x / plotWidth) * (count - 1))
    return Math.min(count - 1, Math.max(0, index))
  }
  const { select } = props

  return view("div", { class: "iui-chart-plot", style: { height: px(height) } }, [
    view(
      "svg",
      {
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        on: {
          pointermove: (event: PointerLike) => props.setActive(locate(event)),
          pointerleave: () => props.setActive(null),
          click: select ? (event: PointerLike) => select(locate(event)) : undefined,
        },
        style: select ? { cursor: "pointer" } : undefined,
        "aria-hidden": "true",
      },
      [
        view("defs", {}, [
          series.map((item, index) =>
            view(
              "linearGradient",
              { key: item.key, id: `${id}-${index}`, x1: "0", y1: "0", x2: "0", y2: "1" },
              [
                view("stop", { offset: "0%", "stop-color": item.color, "stop-opacity": 0.28 }),
                view("stop", { offset: "100%", "stop-color": item.color, "stop-opacity": 0 }),
              ]
            )
          ),
        ]),
        !spark && props.grid
          ? scale.ticks.map((tick, index) =>
              view("g", { key: tick }, [
                view("line", {
                  class: "iui-chart-grid",
                  x1: left,
                  x2: width - right,
                  y1: y(tick),
                  y2: y(tick),
                  "data-zero": tick === 0 ? "" : undefined,
                }),
                view(
                  "text",
                  { class: "iui-chart-tick", x: left - 8, y: y(tick) + 3.5, "text-anchor": "end" },
                  [tickLabels[index]]
                ),
              ])
            )
          : null,
        !spark && active !== null && !bars
          ? view("line", {
              class: "iui-chart-cursor",
              x1: center(active),
              x2: center(active),
              y1: top,
              y2: top + plotHeight,
            })
          : null,
        marks,
        !spark
          ? labels.map((text, index) =>
              index % every === 0
                ? view(
                    "text",
                    {
                      key: index,
                      class: "iui-chart-tick",
                      x: center(index),
                      y: height - 6,
                      "text-anchor": "middle",
                    },
                    [text]
                  )
                : null
            )
          : null,
      ]
    ),
    !spark && active !== null
      ? view(
          "div",
          {
            class: "iui-chart-tooltip",
            style: {
              left: px(Math.min(Math.max(center(active), 70), width - 70)),
              top: px(top),
            },
          },
          [
            view("strong", {}, [labels[active]]),
            series.map((item) =>
              view("span", { key: item.key }, [
                view("i", { style: { background: item.color } }),
                series.length > 1 ? `${item.name} ` : "",
                view("b", {}, [format(Math.round((item.values[active] ?? 0) * 100) / 100)]),
              ])
            ),
          ]
        )
      : null,
  ])
}

interface DonutProps {
  series: Series
  labels: string[]
  height: number
  pie: boolean
  active: number | null
  setActive: (index: number | null) => void
  format: (value: number) => string
  select: ((index: number) => void) | undefined
  colors: unknown[]
  legend: boolean
}

function donut(props: DonutProps): View {
  const { series, labels, height, active, format, select } = props
  const values = series.values.map((value) => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  const sizePx = height
  const stroke = props.pie ? sizePx / 2 - 2 : Math.max(12, sizePx * 0.13)
  const r = sizePx / 2 - stroke / 2 - 2
  const circumference = 2 * Math.PI * r
  const gap = props.pie || values.length < 2 ? 0 : 2
  const tone = (index: number) =>
    color(props.colors[index]) ?? `var(--iui-color-chart-${(index % 6) + 1})`
  let offset = 0
  const shown = active ?? null
  return view("div", { class: "iui-chart-donut" }, [
    view("div", { class: "iui-chart-plot", style: { width: px(sizePx), height: px(sizePx) } }, [
      view(
        "svg",
        {
          width: sizePx,
          height: sizePx,
          viewBox: `0 0 ${sizePx} ${sizePx}`,
          "aria-hidden": "true",
        },
        [
          view("g", { transform: `rotate(-90 ${sizePx / 2} ${sizePx / 2})` }, [
            values.map((value, index) => {
              const length = (value / total) * circumference
              const dash = Math.max(0, length - gap)
              const segment = view("circle", {
                key: index,
                class: "iui-chart-segment",
                cx: sizePx / 2,
                cy: sizePx / 2,
                r,
                fill: "none",
                stroke: tone(index),
                "stroke-width": stroke,
                "stroke-dasharray": `${dash} ${circumference - dash}`,
                "stroke-dashoffset": -offset,
                "data-dim": shown !== null && shown !== index ? "" : undefined,
                on: {
                  pointerenter: () => props.setActive(index),
                  pointerleave: () => props.setActive(null),
                  click: select ? () => select(index) : undefined,
                },
                style: select ? { cursor: "pointer" } : undefined,
              })
              offset += length
              return segment
            }),
          ]),
        ]
      ),
      props.pie
        ? null
        : view("div", { class: "iui-chart-center" }, [
            view("b", {}, [
              format(Math.round((shown !== null ? (values[shown] ?? 0) : total) * 100) / 100),
            ]),
            view("span", {}, [shown !== null ? labels[shown] : "Total"]),
          ]),
    ]),
    props.legend
      ? view("div", { class: "iui-chart-legend", "data-side": "" }, [
          labels.map((text, index) =>
            view(
              "span",
              {
                key: index,
                class: "iui-chart-legend-item",
                "data-dim": shown !== null && shown !== index ? "" : undefined,
                on: {
                  pointerenter: () => props.setActive(index),
                  pointerleave: () => props.setActive(null),
                },
              },
              [
                view("i", { style: { background: tone(index) } }),
                text,
                view("b", {}, [`${Math.round(((values[index] ?? 0) / total) * 100)}%`]),
              ]
            )
          ),
        ])
      : null,
  ])
}
