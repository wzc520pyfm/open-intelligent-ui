import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { color, flag, textValue } from "../render/tokens"
import { formatValue, useTween } from "./format"

type Datum = Record<string, unknown>

export interface ChartProps {
  type?: unknown
  data?: unknown
  /** Field with the category of each row. */
  x?: unknown
  /** Field, or list of fields, with the numbers to draw. */
  y?: unknown
  height?: unknown
  stacked?: unknown
  horizontal?: unknown
  format?: unknown
  currency?: unknown
  digits?: unknown
  unit?: unknown
  colors?: unknown
  legend?: unknown
  grid?: unknown
  labels?: unknown
  /** Display names for series, by field. */
  names?: unknown
  /** Called with the row that was pressed. */
  onSelect?: unknown
  className?: string
  style?: CSSProperties
  "aria-label"?: string
  locale?: string
  children?: ReactNode
}

interface Series {
  key: string
  name: string
  color: string
  values: number[]
}

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const next = element.clientWidth
      if (next > 0) setWidth(next)
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

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

function readData(props: ChartProps): { rows: Datum[]; labels: string[]; series: Series[] } {
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

function linePath(points: [number, number][]): string {
  let path = ""
  points.forEach(([x, y], index) => {
    if (index === 0) {
      path += `M${x.toFixed(1)},${y.toFixed(1)}`
      return
    }
    const [px, py] = points[index - 1] as [number, number]
    const mid = (px + x) / 2
    path += `C${mid.toFixed(1)},${py.toFixed(1)} ${mid.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
  })
  return path
}

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens. Values animate when the data changes.
 */
export function Chart(props: ChartProps) {
  const type = textValue(props.type) ?? "bar"
  const { rows, labels, series } = useMemo(
    () => readData(props),
    // Data arrives as fresh objects on every render; compare by content.
    [JSON.stringify([props.data, props.x, props.y, props.names, props.colors])]
  )
  const [ref, width] = useWidth(560)
  const [active, setActive] = useState<number | null>(null)
  const id = `iui-chart-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`
  const spark = type === "spark" || type === "sparkline"
  const round = type === "donut" || type === "pie"
  const height = Number(props.height) || (spark ? 36 : round ? 200 : 220)
  const format = (value: number) =>
    formatValue(value, {
      format: props.format ?? "compact",
      currency: props.currency,
      digits: props.digits,
      unit: props.unit,
      locale: props.locale,
    })
  const select =
    typeof props.onSelect === "function"
      ? (index: number) => (props.onSelect as (row: Datum) => void)(rows[index] as Datum)
      : undefined

  const flat = series.flatMap((item) => item.values)
  const tweened = useTween(flat)
  const count = labels.length
  const animated = series.map((item, index) => ({
    ...item,
    values: tweened.slice(index * count, (index + 1) * count),
  }))

  const label = props["aria-label"] ?? `${type} chart`
  const legend =
    props.legend === undefined
      ? series.length > 1 || round
      : flag(props.legend)

  let body: ReactNode
  if (rows.length === 0 || series.length === 0) {
    body = <div className="iui-chart-empty">No data</div>
  } else if (round) {
    body = (
      <Donut
        series={animated[0] as Series}
        labels={labels}
        height={height}
        pie={type === "pie"}
        active={active}
        setActive={setActive}
        format={format}
        select={select}
        colors={Array.isArray(props.colors) ? props.colors : []}
        legend={legend}
      />
    )
  } else {
    body = (
      <Cartesian
        id={id}
        type={spark ? "spark" : type}
        series={animated}
        labels={labels}
        width={width}
        height={height}
        stacked={flag(props.stacked)}
        grid={props.grid === undefined ? true : flag(props.grid)}
        showLabels={flag(props.labels)}
        active={active}
        setActive={setActive}
        format={format}
        select={select}
      />
    )
  }

  return (
    <div
      ref={ref}
      className={["iui-el iui-chart", props.className].filter(Boolean).join(" ")}
      data-type={type}
      role="img"
      aria-label={label}
      style={props.style}
    >
      {body}
      {legend && !round && !spark ? (
        <div className="iui-chart-legend">
          {series.map((item) => (
            <span key={item.key} className="iui-chart-legend-item">
              <i style={{ background: item.color }} />
              {item.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
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

function Cartesian(props: CartesianProps) {
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
  const marks: ReactNode[] = []

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
          <rect
            key={`${item.key}-${index}`}
            className="iui-chart-bar"
            x={x + (stacked ? 0 : 1)}
            y={to}
            width={Math.max(1, barWidth - (stacked ? 0 : 2))}
            height={barHeight}
            rx={corner}
            fill={item.color}
            data-dim={active !== null && active !== index ? "" : undefined}
          />
        )
        if (props.showLabels && barHeight > 0) {
          marks.push(
            <text
              key={`label-${item.key}-${index}`}
              className="iui-chart-value"
              x={x + barWidth / 2}
              y={to - 5}
              textAnchor="middle"
            >
              {format(value)}
            </text>
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
          <path
            key={`area-${item.key}`}
            d={`${path}L${lastPoint[0].toFixed(1)},${baseline.toFixed(1)}L${firstPoint[0].toFixed(1)},${baseline.toFixed(1)}Z`}
            fill={`url(#${id}-${seriesIndex})`}
            stroke="none"
          />
        )
      }
      marks.push(
        <path
          key={`line-${item.key}`}
          className="iui-chart-line"
          d={path}
          fill="none"
          stroke={item.color}
        />
      )
      if (active !== null && points[active]) {
        const [px, py] = points[active] as [number, number]
        marks.push(
          <circle
            key={`dot-${item.key}`}
            className="iui-chart-dot"
            cx={px}
            cy={py}
            r={4}
            fill={item.color}
          />
        )
      }
    })
  }

  const locate = (clientX: number, target: SVGSVGElement) => {
    const bounds = target.getBoundingClientRect()
    const x = clientX - bounds.left - left
    const index = bars
      ? Math.floor(x / band)
      : Math.round((x / plotWidth) * (count - 1))
    return Math.min(count - 1, Math.max(0, index))
  }

  return (
    <div className="iui-chart-plot" style={{ height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={(event) => props.setActive(locate(event.clientX, event.currentTarget))}
        onPointerLeave={() => props.setActive(null)}
        onClick={
          props.select
            ? (event) => props.select?.(locate(event.clientX, event.currentTarget))
            : undefined
        }
        style={props.select ? { cursor: "pointer" } : undefined}
        aria-hidden="true"
      >
        <defs>
          {series.map((item, index) => (
            <linearGradient
              key={item.key}
              id={`${id}-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={item.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {!spark && props.grid
          ? scale.ticks.map((tick, index) => (
              <g key={tick}>
                <line
                  className="iui-chart-grid"
                  x1={left}
                  x2={width - right}
                  y1={y(tick)}
                  y2={y(tick)}
                  data-zero={tick === 0 ? "" : undefined}
                />
                <text className="iui-chart-tick" x={left - 8} y={y(tick) + 3.5} textAnchor="end">
                  {tickLabels[index]}
                </text>
              </g>
            ))
          : null}
        {!spark && active !== null && !bars ? (
          <line
            className="iui-chart-cursor"
            x1={center(active)}
            x2={center(active)}
            y1={top}
            y2={top + plotHeight}
          />
        ) : null}
        {marks}
        {!spark
          ? labels.map((text, index) =>
              index % every === 0 ? (
                <text
                  key={index}
                  className="iui-chart-tick"
                  x={center(index)}
                  y={height - 6}
                  textAnchor="middle"
                >
                  {text}
                </text>
              ) : null
            )
          : null}
      </svg>
      {!spark && active !== null ? (
        <div
          className="iui-chart-tooltip"
          style={{
            left: Math.min(Math.max(center(active), 70), width - 70),
            top,
          }}
        >
          <strong>{labels[active]}</strong>
          {series.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              {series.length > 1 ? `${item.name} ` : ""}
              <b>{format(Math.round((item.values[active] ?? 0) * 100) / 100)}</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
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

function Donut(props: DonutProps) {
  const { series, labels, height, active, format } = props
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
  return (
    <div className="iui-chart-donut">
      <div className="iui-chart-plot" style={{ width: sizePx, height: sizePx }}>
        <svg width={sizePx} height={sizePx} viewBox={`0 0 ${sizePx} ${sizePx}`} aria-hidden="true">
          <g transform={`rotate(-90 ${sizePx / 2} ${sizePx / 2})`}>
            {values.map((value, index) => {
              const length = (value / total) * circumference
              const dash = Math.max(0, length - gap)
              const segment = (
                <circle
                  key={index}
                  className="iui-chart-segment"
                  cx={sizePx / 2}
                  cy={sizePx / 2}
                  r={r}
                  fill="none"
                  stroke={tone(index)}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  data-dim={shown !== null && shown !== index ? "" : undefined}
                  onPointerEnter={() => props.setActive(index)}
                  onPointerLeave={() => props.setActive(null)}
                  onClick={props.select ? () => props.select?.(index) : undefined}
                  style={props.select ? { cursor: "pointer" } : undefined}
                />
              )
              offset += length
              return segment
            })}
          </g>
        </svg>
        {props.pie ? null : (
          <div className="iui-chart-center">
            <b>
              {format(
                Math.round((shown !== null ? (values[shown] ?? 0) : total) * 100) / 100
              )}
            </b>
            <span>{shown !== null ? labels[shown] : "Total"}</span>
          </div>
        )}
      </div>
      {props.legend ? (
        <div className="iui-chart-legend" data-side="">
          {labels.map((text, index) => (
            <span
              key={index}
              className="iui-chart-legend-item"
              data-dim={shown !== null && shown !== index ? "" : undefined}
              onPointerEnter={() => props.setActive(index)}
              onPointerLeave={() => props.setActive(null)}
            >
              <i style={{ background: tone(index) }} />
              {text}
              <b>{Math.round(((values[index] ?? 0) / total) * 100)}%</b>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
