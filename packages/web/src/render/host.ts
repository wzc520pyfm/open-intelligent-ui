import { type Child, type Component, h, type Listener, type RawVNode } from "../dom/node"
import { createRoot, type Root } from "../dom/patch"
import { attributeName, attributeText, isHandlerName } from "./attributes"
import { emptyParts } from "./native"

/**
 * A component of the host application, for markup to use by its PascalCase
 * name: a custom element's tag, a tag with the properties it takes, or a
 * function that builds the DOM itself.
 */
export type HostComponent = string | HostElement | HostFunction

export interface HostElement {
  /** The custom element's tag name. */
  tag: string
  /**
   * Props to assign as properties instead of setting as attributes: the
   * ones that take arrays, objects or anything else an attribute can't hold.
   */
  properties?: readonly string[]
  /** The event each handler prop listens for, where it isn't the prop's name in lower case without `on`. */
  events?: Readonly<Record<string, string>>
}

/**
 * Builds a component's DOM. `children` are the nodes markup put inside it,
 * ready to be placed anywhere in what the function returns; they are kept
 * up to date in place. It is called again when a prop that isn't a handler
 * changes, with the same children.
 */
export type HostFunction = (props: Record<string, unknown>, children: Node[]) => Node | null

export const isHostElement = (type: unknown): type is HostElement =>
  typeof type === "object" && type !== null && typeof (type as HostElement).tag === "string"

/** What a custom element's event carries, the way a handler in markup expects it. */
function payload(event: Event): unknown {
  const detail = (event as CustomEvent).detail as unknown
  if (detail === null || detail === undefined) return event
  if (typeof detail === "object" && "value" in (detail as object)) {
    return (detail as { value: unknown }).value
  }
  return detail
}

/** Properties that replace an element's content. A reply never sets them, listed or not. */
const REWRITES = new Set(["innerHTML", "outerHTML", "textContent", "innerText", "outerText"])

const VALID_TAG = /^[a-z][a-z0-9._]*-[-a-z0-9._]*$/

/** Whether `tag` can name a custom element. Anything else is not drawn. */
export const isCustomTag = (tag: string): boolean => VALID_TAG.test(tag)

/**
 * Draws a host application's custom element. Props become attributes,
 * which is all a reply can be trusted to set; only the properties the host
 * listed are assigned. A handler listens for the event of its name.
 */
export function hostElement(
  type: string | HostElement,
  props: Record<string, unknown>,
  key: string | number | undefined,
  children: Child
): Child {
  const spec: HostElement = typeof type === "string" ? { tag: type } : type
  if (!isCustomTag(spec.tag)) return children
  const parts = emptyParts(key)
  const properties = new Set(spec.properties ?? [])
  for (const [name, value] of Object.entries(props)) {
    if (name === "key" || name === "children") continue
    if (typeof value === "function") {
      if (!/^on[A-Z]/.test(name)) continue
      const named = spec.events && Object.hasOwn(spec.events, name) ? spec.events[name] : undefined
      const handler = value as (payload: unknown, event: Event) => unknown
      const listener: Listener = (event: Event) => handler(payload(event), event)
      parts.on[named ?? name.slice(2).toLowerCase()] = listener
      continue
    }
    if (properties.has(name) && !REWRITES.has(name)) {
      ;(parts.props ??= {})[name] = value
      continue
    }
    if (name === "style") {
      if (value && typeof value === "object") parts.style = value as Record<string, string | number>
      continue
    }
    if (isHandlerName(name)) continue
    const attribute = attributeName(name)
    parts.attrs[attribute] = attributeText(attribute, value)
  }
  return h(spec.tag, parts, children)
}

export interface HostFunctionProps {
  type: HostFunction
  props: Record<string, unknown>
}

function signature(props: Record<string, unknown>): unknown {
  const plain: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (typeof value !== "function") plain[name] = value
  }
  return plain
}

/**
 * Runs a host function and keeps what it built on the page. The nodes it
 * was given as children belong to a tree of their own, which goes on being
 * patched wherever the function put them.
 */
export const HostFunctionComponent: Component<HostFunctionProps> = (instance) => {
  const holder = document.createDocumentFragment()
  const marker = document.createTextNode("")
  holder.appendChild(marker)
  // Inside a drawing, what markup put in the component is shapes too.
  let inner: Root | null = createRoot(holder, marker, instance.svg)

  // Handlers change with every render; the function keeps the ones it was first given.
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  const given = (): Record<string, unknown> => {
    const out: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(instance.props.props)) {
      if (typeof value !== "function") {
        out[name] = value
        continue
      }
      handlers[name] ??= (...args: unknown[]) => {
        const current = instance.props.props[name]
        return typeof current === "function" ? (current as (...a: unknown[]) => unknown)(...args) : undefined
      }
      out[name] = handlers[name]
    }
    return out
  }

  // What the function returned last, and the children it has been handed so far.
  let built: Node[] = []
  const handed = new WeakSet<Node>()
  let round = 0

  const childNodes = (): Node[] => {
    const list = [...(inner?.nodes() ?? []), marker]
    for (const node of list) handed.add(node)
    return list
  }

  /** Whether the marker is in what the function built, so a child put before it shows. */
  const marked = (): boolean => built.some((node) => node === marker || node.contains(marker))

  instance.onUnmounted(() => {
    inner?.unmount()
    inner = null
  })

  return (): RawVNode => {
    if (!marker.parentNode) holder.appendChild(marker)
    inner?.moveTo(marker.parentNode as Node, marker)
    inner?.render(instance.children)
    // A function that left the marker out has nowhere for a later child to
    // go, so it is asked again, this time with that child among the rest.
    if (!marked() && inner?.nodes().some((node) => !handed.has(node))) round++
    return {
      kind: "raw",
      key: undefined,
      signature: [signature(instance.props.props), round],
      create: () => {
        const node = instance.props.type(given(), childNodes())
        const made = node instanceof Node ? node : null
        built = made instanceof DocumentFragment ? [...made.childNodes] : made ? [made] : []
        return made
      },
    }
  }
}
