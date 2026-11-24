import {
  COPIED_LIFETIME,
  codeText,
  codeView,
  copyCode,
  numberTarget,
  numberView,
  PRESET_NAMES,
  skeletonView,
  statView,
  type TableSort,
  tableView,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import type { Component } from "../dom/node"
import { Icon } from "../primitives/primitives"
import { fromView, type ViewParts } from "../render/view"
import { Chart } from "./Chart"
import { useTween } from "./tween"

/** A number that counts up or down to its new value. */
const AnimatedNumber: Component<ViewProps> = (instance) => {
  const goal = () => numberTarget(instance.props)
  const tween = useTween(
    instance,
    () => [goal().target],
    () => goal().duration
  )
  return () => fromView(numberView(instance.props, tween.current()[0] ?? goal().target), PARTS)
}

export const PARTS: ViewParts = { icon: Icon, number: AnimatedNumber }

/** One headline figure with its label and how it changed. */
const Stat: Component<ViewProps> = (instance) => () =>
  fromView(statView(instance.props, instance.children), PARTS)

/** A placeholder with the shape of content that is still loading. */
const Skeleton: Component<ViewProps> = (instance) => () =>
  fromView(skeletonView(instance.props), PARTS)

/** Code with its language and a copy button. */
const CodeBlock: Component<ViewProps> = (instance) => {
  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined
  instance.onUnmounted(() => clearTimeout(timer))
  return () => {
    const props = instance.props
    const code = codeText(props, undefined)
    const onCopy = () =>
      copyCode(props, code, () => {
        copied = true
        instance.invalidate()
        clearTimeout(timer)
        timer = setTimeout(() => {
          copied = false
          instance.invalidate()
        }, COPIED_LIFETIME)
      })
    return fromView(codeView(props, { code, copied, onCopy }), PARTS)
  }
}

/** A table of rows with sorting, paging and row selection. */
const DataTable: Component<ViewProps> = (instance) => {
  let sort: TableSort | null = null
  let page = 0
  const setSort = (next: TableSort | null) => {
    sort = next
    instance.invalidate()
  }
  const setPage = (next: number) => {
    page = next
    instance.invalidate()
  }
  return () => fromView(tableView(instance.props, { sort, page, setSort, setPage }), PARTS)
}

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, Component<ViewProps>> = {
  Chart,
  Stat,
  Number: AnimatedNumber,
  Skeleton,
  CodeBlock,
  DataTable,
}

export { PRESET_NAMES }
