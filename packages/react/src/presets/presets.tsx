import {
  COPIED_LIFETIME,
  codeText,
  codeView,
  copyCode,
  numberTarget,
  numberView,
  PRESET_NAMES,
  type StyleMap,
  skeletonView,
  statView,
  type TableSort,
  tableView,
} from "@open-intelligent-ui/core/renderer"
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useState,
} from "react"
import { Icon } from "../primitives/primitives"
import { toReact, type ViewParts } from "../render/view"
import { Chart } from "./Chart"
import { useTween } from "./tween"

type Props = Record<string, unknown> & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

function viewProps(props: Props) {
  const { children, className, style, ...rest } = props
  return { children, props: { ...rest, class: className, style: style as StyleMap | undefined } }
}

/** A number that counts up or down to its new value. */
function AnimatedNumber(input: Props) {
  const { props } = viewProps(input)
  const { target, duration } = numberTarget(props)
  const [current] = useTween([target], duration)
  return toReact(numberView(props, current ?? target), PARTS)
}

const PARTS: ViewParts = { icon: Icon, number: AnimatedNumber }

/** One headline figure with its label and how it changed. */
function Stat(input: Props) {
  const { props, children } = viewProps(input)
  return toReact(statView(props, children), PARTS)
}

/** A placeholder with the shape of content that is still loading. */
function Skeleton(input: Props) {
  return toReact(skeletonView(viewProps(input).props), PARTS)
}

/** Code with its language and a copy button. */
function CodeBlock(input: Props) {
  const [copied, setCopied] = useState(false)
  const { props, children } = viewProps(input)
  const code = codeText(props, children)
  const onCopy = () =>
    copyCode(props, code, () => {
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_LIFETIME)
    })
  return toReact(codeView(props, { code, copied, onCopy }), PARTS)
}

/** A table of rows with sorting, paging and row selection. */
function DataTable(input: Props) {
  const [sort, setSort] = useState<TableSort | null>(null)
  const [page, setPage] = useState(0)
  return toReact(tableView(viewProps(input).props, { sort, page, setSort, setPage }), PARTS)
}

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, ComponentType<Props>> = {
  Chart: Chart as ComponentType<Props>,
  Stat,
  Number: AnimatedNumber,
  Skeleton,
  CodeBlock,
  DataTable,
}

export { PRESET_NAMES }
