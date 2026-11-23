import { capitalize, isView, type View } from "@open-intelligent-ui/core/renderer"
import { type Component, h, type VNodeChild } from "vue"

/** The renderer's own components a view can ask for by name. */
export type ViewParts = Record<string, Component>

/**
 * Draws a framework-neutral view with Vue. Children that are not views are
 * Vue nodes already and pass through.
 */
export function toVue(node: unknown, parts: ViewParts): VNodeChild {
  if (Array.isArray(node)) return node.map((item) => toVue(item, parts))
  if (!isView(node)) return node as VNodeChild
  if (node.tag.startsWith("#")) {
    const part = parts[node.tag.slice(1)]
    return part ? h(part, { ...node.attrs, key: node.key }) : null
  }
  return element(node, parts)
}

function element(node: View, parts: ViewParts): VNodeChild {
  const props: Record<string, unknown> = { ...node.pass, ...node.attrs, key: node.key }
  for (const [name, listener] of Object.entries(node.on)) {
    props[`on${capitalize(name)}`] = listener
  }
  return h(
    node.tag,
    props,
    node.children.map((child) => toVue(child, parts))
  )
}
