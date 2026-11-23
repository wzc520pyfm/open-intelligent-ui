import { isView, type View } from "@open-intelligent-ui/core/renderer"
import type { AnyComponent, ElementNode, Item, RenderNode } from "./node"
import { nativeProps } from "./props"

/** The renderer's own components a view can ask for by name: `icon`, `number`. */
export const PARTS: Record<string, AnyComponent> = {}

const VOID = new Set(["br", "hr", "img", "input", "col", "wbr", "area", "source", "track", "embed"])

/** A key as one step of a longer key, so no two paths through fragments spell the same one. */
const step = (key: string | number) => String(key).replace(/[\\/]/g, "\\$&")

function fromView(view: View, key: string): Item | null {
  if (view.tag.startsWith("#")) {
    const type = PARTS[view.tag.slice(1)]
    return type ? { kind: "component", type, props: view.attrs, key, children: [] } : null
  }
  const props: Record<string | symbol, unknown> = {}
  for (const [name, value] of Object.entries(view.pass)) {
    // Handlers markup passed down are named the way the views read them, `onClick`.
    props[/^on[A-Z]/.test(name) ? name.toLowerCase() : name] = value
  }
  for (const symbol of Object.getOwnPropertySymbols(view.pass)) props[symbol] = view.pass[symbol as never]
  Object.assign(props, view.attrs)
  for (const [name, listener] of Object.entries(view.on)) props[`on${name}`] = listener
  const empty = view.children.length === 0 && VOID.has(view.tag)
  return {
    kind: "element",
    tag: view.tag,
    props: nativeProps(props),
    key,
    children: empty ? null : view.children,
  }
}

function add(node: unknown, prefix: string, position: number, out: Item[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return
  if (typeof node === "string" || typeof node === "number") {
    out.push({ kind: "text", key: `${prefix}#${position}`, text: String(node) })
    return
  }
  if (Array.isArray(node)) {
    addAll(node, `${prefix}${position}/`, out)
    return
  }
  if (isView(node)) {
    const key = node.key === undefined ? `${prefix}@${position}` : `${prefix}=${step(node.key)}`
    const item = fromView(node, key)
    if (item) out.push(item)
    return
  }
  const given = node as Exclude<RenderNode, string>
  const key = `${prefix}${step(given.key)}`
  if (given.kind === "fragment") addAll(given.children, `${key}/`, out)
  else if (given.kind === "view") {
    const drawn = given.draw(given.props, given.children)
    if (isView(drawn)) {
      const item = fromView(drawn, key)
      if (item) out.push(item)
    } else add(drawn, `${key}/`, 0, out)
  } else out.push(key === given.key ? given : { ...given, key })
}

function addAll(nodes: readonly unknown[], prefix: string, out: Item[]): void {
  nodes.forEach((node, position) => {
    add(node, prefix, position, out)
  })
}

/**
 * What a list of children comes to once fragments are opened and the
 * renderer's stateless parts are drawn: text, elements and components, each
 * with a key no sibling shares. The same node gets the same key every time,
 * which is how what is on screen is matched to what should be.
 */
export function flatten(nodes: unknown): Item[] {
  const out: Item[] = []
  if (Array.isArray(nodes)) addAll(nodes, "", out)
  else add(nodes, "", 0, out)
  return out
}

export type { ElementNode }
