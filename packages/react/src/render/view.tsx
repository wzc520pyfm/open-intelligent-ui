import { isView, type View } from "@open-intelligent-ui/core/renderer"
import { type ComponentType, createElement, type ReactNode } from "react"
import { attributeProp, eventProp } from "./dialect"

/** The renderer's own components a view can ask for by name. */
export type ViewParts = Record<string, ComponentType<Record<string, unknown>>>

/**
 * Draws a framework-neutral view with React. Children that are not views
 * are React nodes already and pass through.
 */
export function toReact(node: unknown, parts: ViewParts): ReactNode {
  if (Array.isArray(node)) return node.map((item) => toReact(item, parts))
  if (!isView(node)) return node as ReactNode
  if (node.tag.startsWith("#")) {
    const Part = parts[node.tag.slice(1)]
    return Part ? createElement(Part, { ...node.attrs, key: node.key }) : null
  }
  return element(node, parts)
}

function element(node: View, parts: ViewParts): ReactNode {
  const props: Record<string, unknown> = { ...node.pass, key: node.key }
  for (const [name, value] of Object.entries(node.attrs)) {
    props[attributeProp(name)] = value
  }
  for (const [name, listener] of Object.entries(node.on)) {
    props[eventProp(name)] = listener
  }
  const children = node.children.map((child) => toReact(child, parts))
  return createElement(node.tag, props, ...children)
}
