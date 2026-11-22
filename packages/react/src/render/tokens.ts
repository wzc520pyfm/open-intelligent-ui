import { safeStyleValue } from "@open-intelligent-ui/core"
import type { CSSProperties } from "react"

const TOKEN_NAME = /^[A-Za-z][A-Za-z0-9-]*$/
const NUMBER = /^-?\d+(?:\.\d+)?$/
const LENGTH = /^-?\d*\.?\d+(?:px|rem|em|%|vw|vh|vmin|vmax|ch|fr|lh|cqw|cqh|svh|dvh)$/
const KEYWORD_SIZES = new Set([
  "auto",
  "fit-content",
  "max-content",
  "min-content",
  "none",
  "100%",
])
const CSS_WIDE = new Set([
  "inherit",
  "initial",
  "unset",
  "currentColor",
  "currentcolor",
  "transparent",
])

type Input = unknown

function text(value: Input): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

/** Free-form CSS, checked so it can't smuggle in a URL or a second rule. */
function raw(property: string, value: string): string | undefined {
  return safeStyleValue(property, value) ?? undefined
}

/**
 * Spacing: a number is a multiple of the design's spacing unit, a name is a
 * spacing token, anything else must be a CSS length.
 */
export function space(value: Input): string | undefined {
  const input = text(value)
  if (input === null) return undefined
  if (NUMBER.test(input)) {
    return input === "0" ? "0" : `calc(var(--iui-space-unit) * ${input})`
  }
  if (LENGTH.test(input) || input === "auto") return input
  if (TOKEN_NAME.test(input)) return `var(--iui-space-${input})`
  return raw("padding", input)
}

/** Sizes: a number is pixels; otherwise a CSS length or sizing keyword. */
export function size(value: Input): string | undefined {
  const input = text(value)
  if (input === null) return undefined
  if (NUMBER.test(input)) return `${input}px`
  if (LENGTH.test(input) || KEYWORD_SIZES.has(input)) return input
  if (input === "full") return "100%"
  return raw("width", input)
}

/** Names a model reaches for that aren't color tokens: they mean "no particular color". */
const NEUTRAL = new Set(["neutral", "default", "secondary", "subtle"])

/** Colors: a name is a design token first and a CSS color second. */
export function color(value: Input): string | undefined {
  const input = text(value)
  if (input === null) return undefined
  if (CSS_WIDE.has(input)) return input
  if (NEUTRAL.has(input)) return "var(--iui-color-muted-foreground)"
  if (TOKEN_NAME.test(input)) return `var(--iui-color-${input}, ${input})`
  return raw("color", input)
}

/** Text color: `muted` means muted text, not the muted background. */
export function textColor(value: Input): string | undefined {
  const input = text(value)
  if (input === "muted" || input === "subtle") {
    return "var(--iui-color-muted-foreground)"
  }
  return color(value)
}

export function radius(value: Input): string | undefined {
  const input = text(value)
  if (input === null) return undefined
  if (NUMBER.test(input)) return `${input}px`
  if (LENGTH.test(input)) return input
  if (TOKEN_NAME.test(input)) return `var(--iui-radius-${input})`
  return raw("border-radius", input)
}

const ALIGN: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
  baseline: "baseline",
}

const JUSTIFY: Record<string, string> = {
  ...ALIGN,
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
}

const SHADOWS = new Set(["none", "sm", "md", "lg", "xl"])

function flag(value: Input): boolean {
  return value === true || value === "" || value === "true"
}

type Props = Record<string, unknown>

/**
 * The layout and look props shared by every primitive. Removes the props it
 * understands from `props` and returns them as a style object.
 */
