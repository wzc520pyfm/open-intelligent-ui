import {
  CHART_WIDTH,
  type ChartData,
  chartDataKey,
  chartValues,
  chartView,
  readChartData,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import { defineComponent, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import { usePageId } from "../render/usePageId"
import { toVue } from "../render/view"
import { useTween } from "./tween"

/**
 * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
 * the design's chart tokens. Values animate when the data changes.
 *
 * Props: `type`, `data`, `x`, `y`, `height`, `stacked`, `format`, `currency`,
 * `digits`, `unit`, `colors`, `legend`, `grid`, `labels`, `names`, `locale`
 * and `onSelect`, which is called with the row that was pressed.
 */
export const Chart = defineComponent({
  name: "IuiChart",
  inheritAttrs: false,
  setup(_, { attrs }) {
    const element = ref<HTMLElement | null>(null)
    const width = ref(CHART_WIDTH)
    const active = shallowRef<number | null>(null)
    const id = usePageId((raw) => `iui-chart-${raw.replace(/[^A-Za-z0-9_-]/g, "")}`)
    const setActive = (index: number | null) => {
      active.value = index
    }

    // Data arrives as fresh objects on every render; compare by content.
    let read: { key: string; data: ChartData } | undefined
    const data = () => {
      const key = chartDataKey(attrs as ViewProps)
      if (read?.key !== key) read = { key, data: readChartData(attrs as ViewProps) }
      return read.data
    }
    const tween = useTween(() => chartValues(data()))

    let observer: ResizeObserver | undefined
    onMounted(() => {
      const target = element.value
      if (!target) return
      const measure = () => {
        const next = target.clientWidth
        if (next > 0) width.value = next
      }
      measure()
      if (typeof ResizeObserver === "undefined") return
      observer = new ResizeObserver(measure)
      observer.observe(target)
    })
    onBeforeUnmount(() => observer?.disconnect())

    return () =>
      toVue(
        chartView(attrs as ViewProps, {
          data: data(),
          values: tween.current(),
          width: width.value,
          active: active.value,
          setActive,
          id,
          root: { ref: element },
        }),
        {}
      )
  },
})
