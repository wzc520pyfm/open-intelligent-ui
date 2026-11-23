import {
  iconPlaceholder,
  iconSpec,
  imageView,
  PRIMITIVE_VIEWS,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import { type Component, h } from "../dom/node"
import { fromView, type ViewParts } from "../render/view"
import type { ICON_LOADERS, ICON_NAMES, IconNode } from "./icons.generated"

type Table = { loaders: typeof ICON_LOADERS; names: typeof ICON_NAMES }

interface Drawing {
  node: IconNode
  /** The icon's own name first, then the other names it goes by. */
  names: string[]
}

const drawings = new Map<string, Drawing>()
const loading = new Set<string>()
/** Icons on screen that are waiting for a drawing. */
const waiting = new Set<() => void>()

let table: Table | undefined
let tableComing: Promise<Table> | undefined

/** The list of icons is long, so it stays out of the way until an icon is drawn. */
function iconTable(): Promise<Table> {
  tableComing ??= import("./icons.generated").then((module) => {
    table = { loaders: module.ICON_LOADERS, names: module.ICON_NAMES }
    return table
  })
  return tableComing
}

async function load(name: string): Promise<void> {
  const { loaders, names } = await iconTable()
  const loader = Object.hasOwn(loaders, name) ? loaders[name] : undefined
  if (!loader) return
  const node = (await loader()).default
  drawings.set(name, { node, names: Object.hasOwn(names, name) ? (names[name] as string[]) : [name] })
}

function arrived() {
  for (const redraw of [...waiting]) redraw()
}

/** The icon's drawing, `null` when there is no such icon, `undefined` while it loads. */
function drawing(name: string): Drawing | null | undefined {
  const ready = drawings.get(name)
  if (ready) return ready
  if (table && !Object.hasOwn(table.loaders, name)) return null
  if (!loading.has(name)) {
    loading.add(name)
    void load(name).then(arrived, (error: unknown) => {
      loading.delete(name)
      console.error(error)
    })
  }
  return undefined
}

/** Loads icons ahead of time, so the first render draws them at once. */
export async function preloadIcons(...names: string[]): Promise<void> {
  await Promise.all(names.filter((name) => !drawings.has(name)).map(load))
  arrived()
}

const PARTS: ViewParts = {}

/** Draws a lucide icon by name, at the sizes and colors of the design. */
const Icon: Component<ViewProps> = (instance) => {
  const redraw = () => instance.invalidate()
  instance.onUnmounted(() => waiting.delete(redraw))
  return () => {
    const spec = iconSpec(instance.props)
    const data = spec.name === null ? null : drawing(spec.name)
    if (data === undefined) waiting.add(redraw)
    else waiting.delete(redraw)
    if (!data) return fromView(iconPlaceholder(spec, data === null), PARTS)
    // The same element lucide-react draws, so one stylesheet fits both.
    return h(
      "svg",
      {
        attrs: {
          xmlns: "http://www.w3.org/2000/svg",
          width: String(spec.pixels),
          height: String(spec.pixels),
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": String(spec.stroke),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          class: ["lucide", ...data.names.map((name) => `lucide-${name}`), spec.class]
            .filter(Boolean)
            .join(" "),
          "aria-hidden": spec.label ? undefined : "true",
          "aria-label": spec.label ?? undefined,
          role: spec.label ? "img" : undefined,
        },
        style: spec.style,
      },
      data.node.map(([tag, attributes]) =>
        h(tag, {
          attrs: Object.fromEntries(
            Object.entries(attributes)
              .filter(([name]) => name !== "key")
              .map(([name, value]) => [name, String(value)])
          ),
        })
      )
    )
  }
}

PARTS.icon = Icon

const Image: Component<ViewProps> = (instance) => {
  let failed = false
  const onError = () => {
    failed = true
    instance.invalidate()
  }
  return () => fromView(imageView(instance.props, { failed, onError }), PARTS)
}

const shared = Object.fromEntries(
  Object.entries(PRIMITIVE_VIEWS).map(([name, draw]): [string, Component<ViewProps>] => [
    name,
    (instance) => () => fromView(draw(instance.props, instance.children), PARTS),
  ])
)

/** The layout primitives of IUI markup, by tag name. */
export const PRIMITIVES: Record<string, Component<ViewProps>> = {
  ...shared,
  icon: Icon,
  image: Image,
}

export { Icon }
