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
import { type Component, defineComponent, onBeforeUnmount, ref, shallowRef } from "vue"
import { Icon } from "../primitives/primitives"
import { toVue, type ViewParts } from "../render/view"
import { Chart } from "./Chart"
import { useTween } from "./tween"

/** A number that counts up or down to its new value. */
const AnimatedNumber = defineComponent({
  name: "IuiNumber",
  inheritAttrs: false,
  setup(_, { attrs }) {
    const goal = () => numberTarget(attrs as ViewProps)
    const tween = useTween(
      () => [goal().target],
      () => goal().duration
    )
    return () => toVue(numberView(attrs as ViewProps, tween.current()[0] ?? goal().target), PARTS)
  },
})

const PARTS: ViewParts = { icon: Icon, number: AnimatedNumber }

/** One headline figure with its label and how it changed. */
const Stat = defineComponent({
  name: "IuiStat",
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => toVue(statView(attrs as ViewProps, slots.default?.()), PARTS)
  },
})

/** A placeholder with the shape of content that is still loading. */
const Skeleton = defineComponent({
  name: "IuiSkeleton",
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => toVue(skeletonView(attrs as ViewProps), PARTS)
  },
})

/** Code with its language and a copy button. */
const CodeBlock = defineComponent({
  name: "IuiCodeBlock",
  inheritAttrs: false,
  setup(_, { attrs }) {
    const copied = ref(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    onBeforeUnmount(() => clearTimeout(timer))
    return () => {
      const props = attrs as ViewProps
      const code = codeText(props, undefined)
      const onCopy = () =>
        copyCode(props, code, () => {
          copied.value = true
          clearTimeout(timer)
          timer = setTimeout(() => {
            copied.value = false
          }, COPIED_LIFETIME)
        })
      return toVue(codeView(props, { code, copied: copied.value, onCopy }), PARTS)
    }
  },
})

/** A table of rows with sorting, paging and row selection. */
const DataTable = defineComponent({
  name: "IuiDataTable",
  inheritAttrs: false,
  setup(_, { attrs }) {
    const sort = shallowRef<TableSort | null>(null)
    const page = ref(0)
    const setSort = (next: TableSort | null) => {
      sort.value = next
    }
    const setPage = (next: number) => {
      page.value = next
    }
    return () =>
      toVue(
        tableView(attrs as ViewProps, { sort: sort.value, page: page.value, setSort, setPage }),
        PARTS
      )
  },
})

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, Component> = {
  Chart,
  Stat,
  Number: AnimatedNumber,
  Skeleton,
  CodeBlock,
  DataTable,
}

export { PRESET_NAMES }
