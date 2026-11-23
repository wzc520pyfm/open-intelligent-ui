import {
  CHART_WIDTH,
  chartDataKey,
  chartValues,
  chartView,
  readChartData,
  type StyleMap,
} from "@open-intelligent-ui/core/renderer"
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"
import { toReact } from "../render/view"
import { useTween } from "./tween"

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

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens. Values animate when the data changes.
 */
export function Chart(input: ChartProps) {
  const { children: _children, className, style, ...rest } = input
  const props = { ...rest, class: className, style: style as StyleMap | undefined }
  const data = useMemo(
    () => readChartData(props),
    // Data arrives as fresh objects on every render; compare by content.
    [chartDataKey(props)]
  )
  const [ref, width] = useWidth(CHART_WIDTH)
  const [active, setActive] = useState<number | null>(null)
  const id = `iui-chart-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`
  const values = useTween(chartValues(data))
  return toReact(chartView(props, { data, values, width, active, setActive, id, root: { ref } }), {})
}
