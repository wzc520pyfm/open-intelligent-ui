import { capitalize, isView } from "@open-intelligent-ui/core/renderer"
import type { Node } from "./node"
import type { Widget } from "./widget"

/** The renderer's own widgets a view can ask for by name: `#icon`, `#number`. */
export const PARTS: Record<string, Widget> = {}

/**
 * Turns a framework-neutral view into nodes to draw. Children that are not
 * views are nodes already and pass through.
 */
export function fromView(node: unknown): Node {
  if (Array.isArray(node)) return node.map(fromView)
  if (!isView(node)) return node as Node
  if (node.tag.startsWith("#")) {
    const widget = PARTS[node.tag.slice(1)]
    return widget
      ? { kind: "widget", widget, props: node.attrs, key: node.key, children: [] }
      : null
  }
  const props: Record<string, unknown> = { ...node.pass, ...node.attrs }
  for (const [name, listener] of Object.entries(node.on)) {
    props[`on${capitalize(name)}`] = listener
  }
  return {
    kind: "element",
    tag: node.tag,
    props,
    key: node.key,
    children: node.children.length ? node.children.map(fromView) : null,
    own: true,
  }
}
