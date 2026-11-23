import { isView, type View } from "@open-intelligent-ui/core/renderer"
import { type Child, type Component, component, type ElementData, h } from "../dom/node"
import { attributeName, attributeText, isHandlerName } from "./attributes"
import { listenerName } from "./dialect"

/** The renderer's own components a view can ask for by name. */
// biome-ignore lint/suspicious/noExplicitAny: parts take the props their view gives them
export type ViewParts = Record<string, Component<any>>

/**
 * Draws a framework-neutral view as nodes for the patcher. Children that
 * are not views are such nodes already and pass through.
 */
export function fromView(node: unknown, parts: ViewParts): Child {
  if (Array.isArray(node)) return node.map((item) => fromView(item, parts))
  if (!isView(node)) return node as Child
  if (node.tag.startsWith("#")) {
    const part = parts[node.tag.slice(1)]
    return part ? component(part, node.attrs, node.key) : null
  }
  return element(node, parts)
}

function element(node: View, parts: ViewParts): Child {
  const data: Required<Pick<ElementData, "attrs" | "on">> & ElementData = {
    key: node.key,
    attrs: {},
    on: {},
  }
  // What markup passed down comes named for a prop: `tabIndex`, `onKeydown`.
  for (const [name, value] of Object.entries(node.pass)) {
    if (name === "ref") {
      if (typeof value === "function") {
        const ref = value as (element: Element | null) => void
        data.hooks = { mounted: (target) => ref(target), removed: () => ref(null) }
      }
      continue
    }
    const event = listenerName(name, value)
    if (event) data.on[event] = value as (event: Event) => void
    else if (!isHandlerName(name)) {
      const attribute = attributeName(name)
      data.attrs[attribute] = attributeText(attribute, value)
    }
  }
  for (const [name, value] of Object.entries(node.attrs)) {
    if (name === "style") data.style = value as Record<string, string | number>
    else if (!isHandlerName(name)) data.attrs[name] = attributeText(name, value)
  }
  Object.assign(data.on, node.on)
  return h(
    node.tag,
    data,
    node.children.map((child) => fromView(child, parts))
  )
}
