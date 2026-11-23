import { isHtmlAttribute } from "@open-intelligent-ui/core/renderer"
import { DOM_EVENTS } from "./dialect.js"

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

// How React reads a value by the attribute it is for. Svelte reads it by
// its type instead: a string is an attribute, anything else a property.
// Markup is written once for every renderer, so React's reading is kept.

/** Present or absent: any truthy value is `""`. */
const PRESENCE = new Set([
  "allowfullscreen",
  "async",
  "autoplay",
  "controls",
  "default",
  "defer",
  "disabled",
  "disablepictureinpicture",
  "disableremoteplayback",
  "formnovalidate",
  "hidden",
  "inert",
  "itemscope",
  "loop",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "scoped",
  "seamless",
])
/** Attributes whose `true` and `false` are words. Elsewhere a boolean is no value at all. */
const WORDS = new Set([
  "contenteditable",
  "draggable",
  "spellcheck",
  "value",
  "defaultvalue",
  "autoreverse",
  "externalresourcesrequired",
  "focusable",
  "preservealpha",
])
const PRESENCE_OR_TEXT = new Set(["capture", "download"])
const POSITIVE = new Set(["cols", "rows", "size", "span"])
const NUMERIC = new Set(["rowspan", "start"])
/** Properties React sets on the element that has them. */
const STATE: Record<string, ReadonlySet<string>> = {
  checked: new Set(["input"]),
  multiple: new Set(["input", "select"]),
  muted: new Set(["audio", "video"]),
  selected: new Set(["option"]),
}
/** Elements whose `value` is what the reader typed or picked. */
const CONTROLS = new Set(["input", "textarea", "select", "option"])

/**
 * What an HTML or SVG element is given: text for an attribute, a boolean for
 * the few properties that are state, a listener under `on…`.
 *
 * Svelte sets a DOM property when a value isn't a string and the element has
 * a property of that name. Markup must not reach properties, and a number or
 * a list has to land where it lands in React, so everything is made text
 * here, by React's rules.
 */
export function nativeProps(
  props: Record<string | symbol, unknown>,
  tag?: string
): Record<string | symbol, unknown> {
  const out: Record<string | symbol, unknown> = {}
  // Svelte assigns `value` to the element whatever it is, and a `<progress>`
  // throws on a value that isn't a number. Under a name Svelte doesn't
  // know, it is the attribute it is in React.
  const valueName = tag !== undefined && !CONTROLS.has(tag) ? "VALUE" : "value"
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue
    const lower = name.toLowerCase()
    if (lower.startsWith("on")) {
      // Svelte listens under any name that starts with `on`, and an element
      // would run the text of an `ONCLICK` attribute. Only a listener goes there.
      if (typeof value === "function" && /^on[a-z]+$/.test(name)) out[name] = value
      continue
    }
    if (typeof value === "function" || typeof value === "symbol") continue
    // Svelte focuses an element it is told to. Where the reader's focus is isn't markup's to say.
    if (lower === "autofocus") continue
    if (name === "style") {
      const style = cssText(value)
      if (style) out.style = style
      continue
    }
    const state = STATE[lower]
    if (state && tag !== undefined && (state.has(tag) || lower === "multiple" || lower === "muted")) {
      // In upper case Svelte takes `selected` for a property like the rest.
      if (state.has(tag)) out[lower === "selected" ? "SELECTED" : name] = Boolean(value)
      continue
    }
    if (lower === "defaultchecked") {
      out[name] = Boolean(value)
      continue
    }
    if (PRESENCE.has(lower)) {
      if (value) out[name] = ""
      continue
    }
    const given = name === "value" ? valueName : name
    if (typeof value === "boolean") {
      if (PRESENCE_OR_TEXT.has(lower)) {
        if (value) out[given] = ""
      } else if (lower.startsWith("aria-") || lower.startsWith("data-") || WORDS.has(lower)) {
        out[given] = String(value)
      } else if ((POSITIVE.has(lower) || NUMERIC.has(lower)) && (value || NUMERIC.has(lower))) {
        out[given] = String(value)
      }
      continue
    }
    const text = typeof value === "string" ? value : attributeText(value)
    if (text === undefined) continue
    if (POSITIVE.has(lower) || NUMERIC.has(lower)) {
      const number = Number(typeof value === "object" ? text : value)
      if (Number.isNaN(number) || (POSITIVE.has(lower) && number < 1)) continue
    }
    out[given] = text
  }
  return out
}

/** An `<option>` as its `<select>` sees it. */
export interface SelectOption {
  value: string
  disabled: boolean
}

/**
 * What a `<select>` is given. Svelte picks the options by `value`, a list
 * for one that takes several. Where nothing matches it would pick none;
 * React leaves the first option that can be picked, and so does this.
 * `defaultvalue` is where the select starts, which is all `value` is to
 * Svelte, since it sets it again only when it changes.
 */
export function selectProps(
  props: Record<string, unknown>,
  options: readonly SelectOption[]
): Record<string | symbol, unknown> {
  const { value = props.defaultvalue, defaultvalue: _, ...rest } = props
  const out = nativeProps(rest, "select")
  if (value === undefined || value === null) return out
  if (out.multiple === true) {
    if (Array.isArray(value)) out.value = value.map((item) => attributeText(item) ?? "")
    return out
  }
  const text = attributeText(value)
  if (text === undefined) return out
  const first = options.find((option) => !option.disabled)
  out.value = options.some((option) => option.value === text) || !first ? text : first.value
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
    } else if (/^on/i.test(name)) {
      if (typeof value !== "function" || !/^on[A-Z]/.test(name)) continue
      const event = handlerName(name)
      out[event] = chain(out[event], value as Handler)
    } else if (name === "style") {
      const style = cssText(value)
      if (style) out.style = style
    } else if (typeof value === "string" || name === "class") out[name] = value
    else if (PROPERTY_SINKS.has(name.toLowerCase()) || (known && !known.has(name))) {
      // A function has no text an attribute could hold.
      const attribute = typeof value === "function" ? undefined : asAttribute(name, value)
      if (attribute !== undefined) out[name] = attribute
    } else out[name] = value
  }

  for (const [name, write] of bound) {
    // UI SDK calls `onValueChange`, which has written state by the time it
    // assigns the prop, so its assignment is only kept. A component of the
    // host's written with `$bindable` has nothing but the assignment.
    if (known) continue
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

  if (known) hold(out, known, new Set(bound.map(([name]) => name)))
  return out
}

/**
 * A UI SDK prop that has a `default…` twin or an `on…Change` callback is one
 * the component assigns when the user changes it. Written in markup without
 * `bind:`, it is a value the surface holds, as it is in React: the
 * assignment is refused, and UI SDK then keeps what it was given until
 * state gives it something else.
 */
function hold(out: Props, known: ReadonlySet<string>, bound: ReadonlySet<string>): void {
  for (const name of Object.keys(out)) {
    if (bound.has(name)) continue
    if (!known.has(`on${capitalized(name)}Change`) && !known.has(`default${capitalized(name)}`)) continue
    const value = out[name]
    Object.defineProperty(out, name, {
      enumerable: true,
      configurable: true,
      get: () => value,
      set: () => {},
    })
  }
}
