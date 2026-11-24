import { type ChartEngine, describeChart, EXTRA_TYPES } from "@open-intelligent-ui/core/charts"
import { prefersReducedMotion, type ViewProps } from "@open-intelligent-ui/core/renderer"
import type { ComponentType, CSSProperties, ReactNode } from "react"

// biome-ignore lint/suspicious/noExplicitAny: Recharts' own prop types are wider than what the adapter passes
type Part = ComponentType<any>

/** The parts of Recharts the adapter draws with: `import * as Recharts from "recharts"`. */
export interface RechartsLike {
  ResponsiveContainer: Part
  BarChart: Part
  Bar: Part
  LineChart: Part
  Line: Part
  AreaChart: Part
  Area: Part
  PieChart: Part
  Pie: Part
  Cell: Part
  XAxis: Part
  YAxis: Part
  CartesianGrid: Part
  Tooltip: Part
  Legend: Part
  /** With these, `scatter` is drawn too. */
  ScatterChart?: Part
  Scatter?: Part
  /** With these, `radar` is drawn too. */
  RadarChart?: Part
  Radar?: Part
  PolarGrid?: Part
  PolarAngleAxis?: Part
  /** With these, `funnel` is drawn too. */
  FunnelChart?: Part
  Funnel?: Part
  LabelList?: Part
}

export interface RechartsOptions {
  /** The engine's name, as the prompt gives it. */
  name?: string
  /** The chart types Recharts draws. The built-in SVG draws the rest. */
  types?: readonly string[]
  /** More for the prompt about charts in this product. */
  guide?: string
}

const TYPES = ["bar", "line", "area", "donut", "pie"] as const

const MUTED = "var(--iui-color-muted-foreground)"
const BORDER = "var(--iui-color-border)"

interface TipItem {
  name?: ReactNode
  value?: unknown
  color?: string
  payload?: { fill?: string }
}

interface Slice {
  cx: number
  cy: number
  x: number
  y: number
  index: number
  textAnchor: string
  name: string
  value: number
}

type ChartProps = Record<string, unknown> & { className?: string; style?: CSSProperties }

/**
 * Draws `<Chart>` with [Recharts](https://recharts.org). Recharts draws
 * SVG with React, so the design's colors reach it as they are and the
 * chart restyles with the surface.
 *
 * ```tsx
 * import * as Recharts from "recharts"
 * const library = defineLibrary({ charts: rechartsCharts(Recharts) })
 * ```
 *
 * `scatter`, `radar` and `funnel` are added when the Recharts given has
 * their parts. `spark` stays with the built-in chart.
 */
