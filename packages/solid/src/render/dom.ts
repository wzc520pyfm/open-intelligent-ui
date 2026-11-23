import { addEvent, DelegatedEvents, delegateEvents } from "@solidjs/web"

export type Space = "html" | "svg" | "math"

const SPACES: Record<Exclude<Space, "html">, string> = {
  svg: "http://www.w3.org/2000/svg",
  math: "http://www.w3.org/1998/Math/MathML",
}

const XLINK = "http://www.w3.org/1999/xlink"
const XML = "http://www.w3.org/XML/1998/namespace"

export function createElement(tag: string, space: Space): Element {
  return space === "html"
    ? document.createElement(tag)
    : document.createElementNS(SPACES[space], tag)
}

/** Attributes that are on or off, whatever they are set to. */
const BOOLEAN = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "inert",
  "ismap",
  "itemscope",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "readonly",
  "required",
  "reversed",
  "selected",
])

/** What an element has been given so far, so the next props change only what differs. */
export interface Applied {
  props: Record<string, unknown>
  listeners: Map<string, { run: ((event: Event) => void) | undefined }>
}

export const nothingApplied = (): Applied => ({ props: {}, listeners: new Map() })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** `fontSize` as `font-size`, the way a stylesheet spells it. */
export function cssName(name: string): string {
  if (name.startsWith("--") || !/[A-Z]/.test(name)) return name
  return name.replace(/^ms(?=[A-Z])/, "-ms").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function setStyle(element: Element, next: unknown, before: unknown, own: boolean): void {
  const style = (element as HTMLElement).style
  if (!style) return
  if (typeof next === "string") {
    // Only the host writes a style as text; markup's is always read into a map first.
    if (own) style.cssText = next
    return
  }
  if (typeof before === "string") style.cssText = ""
  const was = isRecord(before) ? before : {}
  const now = isRecord(next) ? next : {}
  for (const name of Object.keys(was)) {
    if (now[name] === undefined || now[name] === null || now[name] === false) {
      style.removeProperty(cssName(name))
    }
  }
  for (const [name, value] of Object.entries(now)) {
    if (value === undefined || value === null || value === false || value === was[name]) continue
    const text = String(value)
    // Assigned by its script name where there is one, as React and Vue do, so
    // a property the browser doesn't know is dropped by all three alike.
    if (name.startsWith("--") || name.includes("-")) style.setProperty(name, text)
    else (style as unknown as Record<string, string>)[name] = text
  }
  if (!element.getAttribute("style")) element.removeAttribute("style")
}

function listen(element: Element, applied: Applied, event: string, run: unknown): void {
  const handler = typeof run === "function" ? (run as (event: Event) => void) : undefined
  const cell = applied.listeners.get(event)
  if (cell) {
    cell.run = handler
    return
  }
  if (!handler) return
  const added = { run: handler as ((event: Event) => void) | undefined }
  applied.listeners.set(event, added)
  // One listener for the element's lifetime, which calls whatever handler the
  // latest props hold.
  const call = (occurred: Event) => added.run?.(occurred)
  if (DelegatedEvents.has(event)) {
    // Delegated like the handlers of UI SDK's parts, so a click reaches an
    // inner handler before an outer one whichever of the two drew the element.
    addEvent(element, event, call, true)
    delegateEvents([event])
  } else {
    element.addEventListener(event, call)
  }
}

function setAttribute(element: Element, name: string, value: unknown): void {
  try {
    if (value === undefined || value === null) {
      element.removeAttribute(name)
      return
    }
    let text: string
    if (typeof value === "boolean") {
      if (BOOLEAN.has(name.toLowerCase())) {
        if (value) element.setAttribute(name, "")
        else element.removeAttribute(name)
        return
      }
      text = String(value)
    } else {
      text = String(value)
    }
    if (name.startsWith("xlink:")) element.setAttributeNS(XLINK, name, text)
    else if (name.startsWith("xml:")) element.setAttributeNS(XML, name, text)
    else element.setAttribute(name, text)
  } catch {
    // Not a name an attribute can have. Nothing to set.
  }
}

const isControl = (element: Element): element is HTMLInputElement | HTMLTextAreaElement =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement

/** Sets a `<select>`'s choice, which only holds once its options exist. */
export function settle(element: Element, props: Record<string, unknown>): void {
  if (!(element instanceof HTMLSelectElement) || !("value" in props)) return
  const value = props.value
  const text = value === undefined || value === null ? "" : String(value)
  const choose = () => {
    if (element.value !== text) element.value = text
  }
  choose()
  // Options added in this pass are in the element only once Solid has run.
  queueMicrotask(choose)
}

function setProp(
  element: Element,
  applied: Applied,
  name: string,
  value: unknown,
  before: unknown,
  own: boolean
): void {
  if (name === "key" || name === "children") return
  if (name === "ref") {
    // A view asks for its element this way. Markup has no such prop.
    if (own && before === undefined && typeof value === "function") {
      ;(value as (element: Element) => void)(element)
    }
    return
  }
  if (name === "style") {
    setStyle(element, value, before, own)
    return
  }
  if (/^on[A-Z]/.test(name)) {
    listen(element, applied, name.slice(2).toLowerCase(), value)
    return
  }
  // An attribute holds text. A function or a symbol has none worth showing.
  const plain = typeof value === "function" || typeof value === "symbol" ? undefined : value
  if (name === "class") {
    setAttribute(element, "class", plain === "" || plain === false ? undefined : plain)
    return
  }
  // The live state of a control is a property; its attribute is only where it starts.
  if (name === "value" && isControl(element)) {
    const text = plain === undefined || plain === null ? "" : String(plain)
    if (element.value !== text) element.value = text
    return
  }
  if (name === "value" && element instanceof HTMLSelectElement) return
  if (name === "checked" && element instanceof HTMLInputElement) {
    if (element.checked !== Boolean(plain)) element.checked = Boolean(plain)
    return
  }
  if (name === "selected" && element instanceof HTMLOptionElement) {
    if (element.selected !== Boolean(plain)) element.selected = Boolean(plain)
    return
  }
  if (name === "defaultValue") {
    if (element instanceof HTMLTextAreaElement) {
      if (plain !== before) element.defaultValue = plain === undefined || plain === null ? "" : String(plain)
    } else if (plain !== before) {
      setAttribute(element, "value", plain)
    }
    return
  }
  if (name === "defaultChecked") {
    if (plain !== before) setAttribute(element, "checked", Boolean(plain))
    return
  }
  if (plain !== before) setAttribute(element, name, plain)
}

/** Props a control is held to on every pass, since the reader may have changed it. */
const HELD = new Set(["value", "checked", "selected"])

/**
 * Gives an element its props: `class`, a `style` map, `on…` handlers, the
 * live value of a control, and attributes. There is no way through here to
 * set a DOM property by name or to hand out the element, except for a view
 * of the renderer's own (`own`), which may ask for its element with `ref`.
 */
export function applyProps(
  element: Element,
  applied: Applied,
  next: Record<string, unknown>,
  own: boolean
): void {
  const before = applied.props
  for (const name of Object.keys(before)) {
    if (!(name in next)) setProp(element, applied, name, undefined, before[name], own)
  }
  for (const [name, value] of Object.entries(next)) {
    if (HELD.has(name)) continue
    if (value !== before[name] || name === "style") {
      setProp(element, applied, name, value, before[name], own)
    }
  }
  // After `type`, `min` and `max`, which decide what a value may be.
  for (const name of HELD) {
    if (name in next) setProp(element, applied, name, next[name], before[name], own)
  }
  applied.props = next
}
