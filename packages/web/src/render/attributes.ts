/** Attributes that are on when present, whatever they say. */
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
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "selected",
])

/** Attributes whose value is the word `true` or `false`. */
const SPELLED = new Set(["contenteditable", "draggable", "spellcheck"])

/** Props markup may write the way JSX spells them, and the attribute each one is. */
const SPELLINGS: Record<string, string> = {
  className: "class",
  htmlFor: "for",
  acceptCharset: "accept-charset",
  httpEquiv: "http-equiv",
}

/**
 * The attribute a prop is, for an element the renderer doesn't know the
 * props of. JSX names are lowered, since that is how HTML reads them.
 */
export function attributeName(prop: string): string {
  if (Object.hasOwn(SPELLINGS, prop)) return SPELLINGS[prop] as string
  if (prop.startsWith("aria-") || prop.startsWith("data-")) return prop
  return prop.toLowerCase()
}

/**
 * What an attribute is set to, or `undefined` when it is left off. A value
 * that isn't text, a number or a boolean never reaches the DOM.
 */
export function attributeText(name: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isNaN(value) ? undefined : String(value)
  if (typeof value !== "boolean") return undefined
  if (name.startsWith("aria-") || name.startsWith("data-") || SPELLED.has(name)) return String(value)
  if (BOOLEAN.has(name)) return value ? "" : undefined
  // On a custom element an attribute that is there at all usually means yes.
  return value ? "" : undefined
}

/** Whether a name could be read as an inline event handler if set as an attribute. */
export const isHandlerName = (name: string): boolean => /^on/i.test(name)
