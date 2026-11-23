<script lang="ts">
  import {
    CHART_WIDTH,
    type ChartData,
    chartDataKey,
    chartValues,
    chartView,
    readChartData,
    type ViewProps,
  } from "@open-intelligent-ui/core/renderer"
  import { createAttachmentKey } from "svelte/attachments"
  import Nodes from "../render/Nodes.svelte"
  import { useTween } from "./tween.svelte"

  /**
   * Bar, line, area, donut and sparkline charts drawn with SVG and colored from
   * the design's chart tokens. Values animate when the data changes.
   *
   * Props: `type`, `data`, `x`, `y`, `height`, `stacked`, `format`, `currency`,
   * `digits`, `unit`, `colors`, `legend`, `grid`, `labels`, `names`, `locale`
   * and `onSelect`, which is called with the row that was pressed.
   */
  let props: ViewProps = $props()

  const uid = $props.id()
  const id = `iui-chart-${uid.replace(/[^A-Za-z0-9_-]/g, "")}`

  let width = $state(CHART_WIDTH)
  let active = $state<number | null>(null)
  const setActive = (index: number | null) => {
    active = index
  }

  // Data arrives as fresh objects on every render; compare by content.
  let read: { key: string; data: ChartData } | undefined
  const data = $derived.by(() => {
    const key = chartDataKey(props)
    if (read?.key !== key) read = { key, data: readChartData(props) }
    return read.data
  })
  const tween = useTween(() => chartValues(data))

  const measured = (target: Element) => {
    const measure = () => {
      const next = target.clientWidth
      if (next > 0) width = next
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    return () => observer.disconnect()
  }
  const root = { [createAttachmentKey()]: measured }
</script>

<Nodes nodes={chartView(props, { data, values: tween.current(), width, active, setActive, id, root })} />
