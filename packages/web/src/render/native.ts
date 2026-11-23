import type { Child, ElementData, ElementVNode, Listener } from "../dom/node"
import { h } from "../dom/node"
import { attributeName, attributeText, isHandlerName } from "./attributes"
import { listenerName } from "./dialect"

/**
 * The few properties an element is given instead of an attribute, because
 * the attribute only says how the element starts out: what a control holds
 * now, whether a disclosure is open, which option is picked, whether media
 * is muted.
 */
const LIVE: Record<string, readonly string[]> = {
  input: ["value", "checked"],
  textarea: ["value"],
  select: ["value"],
  details: ["open"],
}

export type ElementParts = Required<Pick<ElementData, "attrs" | "on">> & ElementData

export function emptyParts(key?: string | number): ElementParts {
  return { key, attrs: {}, on: {} }
}

/**
 * Files one prop of a native element: a handler becomes a listener, `style`
 * stays a map, a control's value is kept live, and the rest are attributes.
 * Text is never an inline handler and never markup.
 */
export function nativeProp(
  tag: string,
  parts: ElementParts,
  name: string,
  value: unknown,
  /** The name is the attribute's already, as it is for what the shared renderer names. */
  exact = false
) {
  if (name === "key" || name === "children") return
  if (typeof value === "function") {
    const event = listenerName(name, value)
    if (event) parts.on[event] = value as Listener
    return
  }
  if (name === "style") {
    if (value && typeof value === "object") parts.style = value as Record<string, string | number>
    return
  }
  // `^name` asks for the attribute where a property of that name exists.
  if (name.startsWith("^")) {
    const attribute = name.slice(1)
    if (!isHandlerName(attribute)) parts.attrs[attribute] = attributeText(attribute, value)
    return
  }
  if (isHandlerName(name)) return
  const attribute = exact ? name : attributeName(name)
  if (LIVE[tag]?.includes(attribute)) {
    if (value !== undefined) (parts.live ??= {})[attribute] = attribute === "value" ? value : Boolean(value)
    return
  }
  // The attribute is the default; which option is picked now is the property.
  if (attribute === "selected" && tag === "option") {
    ;(parts.props ??= {}).selected = Boolean(value)
    return
  }
  if (attribute === "muted" && (tag === "video" || tag === "audio")) {
    ;(parts.props ??= {}).muted = Boolean(value)
  }
  parts.attrs[attribute] = attributeText(attribute, value)
}

/** An HTML or SVG element from props the shared renderer built. */
export function nativeElement(
  tag: string,
  props: Record<string, unknown>,
  key: string | number | undefined,
  children: Child
): ElementVNode {
  const parts = emptyParts(key)
  for (const [name, value] of Object.entries(props)) nativeProp(tag, parts, name, value, true)
  return h(tag, parts, children)
}
