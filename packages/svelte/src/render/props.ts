import { isHtmlAttribute } from "@open-intelligent-ui/core/renderer"
import { DOM_EVENTS } from "./dialect"

type Props = Record<string, unknown>
type Handler = (...args: unknown[]) => unknown

const STYLE_NAME = /^-{0,2}[A-Za-z][\w-]*$/

/**
 * Whether `value` is one whole CSS value. The style of an element is written
 * as text, so a value that ends its own declaration would start another one
 * of its choosing; such a value is not a value of the property it was given
 * for, and React and Vue, which set each property by itself, ignore it too.
 */
function wholeValue(value: string): boolean {
  let quote = ""
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    const ch = value[index] as string
    if (ch === "\\") {
      // An escape at the very end would take in whatever is written after it.
      if (index === value.length - 1) return false
      index++
    } else if (quote) {
      if (ch === quote) quote = ""
      else if (ch === "\n" || ch === "\r" || ch === "\f") return false
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") {
      if (--depth < 0) return false
    } else if (ch === ";" || ch === "{" || ch === "}") return false
    else if (ch === "/" && value[index + 1] === "*") return false
  }
  return quote === "" && depth === 0
}

function styleName(name: string): string {
  if (name.startsWith("--")) return name
  return name.replace(/^ms(?=[A-Z])/, "-ms").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

/**
 * A style object as the text of a `style` attribute. Svelte sets styles
 * from text, and so does a UI SDK part when it adds its own.
 */
export function cssText(style: unknown): string | undefined {
  if (typeof style === "string") return style || undefined
  if (style === null || typeof style !== "object") return undefined
  const declarations: string[] = []
  for (const [name, value] of Object.entries(style)) {
    if (typeof value !== "string" && typeof value !== "number") continue
    const text = String(value).trim()
    if (!text || !STYLE_NAME.test(name) || !wholeValue(text)) continue
    declarations.push(`${styleName(name)}: ${text};`)
  }
  return declarations.length ? declarations.join(" ") : undefined
}

/** How a value reads once it is the text of an attribute, which is all it is in React. */
function attributeText(value: unknown): string | undefined {
  try {
    return String(value)
  } catch {
    return undefined
  }
}

/** Attributes whose presence is their meaning. Svelte sets these from a boolean. */
const BOOLEAN_ATTRIBUTES = new Set([
  "checked",
  "disabled",
  "hidden",
  "multiple",
  "open",
  "readonly",
  "required",
  "reversed",
  "selected",
])

/**
 * What an HTML or SVG element is given. Svelte sets a DOM property, not an
 * attribute, when a value isn't a string and the element has a property of
 * that name, so everything but a real boolean attribute is made text first:
 * a number or a list then lands where the same value lands in React.
 */
export function nativeProps(props: Record<string | symbol, unknown>): Record<string | symbol, unknown> {
  const out: Record<string | symbol, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue
    if (name === "style") {
      const style = cssText(value)
      if (style) out.style = style
    } else if (typeof value === "function") {
      if (/^on[a-z]+$/.test(name)) out[name] = value
    } else if (typeof value === "string") out[name] = value
    else if (typeof value === "boolean" && BOOLEAN_ATTRIBUTES.has(name)) out[name] = value
    else {
      const text = attributeText(value)
      if (text !== undefined) out[name] = text
    }
  }
  // An attachment a part of the renderer put there itself.
  for (const key of Object.getOwnPropertySymbols(props)) out[key] = props[key]
  return out
}

/**
 * Properties that are not attributes and do something an attribute of the
 * same name would not: the parts of a link's address, which would repoint a
 * link that was checked, and an element's text, which would replace what is
 * inside it. A component is only ever given text under these names.
 */
export const PROPERTY_SINKS = new Set([
  "hostname",
  "host",
  "protocol",
  "port",
  "pathname",
  "search",
  "hash",
  "username",
  "password",
  "text",
  "innertext",
  "outertext",
  "textcontent",
  "innerhtml",
  "outerhtml",
  "nodevalue",
  "srcobject",
  "classname",
  "htmlfor",
])

/** A value as React would leave it on an element under a name it doesn't know. */
function asAttribute(name: string, value: unknown): unknown {
  if (typeof value === "boolean") {
    if (name.startsWith("aria-") || name.startsWith("data-")) return String(value)
    if (isHtmlAttribute(name.toLowerCase())) return value
    return value ? "" : undefined
  }
  return attributeText(value)
}

function chain(first: unknown, second: Handler): Handler {
  if (typeof first !== "function") return second
  return (...args) => {
    ;(first as Handler)(...args)
    return second(...args)
  }
}

/** `onKeydown` and `onKeyDown` as `onkeydown`, which is what an element listens under. */
function handlerName(name: string): string {
  const event = name.slice(2).toLowerCase()
  return DOM_EVENTS.has(event) ? `on${event}` : name
}

const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1)

/**
 * What a component is given, for one that is not the renderer's own.
 *
 * A Svelte component passes what it doesn't take as a prop to its element,
 * and there Svelte sets a DOM property when the value isn't a string. So a
 * value that isn't text is only handed over under a name it can be a prop
 * under: for a UI SDK component (`known` is every prop UI SDK documents),
 * a name on that list; for a component of the host's, which says nothing
 * about its props, any name but the ones in `PROPERTY_SINKS`. Everything
 * else arrives as the text React would put in an attribute.
 *
 * `bind:name` becomes a prop the component can write: a `$bindable` prop
 * writes state when the component assigns it.
 */
export function componentProps(props: Props, known: ReadonlySet<string> | null): Props {
  const out: Props = {}
  const bound: [string, Handler][] = []
  for (const [written, value] of Object.entries(props)) {
    if (value === undefined) continue
    // Markup spells this the way React does. An element, and a Svelte component, call it `for`.
    const name = written === "htmlFor" ? "for" : written
    if (name.startsWith("bind:")) {
      if (typeof value === "function") bound.push([name.slice(5), value as Handler])
    } else if (name === "style") {
      const style = cssText(value)
      if (style) out.style = style
    } else if (typeof value === "function") {
      const event = handlerName(name)
      out[event] = chain(out[event], value as Handler)
    } else if (typeof value === "string" || name === "class") out[name] = value
    else if (PROPERTY_SINKS.has(name.toLowerCase()) || (known && !known.has(name))) {
      const attribute = asAttribute(name, value)
      if (attribute !== undefined) out[name] = attribute
    } else out[name] = value
  }

  for (const [name, write] of bound) {
    if (known) {
      // UI SDK calls `onValueChange` and then assigns the prop. The call
      // has written state already, so the assignment is only kept.
      continue
    }
    let held = out[name]
    Object.defineProperty(out, name, {
      enumerable: true,
      configurable: true,
      get: () => held,
      set: (next: unknown) => {
        held = next
        write(next)
      },
    })
  }

  if (known) hold(out, known)
  return out
}

/**
 * A UI SDK prop that has a `default…` twin or an `on…Change` callback is one
 * the component assigns when the user changes it. Written in markup with no
 * handler for the change, it is a value the surface holds, as it is in
 * React: the assignment is refused, and UI SDK then keeps what was given.
 */
function hold(out: Props, known: ReadonlySet<string>): void {
  for (const name of Object.keys(out)) {
    const changed = `on${capitalized(name)}Change`
    if (!known.has(changed) && !known.has(`default${capitalized(name)}`)) continue
    if (typeof out[changed] === "function") continue
    const value = out[name]
    Object.defineProperty(out, name, {
      enumerable: true,
      configurable: true,
      get: () => value,
      set: () => {},
    })
  }
}
