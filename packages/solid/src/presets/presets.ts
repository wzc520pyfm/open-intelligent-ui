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
} from "@open-intelligent-ui/core/renderer"
import { component } from "../render/component"
import type { AnyComponent } from "../render/node"
import { PARTS } from "../render/view"
import { stateless, type Widget } from "../render/widget"
import { Chart } from "./Chart"
import { createTween } from "./tween"

/** A number that counts up or down to its new value. */
const number: Widget = (handle) => {
  const current = createTween(handle)
  return (props) => {
    const { target, duration } = numberTarget(props)
    return numberView(props, current([target], duration)[0] ?? target)
  }
}

PARTS.number = number

/** Code with its language and a copy button. */
const codeBlock: Widget = ({ redraw, cleanup }) => {
  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined
  cleanup(() => clearTimeout(timer))
  return (props) => {
    const code = codeText(props, undefined)
    const onCopy = () =>
      copyCode(props, code, () => {
        copied = true
        redraw()
        clearTimeout(timer)
        timer = setTimeout(() => {
          copied = false
          redraw()
        }, COPIED_LIFETIME)
      })
    return codeView(props, { code, copied, onCopy })
  }
}

/** A table of rows with sorting, paging and row selection. */
const dataTable: Widget = ({ redraw }) => {
  let sort: TableSort | null = null
  let page = 0
  const setSort = (next: TableSort | null) => {
    sort = next
    redraw()
  }
  const setPage = (next: number) => {
    page = next
    redraw()
  }
  return (props) => tableView(props, { sort, page, setSort, setPage })
}

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, AnyComponent> = {
  Chart,
  // One headline figure with its label and how it changed.
  Stat: component(stateless(statView)),
  Number: component(number),
  // A placeholder with the shape of content that is still loading.
  Skeleton: component(stateless((props) => skeletonView(props))),
  CodeBlock: component(codeBlock),
  DataTable: component(dataTable),
}

export { PRESET_NAMES }
