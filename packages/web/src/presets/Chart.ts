import {
  CHART_WIDTH,
  type ChartData,
  chartDataKey,
  chartValues,
  chartView,
  readChartData,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import type { Component } from "../dom/node"
import { fromView } from "../render/view"
import { useTween } from "./tween"

let charts = 0

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens. Values animate when the data changes.
 *
 * Props: `type`, `data`, `x`, `y`, `height`, `stacked`, `format`, `currency`,
 * `digits`, `unit`, `colors`, `legend`, `grid`, `labels`, `names`, `locale`
 * and `onSelect`, which is called with the row that was pressed.
 */
export const Chart: Component<ViewProps> = (instance) => {
  let element: Element | null = null
  let width = CHART_WIDTH
  let active: number | null = null
  const id = `iui-chart-w${++charts}`
  const setActive = (index: number | null) => {
    if (active === index) return
    active = index
    instance.invalidate()
  }
  const root = {
    ref: (target: Element | null) => {
      element = target
    },
  }

  // Data arrives as fresh objects on every render; compare by content.
  let read: { key: string; data: ChartData } | undefined
  const data = () => {
    const key = chartDataKey(instance.props)
    if (read?.key !== key) read = { key, data: readChartData(instance.props) }
    return read.data
  }
  const tween = useTween(instance, () => chartValues(data()))

  let observer: ResizeObserver | undefined
  instance.onMounted(() => {
    const target = element
    if (!target) return
    const measure = () => {
      const next = target.clientWidth
      if (next > 0 && next !== width) {
        width = next
        instance.invalidate()
      }
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    observer = new ResizeObserver(measure)
    observer.observe(target)
  })
  instance.onUnmounted(() => observer?.disconnect())

  return () =>
    fromView(
      chartView(instance.props, {
        data: data(),
        values: tween.current(),
        width,
        active,
        setActive,
        id,
        root,
      }),
      {}
    )
}
