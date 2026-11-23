import {
  iconPlaceholder,
  iconSpec,
  imageView,
  PRIMITIVE_VIEWS,
} from "@open-intelligent-ui/core/renderer"
import { component } from "../render/component"
import { type AnyComponent, element } from "../render/node"
import { PARTS } from "../render/view"
import { stateless, type Widget } from "../render/widget"
import type { IconNode } from "./icons.generated"

type Tables = typeof import("./icons.generated")

/** What an icon is made of, and the names lucide-react puts in its class. */
interface IconData {
  name: string
  aliases: string[]
  node: IconNode
}

const drawings = new Map<string, IconData>()
const loading = new Set<string>()
/** The icons on screen that are waiting for a drawing. One arriving draws them again. */
const waiting = new Set<() => void>()

let tables: Tables | undefined
let tablesComing: Promise<Tables> | undefined

/** The list of icons is long, so it stays out of the way until an icon is drawn. */
function iconTables(): Promise<Tables> {
  tablesComing ??= import("./icons.generated").then((module) => {
    tables = module
    return module
  })
  return tablesComing
}

async function load(name: string): Promise<void> {
  const all = await iconTables()
  const loader = Object.hasOwn(all.ICON_LOADERS, name) ? all.ICON_LOADERS[name] : undefined
  if (!loader) return
  const file = Object.hasOwn(all.ICON_NAMES, name) ? (all.ICON_NAMES[name] as string) : name
  const aliases = Object.hasOwn(all.ICON_ALIASES, file) ? (all.ICON_ALIASES[file] as string[]) : []
  drawings.set(name, { name: file, aliases, node: (await loader()).default })
}

function arrived(): void {
  const redraws = [...waiting]
  waiting.clear()
  for (const redraw of redraws) redraw()
}

/** The icon's drawing, `null` when there is no such icon, `undefined` while it loads. */
function drawing(name: string, redraw: () => void): IconData | null | undefined {
  const ready = drawings.get(name)
  if (ready) return ready
  if (tables && !Object.hasOwn(tables.ICON_LOADERS, name)) return null
  waiting.add(redraw)
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

/** Draws a lucide icon by name, at the sizes and colors of the design. */
const icon: Widget = ({ redraw, cleanup }) => {
  cleanup(() => waiting.delete(redraw))
  return (props) => {
    const spec = iconSpec(props)
    const data = spec.name === null ? null : drawing(spec.name, redraw)
    if (!data) return iconPlaceholder(spec, data === null)
    // The same element lucide-react draws, so one stylesheet fits both.
    return element(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        width: spec.pixels,
        height: spec.pixels,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": spec.stroke,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: [
          "lucide",
          `lucide-${data.name}`,
          ...data.aliases.map((alias) => `lucide-${alias}`),
          spec.class,
        ].join(" "),
        "aria-hidden": spec.label ? undefined : "true",
        "aria-label": spec.label ?? undefined,
        role: spec.label ? "img" : undefined,
        style: spec.style,
      },
      data.node.map(([tag, attributes]) => element(tag, attributes, null))
    )
  }
}

PARTS.icon = icon

/** A picture, or a placeholder of the same shape once it has failed to load. */
const image: Widget = ({ redraw }) => {
  let failed = false
  const onError = () => {
    failed = true
    redraw()
  }
  return (props) => imageView(props, { failed, onError })
}

const shared = Object.fromEntries(
  Object.entries(PRIMITIVE_VIEWS).map(([name, draw]): [string, AnyComponent] => [
    name,
    component(stateless(draw)),
  ])
)

const Icon = component(icon)

/** The layout primitives of IUI markup, by tag name. */
export const PRIMITIVES: Record<string, AnyComponent> = {
  ...shared,
  icon: Icon,
  image: component(image),
}

export { Icon }
