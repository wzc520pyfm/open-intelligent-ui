import type { StyleMap } from "./tokens"

const VIEW = Symbol.for("open-intelligent-ui.view")

/**
 * A piece of DOM described without a framework, so React, Vue and whatever
 * comes next draw the primitives and presets from one description and end
 * up with the same elements.
 */
export interface View {
  readonly kind: typeof VIEW
  /** An element name, or `#icon` / `#number` for the renderer's own parts. */
  tag: string
  /** Attributes by their real names: `class`, `tabindex`, `stroke-width`. `style` is a `StyleMap`. */
  attrs: Record<string, unknown>
  /** Listeners by DOM event name in lower case: `click`, `keydown`, `pointermove`. */
  on: Record<string, ViewHandler>
  /** Props already named for the framework in use: what markup passed down, or a ref. */
  pass: Record<string, unknown>
  children: unknown[]
  key: string | number | undefined
}

// biome-ignore lint/suspicious/noExplicitAny: handlers receive whichever event the framework passes
export type ViewHandler = (event: any) => void

export interface ViewOptions {
  class?: string | undefined
  style?: StyleMap | undefined
  on?: Record<string, ViewHandler | undefined>
  pass?: Record<string, unknown>
  key?: string | number
  [attribute: string]: unknown
}

/**
 * Describes an element. A child is another view, a string or number, a list
 * of those, or a framework node, which is handed through untouched.
 */
export function view(tag: string, options: ViewOptions = {}, children: unknown[] = []): View {
  const { on, pass, key, ...attrs } = options
  const listeners: Record<string, ViewHandler> = {}
  for (const [name, listener] of Object.entries(on ?? {})) {
    if (listener) listeners[name] = listener
  }
  for (const name of Object.keys(attrs)) {
    if (attrs[name] === undefined) delete attrs[name]
  }
  return { kind: VIEW, tag, attrs, on: listeners, pass: pass ?? {}, children, key }
}

/** One of the renderer's own parts inside a view: an icon or an animated number. */
export function part(
  name: "icon" | "number",
  props: Record<string, unknown>,
  key?: string | number
): View {
  return { kind: VIEW, tag: `#${name}`, attrs: props, on: {}, pass: {}, children: [], key }
}

export function isView(value: unknown): value is View {
  return typeof value === "object" && value !== null && (value as View).kind === VIEW
}

export function joinClass(...names: (string | undefined | false | null)[]): string {
  return names.filter(Boolean).join(" ")
}

/** Whether a slot's content has anything to show. */
export function hasContent(children: unknown): boolean {
  if (children === null || children === undefined || children === false) return false
  if (Array.isArray(children)) return children.some(hasContent)
  return children !== ""
}

/** `8` as `8px`. Not every framework adds the unit to a bare number. */
export function px(value: number): string {
  return `${value}px`
}