export function rechartsCharts(
  recharts: RechartsLike,
  options: RechartsOptions = {}
): ChartEngine<ComponentType<ChartProps>> {
  const {
    ResponsiveContainer,
    BarChart,
    Bar,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ScatterChart,
    Scatter,
    RadarChart,
    Radar,
    PolarGrid,
    PolarAngleAxis,
    FunnelChart,
    Funnel,
    LabelList,
  } = recharts
  // A build that imports only some of Recharts draws only those types.
  const extra = [
    ScatterChart && Scatter ? "scatter" : null,
    RadarChart && Radar && PolarGrid && PolarAngleAxis ? "radar" : null,
    FunnelChart && Funnel && LabelList ? "funnel" : null,
  ].filter((type): type is string => type !== null)
  const types = options.types ?? [...TYPES, ...extra]

  function RechartsChart(props: ChartProps) {
    const { className, style, ...rest } = props
    const chart = describeChart({ ...rest, class: className } as ViewProps)
    const { type, series, labels } = chart
    const animate = !prefersReducedMotion()
    const select = (index: unknown) => {
      const row = chart.rows[Number(index)]
      if (row !== undefined && typeof props.onSelect === "function") {
        ;(props.onSelect as (row: unknown) => void)(row)
      }
    }
    const pointer = chart.selectable ? "pointer" : undefined

    const tip = (title: boolean) => (
      <Tooltip
        cursor={type === "bar" ? { fill: MUTED, fillOpacity: 0.08 } : { stroke: BORDER }}
        isAnimationActive={false}
        content={(shown: { active?: boolean; label?: ReactNode; payload?: TipItem[] }) =>
          shown.active && shown.payload?.length ? (
            <div className="iui-chart-tip">
              {title ? <strong>{shown.label}</strong> : null}
              {shown.payload.map((item, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a tooltip's rows have no identity of their own
                <span key={index}>
                  <i style={{ background: item.color ?? item.payload?.fill }} />
                  {item.name}
                  <b>{typeof item.value === "number" ? chart.format(item.value) : String(item.value ?? "")}</b>
                </span>
              ))}
            </div>
          ) : null
        }
      />
    )
    const legend = chart.legend ? (
      <Legend
        iconType="square"
        iconSize={8}
        // In the order the data gives, not by name.
        itemSorter={null}
        formatter={(name: ReactNode) => <span style={{ color: MUTED, fontSize: 12 }}>{name}</span>}
      />
    ) : null

    let drawn: ReactNode
    const first = series[0]
    const slices = labels.map((name, index) => ({
      name,
      value: first?.values[index] ?? 0,
      fill: chart.palette[index],
    }))
    const total = slices.reduce((all, slice) => all + Math.max(0, slice.value), 0)
    if (type === "funnel" && FunnelChart && Funnel && LabelList) {
      drawn = (
        <FunnelChart margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <Funnel
            data={slices}
            dataKey="value"
            nameKey="name"
            stroke="none"
            isAnimationActive={animate}
            onClick={(_step: unknown, index: number) => select(index)}
            cursor={pointer}
          >
            <LabelList
              position="center"
              fill="#fff"
              fontSize={12}
              stroke="none"
              dataKey="name"
              formatter={(name: string) => `${name} ${chart.format(slices.find((slice) => slice.name === name)?.value ?? 0)}`}
            />
          </Funnel>
          {tip(false)}
          {legend}
        </FunnelChart>
      )
    } else if (type === "radar" && RadarChart && Radar && PolarGrid && PolarAngleAxis) {
      const data = labels.map((label, index) => {
        const row: Record<string, unknown> = { "#label": label }
        for (const item of series) row[item.key] = item.values[index]
        return row
      })
      drawn = (
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke={BORDER} />
          <PolarAngleAxis dataKey="#label" tick={{ fill: MUTED, fontSize: 12 }} />
          {series.map((item) => (
            <Radar
              key={item.key}
              dataKey={item.key}
              name={item.name}
              stroke={item.color}
              strokeWidth={2}
              fill={item.color}
              fillOpacity={0.16}
              isAnimationActive={animate}
            />
          ))}
          {tip(true)}
          {legend}
        </RadarChart>
      )
    } else if (type === "scatter" && ScatterChart && Scatter) {
      drawn = (
        <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          {chart.grid ? <CartesianGrid stroke={BORDER} /> : null}
          <XAxis
            type="number"
            dataKey="x"
            domain={["auto", "auto"]}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
          />
          <YAxis
            type="number"
            dataKey="y"
            width={48}
            domain={["auto", "auto"]}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => chart.format(value)}
          />
          {series.map((item) => (
            <Scatter
              key={item.key}
              name={item.name}
              data={item.values.map((y, index) => ({ x: Number(labels[index]), y }))}
              fill={item.color}
              fillOpacity={0.85}
              isAnimationActive={animate}
              onClick={(_point: unknown, index: number) => select(index)}
              cursor={pointer}
            />
          ))}
          <Tooltip
            cursor={{ stroke: BORDER }}
            isAnimationActive={false}
            content={(shown: { active?: boolean; payload?: { payload?: { x: number; y: number } }[] }) => {
              const point = shown.active ? shown.payload?.[0]?.payload : undefined
              return point ? (
                <div className="iui-chart-tip">
                  <span>
                    {point.x}
                    <b>{chart.format(point.y)}</b>
                  </span>
                </div>
              ) : null
            }}
          />
          {legend}
        </ScatterChart>
      )
    } else if (type === "donut" || type === "pie") {
      drawn = (
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={type === "donut" ? "58%" : 0}
            outerRadius="82%"
            // From twelve o'clock, clockwise, as the built-in chart draws it.
            startAngle={90}
            endAngle={-270}
            paddingAngle={type === "donut" ? 2 : 0}
            cornerRadius={type === "donut" ? 4 : 0}
            stroke="none"
            isAnimationActive={animate}
            label={
              chart.valueLabels || type === "donut"
                ? (slice: Slice) => (
                    <g>
                      {/* The total in the middle of a donut, as the built-in chart has it: drawn once, with the first slice. */}
                      {type === "donut" && slice.index === 0 ? (
                        <text x={slice.cx} y={slice.cy} textAnchor="middle" stroke="none">
                          <tspan x={slice.cx} dy="-0.1em" fill="var(--iui-color-foreground)" fontSize={20} fontWeight={650}>
                            {chart.format(Math.round(total * 100) / 100)}
                          </tspan>
                          <tspan x={slice.cx} dy="1.5em" fill={MUTED} fontSize={12}>
                            Total
                          </tspan>
                        </text>
                      ) : null}
                      {chart.valueLabels ? (
                        <text
                          x={slice.x}
                          y={slice.y}
                          textAnchor={slice.textAnchor as "start" | "middle" | "end"}
                          dominantBaseline="central"
                          fill={MUTED}
                          fontSize={12}
                        >
                          {slice.name} {chart.format(slice.value)}
                        </text>
                      ) : null}
                    </g>
                  )
                : false
            }
            labelLine={chart.valueLabels ? { stroke: BORDER } : false}
            onClick={(_slice: unknown, index: number) => select(index)}
            cursor={pointer}
          >
            {slices.map((slice) => (
              <Cell key={slice.name} fill={slice.fill} />
            ))}
          </Pie>
          {tip(false)}
          {legend}
        </PieChart>
      )
    } else {
      const data = labels.map((label, index) => {
        const row: Record<string, unknown> = { "#label": label }
        for (const item of series) row[item.key] = item.values[index]
        return row
      })
      const frame = (
        <>
          {chart.grid ? <CartesianGrid vertical={false} stroke={BORDER} /> : null}
          <XAxis
            dataKey="#label"
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: BORDER }}
          />
          <YAxis
            width={48}
            tick={{ fill: MUTED, fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => chart.format(value)}
          />
          {tip(true)}
          {legend}
        </>
      )
      const shared = { data, margin: { top: 8, right: 8, bottom: 0, left: 0 } }
      const value = chart.valueLabels
        ? { position: "top", fill: MUTED, fontSize: 11, formatter: (item: number) => chart.format(item) }
        : false
      // A line has no mark to press between its points: the place on the axis is what is picked.
      const pick = (state: { activeTooltipIndex?: unknown; activeIndex?: unknown } | null) => {
        const index = state?.activeTooltipIndex ?? state?.activeIndex
        if (index !== undefined && index !== null) select(index)
      }
      if (type === "bar") {
        drawn = (
          <BarChart {...shared}>
            {frame}
            {series.map((item) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.name}
                fill={item.color}
                stackId={chart.stacked ? "total" : undefined}
                radius={chart.stacked ? 0 : [4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={animate}
                label={value}
                onClick={(_bar: unknown, index: number) => select(index)}
                cursor={pointer}
              />
            ))}
          </BarChart>
        )
      } else if (type === "area") {
        drawn = (
          <AreaChart {...shared} onClick={chart.selectable ? pick : undefined}>
            {frame}
            {series.map((item) => (
              <Area
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={2}
                fill={item.color}
                fillOpacity={0.16}
                stackId={chart.stacked ? "total" : undefined}
                isAnimationActive={animate}
                label={value}
              />
            ))}
          </AreaChart>
        )
      } else {
        drawn = (
          <LineChart {...shared} onClick={chart.selectable ? pick : undefined}>
            {frame}
            {series.map((item) => (
              <Line
                key={item.key}
                type="monotone"
                dataKey={item.key}
                name={item.name}
                stroke={item.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={animate}
                label={value}
              />
            ))}
          </LineChart>
        )
      }
    }

    return (
      <div
        className={className ? `iui-el iui-chart iui-chart-engine ${className}` : "iui-el iui-chart iui-chart-engine"}
        data-type={type}
        data-engine="recharts"
        role="img"
        aria-label={chart.label}
        style={{ ...style, height: chart.height }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {drawn}
        </ResponsiveContainer>
      </div>
    )
  }

  const engine: ChartEngine<ComponentType<ChartProps>> = {
    name: options.name ?? "Recharts",
    types,
    component: RechartsChart,
  }
  const described = Object.entries(EXTRA_TYPES).filter(([type]) => types.includes(type))
  if (described.length) engine.extra = Object.fromEntries(described)
  if (options.guide) engine.guide = options.guide
  return engine
}