export function takeBoxStyle(props: Props): CSSProperties {
  const style: Record<string, string | number | undefined> = {}
  const take = (name: string): unknown => {
    const value = props[name]
    delete props[name]
    return value
  }
  const set = (key: string, value: string | number | undefined) => {
    if (value !== undefined) style[key] = value
  }

  set("padding", space(take("padding")))
  set("paddingInline", space(take("paddingX")))
  set("paddingBlock", space(take("paddingY")))
  set("paddingTop", space(take("paddingTop")))
  set("paddingBottom", space(take("paddingBottom")))
  set("paddingLeft", space(take("paddingLeft")))
  set("paddingRight", space(take("paddingRight")))
  set("margin", space(take("margin")))
  set("marginInline", space(take("marginX")))
  set("marginBlock", space(take("marginY")))
  set("marginTop", space(take("marginTop")))
  set("marginBottom", space(take("marginBottom")))
  set("gap", space(take("gap")))
  set("rowGap", space(take("rowGap")))
  set("columnGap", space(take("columnGap")))

  set("width", size(take("width")))
  set("height", size(take("height")))
  set("minWidth", size(take("minWidth")))
  set("maxWidth", size(take("maxWidth")))
  set("minHeight", size(take("minHeight")))
  set("maxHeight", size(take("maxHeight")))

  const flex = text(take("flex"))
  if (flex !== null) set("flex", NUMBER.test(flex) ? `${flex} 1 0%` : raw("flex", flex))
  const grow = take("grow")
  if (grow !== undefined) set("flexGrow", flag(grow) ? 1 : Number(grow) || 0)
  const shrink = take("shrink")
  if (shrink !== undefined) set("flexShrink", flag(shrink) ? 1 : Number(shrink) || 0)

  const align = text(take("align"))
  if (align !== null) set("alignItems", ALIGN[align])
  const justify = text(take("justify"))
  if (justify !== null) set("justifyContent", JUSTIFY[justify])
  const self = text(take("self"))
  if (self !== null) set("alignSelf", ALIGN[self])
  const wrap = take("wrap")
  if (wrap !== undefined) set("flexWrap", wrap === false || wrap === "false" ? "nowrap" : "wrap")

  set("background", color(take("background")))
  set("color", textColor(take("color")))
  set("borderRadius", radius(take("radius")))

  const border = take("border")
  const borderColor = color(take("borderColor"))
  if (border !== undefined && border !== false && border !== "false" && border !== "none") {
    const named = flag(border) ? undefined : color(border)
    set("border", `1px solid ${named ?? borderColor ?? "var(--iui-color-border)"}`)
  } else if (borderColor) {
    set("border", `1px solid ${borderColor}`)
  }

  const shadow = text(take("shadow"))
  if (shadow !== null) {
    if (flag(shadow)) set("boxShadow", "var(--iui-shadow-md)")
    else if (SHADOWS.has(shadow)) {
      set("boxShadow", shadow === "none" ? "none" : `var(--iui-shadow-${shadow})`)
    }
  }

  const opacity = take("opacity")
  if (opacity !== undefined && Number.isFinite(Number(opacity))) {
    set("opacity", Math.min(1, Math.max(0, Number(opacity))))
  }
  const overflow = text(take("overflow"))
  if (overflow !== null && /^(auto|hidden|visible|scroll|clip)$/.test(overflow)) {
    set("overflow", overflow)
  }
  const aspect = text(take("aspectRatio"))
  if (aspect !== null && /^\d+(?:\.\d+)?(?:\s*[:/]\s*\d+(?:\.\d+)?)?$/.test(aspect)) {
    set("aspectRatio", aspect.replace(":", " / "))
  }
  const position = text(take("position"))
  if (position !== null && /^(relative|absolute|sticky|static)$/.test(position)) {
    set("position", position)
  }
  for (const side of ["top", "right", "bottom", "left", "inset"]) {
    set(side, size(take(side)))
  }
  const z = take("zIndex")
  if (z !== undefined && Number.isInteger(Number(z))) set("zIndex", Number(z))

  return style as CSSProperties
}

/** Grid placement for children of `<grid>`. */
export function takeGridItemStyle(props: Props): CSSProperties {
  const style: Record<string, string> = {}
  const span = props.span ?? props.colSpan ?? props.columnSpan
  delete props.span
  delete props.colSpan
  delete props.columnSpan
  if (span === "full") style.gridColumn = "1 / -1"
  else if (Number.isInteger(Number(span)) && Number(span) > 0) {
    style.gridColumn = `span ${Number(span)}`
  }
  const rowSpan = props.rowSpan
  delete props.rowSpan
  if (Number.isInteger(Number(rowSpan)) && Number(rowSpan) > 0) {
    style.gridRow = `span ${Number(rowSpan)}`
  }
  return style as CSSProperties
}

export function gridColumns(value: Input, minWidth: Input): string | undefined {
  const min = size(minWidth)
  if (min) return `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))`
  const input = text(value)
  if (input === null) return undefined
  if (/^\d+$/.test(input)) return `repeat(${input}, minmax(0, 1fr))`
  return raw("grid-template-columns", input)
}

export const TEXT_SIZES = new Set(["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"])

const WEIGHTS: Record<string, number> = {
  light: 300,
  regular: 400,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
}

export function fontWeight(value: Input): number | undefined {
  const input = text(value)
  if (input === null) return undefined
  if (Object.hasOwn(WEIGHTS, input)) return WEIGHTS[input]
  const number = Number(input)
  return number >= 100 && number <= 900 ? number : undefined
}

export { flag, text as textValue }
