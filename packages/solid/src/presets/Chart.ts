import {
  CHART_WIDTH,
  type ChartData,
  chartDataKey,
  chartValues,
  chartView,
  readChartData,
} from "@open-intelligent-ui/core/renderer"
import { component } from "../render/component"
import type { AnyComponent } from "../render/node"
import type { Widget } from "../render/widget"
import { createTween } from "./tween"

let charts = 0

const chart: Widget = (handle) => {
  const { redraw, cleanup } = handle
  const id = `iui-chart-s${++charts}`
  let target: HTMLElement | undefined
  let width = CHART_WIDTH
  let active: number | null = null
  let observer: ResizeObserver | undefined
  const setActive = (index: number | null) => {
    if (active === index) return
    active = index
    redraw()
  }

  const measure = () => {
    const next = target?.clientWidth ?? 0
    if (next > 0 && next !== width) {
      width = next
      redraw()
    }
  }
  const ref = (element: HTMLElement) => {
    target = element
    // The element is in the page once this pass is over.
    queueMicrotask(measure)
    if (typeof ResizeObserver === "undefined") return
    observer = new ResizeObserver(measure)
    observer.observe(element)
  }
  cleanup(() => observer?.disconnect())

  // Data arrives as fresh objects on every render; compare by content.
  let read: { key: string; data: ChartData } | undefined
  const current = createTween(handle)

  return (props) => {
    const key = chartDataKey(props)
    if (read?.key !== key) read = { key, data: readChartData(props) }
    return chartView(props, {
      data: read.data,
      values: current(chartValues(read.data)),
      width,
      active,
      setActive,
      id,
      root: { ref },
    })
  }
}

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens. Values animate when the data changes.
 *
 * Props: `type`, `data`, `x`, `y`, `height`, `stacked`, `format`, `currency`,
 * `digits`, `unit`, `colors`, `legend`, `grid`, `labels`, `names`, `locale`
 * and `onSelect`, which is called with the row that was pressed.
 */
export const Chart: AnyComponent = component(chart)
