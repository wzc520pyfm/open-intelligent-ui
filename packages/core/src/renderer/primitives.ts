import { safeUrl } from "../index"
import {
  color,
  flag,
  fontWeight,
  gridColumns,
  type StyleMap,
  size,
  space,
  TEXT_SIZES,
  takeBoxStyle,
  takeGridItemStyle,
  textColor,
  textValue,
} from "./tokens"
import { joinClass, part, px, type View, view } from "./view"

/**
 * What a primitive is given: the props the renderer evaluated, with the
 * class under `class` whatever the framework calls it.
 */
export type ViewProps = Record<string, unknown> & {
  class?: string | undefined
  style?: StyleMap | undefined
}

const DOM_PROPS = new Set(["id", "title", "role", "tabIndex", "hidden", "lang", "dir"])

/** What may reach the DOM element: handlers, ARIA, data attributes and ids. */
function dom(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (
      DOM_PROPS.has(name) ||
      name.startsWith("aria-") ||
      name.startsWith("data-") ||
      (/^on[A-Z]/.test(name) && typeof value === "function")
    ) {
      out[name] = value
    }
  }
  return out
}

/** Splits props into box styles and what is left for the DOM element. */
function box(props: ViewProps, base: string) {
  const { class: className, style, ...rest } = props
  const boxStyle = takeBoxStyle(rest)
  return {
    rest,
    className: joinClass("iui-el", base, className),
    style: { ...boxStyle, ...style } as StyleMap,
  }
}

function boxView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-box")
  const direction = textValue(rest.direction)
  delete rest.direction
  return view(
    "div",
    {
      pass: dom(rest),
      class: className,
      "data-direction": direction === "row" ? "row" : undefined,
      style,
    },
    [children]
  )
}

function rowView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-row")
  return view("div", { pass: dom(rest), class: className, style }, [children])
}

function gridView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-grid")
  const columns = gridColumns(rest.columns, rest.minColumnWidth)
  const count = rest.minColumnWidth === undefined ? Number(rest.columns) : Number.NaN
  // Fixed column counts fold to fewer columns when the surface is narrow.
  const fold = Number.isInteger(count) && count > 1 && rest.responsive !== false
  delete rest.columns
  delete rest.minColumnWidth
  delete rest.responsive
  return view(
    "div",
    {
      pass: dom(rest),
      class: className,
      "data-columns": fold ? Math.min(count, 12) : undefined,
      style: { ...(columns ? { gridTemplateColumns: columns } : null), ...style },
    },
    [children]
  )
}

function gridItemView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-grid-item")
  const placement = takeGridItemStyle(rest)
  return view(
    "div",
    {
      pass: dom(rest),
      class: className,
      "data-span": placement.gridColumn ? "" : undefined,
      style: { ...placement, ...style },
    },
    [children]
  )
}

function cardView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-card")
  const press = typeof rest.onClick === "function" ? (rest.onClick as (event: unknown) => void) : null
  const interactive = flag(rest.interactive) || press !== null
  delete rest.interactive
  const variant = textValue(rest.variant)
  delete rest.variant
  return view(
    "div",
    {
      pass: dom(rest),
      class: className,
      "data-interactive": interactive ? "" : undefined,
      "data-variant": variant ?? undefined,
      role: press ? "button" : undefined,
      tabindex: press ? 0 : undefined,
      on: {
        keydown: press
          ? (event: KeyboardEvent) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                press(event)
              }
            }
          : undefined,
      },
      style,
    },
    [children]
  )
}

function textProps(rest: Record<string, unknown>) {
  const style: StyleMap = {}
  const data: Record<string, string | undefined> = {}
  const take = (name: string) => {
    const value = rest[name]
    delete rest[name]
    return value
  }
  const sizeValue = textValue(take("size"))
  if (sizeValue !== null) {
    if (TEXT_SIZES.has(sizeValue)) data["data-size"] = sizeValue
    else {
      const custom = size(sizeValue)
      if (custom) style.fontSize = custom
    }
  }
  const type = textValue(take("variant")) ?? textValue(take("type"))
  if (type !== null && /^[A-Za-z0-9-]+$/.test(type)) data["data-type"] = type
  const weight = fontWeight(take("weight"))
  if (weight) style.fontWeight = weight
  const align = textValue(take("align"))
  if (align !== null && /^(left|center|right|start|end|justify)$/.test(align)) {
    style.textAlign = align
  }
  if (flag(take("mono"))) data["data-mono"] = ""
  if (flag(take("italic"))) style.fontStyle = "italic"
  if (flag(take("tabular"))) style.fontVariantNumeric = "tabular-nums"
  if (flag(take("uppercase"))) style.textTransform = "uppercase"
  if (flag(take("strike"))) style.textDecoration = "line-through"
  if (flag(take("truncate"))) data["data-truncate"] = ""
  if (flag(take("balance"))) style.textWrap = "balance"
  const lines = Number(take("lines"))
  if (Number.isInteger(lines) && lines > 0) {
    data["data-clamp"] = ""
    style.WebkitLineClamp = lines
  }
  const tracking = textValue(take("tracking"))
  if (tracking !== null && /^-?\d*\.?\d+(em|px)$/.test(tracking)) {
    style.letterSpacing = tracking
  }
  return { style, data }
}

function textView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-text")
  const text = textProps(rest)
  const block = flag(rest.block)
  delete rest.block
  return view(
    block ? "div" : "span",
    { pass: dom(rest), ...text.data, class: className, style: { ...text.style, ...style } },
    [children]
  )
}

function titleView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-title")
  const level = Math.min(6, Math.max(1, Number(rest.level) || 2))
  delete rest.level
  const text = textProps(rest)
  return view(
    `h${level}`,
    { pass: dom(rest), ...text.data, class: className, style: { ...text.style, ...style } },
    [children]
  )
}

function badgeView(props: ViewProps, children: unknown): View {
  const { class: className, style, ...rest } = props
  const tone = textValue(rest.color) ?? textValue(rest.tone)
  delete rest.color
  delete rest.tone
  const variant = textValue(rest.variant) ?? "soft"
  delete rest.variant
  const sizeValue = textValue(rest.size)
  delete rest.size
  const boxStyle = takeBoxStyle(rest)
  const toneColor = tone ? color(tone === "muted" ? "muted-foreground" : tone) : undefined
  return view(
    "span",
    {
      pass: dom(rest),
      class: joinClass("iui-el iui-badge", className),
      "data-variant": variant,
      "data-size": sizeValue ?? undefined,
      style: { ...(toneColor ? { "--iui-tone": toneColor } : null), ...boxStyle, ...style },
    },
    [children]
  )
}

const ICON_SIZES: Record<string, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
}

/** `ArrowUpIcon`, `arrowUp` and `arrow_up` all read as `arrow-up`. */
export function iconName(value: unknown): string | null {
  const input = textValue(value)
  if (input === null) return null
  return input
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
}

export interface IconSpec {
  /** The icon asked for, in Lucide's spelling. It may not exist. */
  name: string | null
  pixels: number
  stroke: number
  label: string | null
  class: string
  style: StyleMap
}

/** Reads an `<icon>`'s props. Each framework draws the SVG with its own Lucide package. */
export function iconSpec(props: ViewProps): IconSpec {
  const sizeValue = textValue(props.size) ?? "md"
  const pixels = ICON_SIZES[sizeValue] ?? (Number(sizeValue) || 16)
  const tone = textColor(props.color)
  return {
    name: iconName(props.name),
    pixels,
    stroke: Number(props.stroke) || 2,
    label: textValue(props.label) ?? textValue(props["aria-label"]),
    class: joinClass("iui-el iui-icon", props.class),
    style: {
      width: px(pixels),
      height: px(pixels),
      ...(tone ? { color: tone } : null),
      ...props.style,
    },
  }
}

/** What stands where an icon will be, or would have been. */
export function iconPlaceholder(spec: IconSpec, missing: boolean): View {
  return view("span", {
    class: spec.class,
    style: spec.style,
    "data-missing": missing ? "" : undefined,
    "aria-hidden": "true",
  })
}

function dividerView(props: ViewProps): View {
  const vertical = flag(props.vertical) || props.orientation === "vertical"
  const tone = color(props.color)
  const gap = space(props.spacing)
  return view("div", {
    role: "separator",
    "aria-orientation": vertical ? "vertical" : "horizontal",
    class: joinClass("iui-el iui-divider", props.class),
    style: {
      ...(tone ? { background: tone } : null),
      ...(gap ? (vertical ? { marginInline: gap } : { marginBlock: gap }) : null),
      ...props.style,
    },
  })
}

function spacerView(props: ViewProps): View {
  const amount = space(props.size)
  return view("div", {
    "aria-hidden": "true",
    class: "iui-spacer",
    style: amount ? { flex: `0 0 ${amount}` } : { flex: "1 1 0%" },
  })
}

export interface ImageState {
  /** The address that failed to load, if one did. A picture at another address is tried again. */
  failed: string | null
  onError: (src: string) => void
}

/** A picture, or a placeholder of the same shape when there is none to show. */
export function imageView(props: ViewProps, state: ImageState): View {
  const { class: className, style, ...rest } = props
  const src = safeUrl(rest.src, "media")
  const alt = textValue(rest.alt) ?? ""
  const fit = textValue(rest.fit)
  delete rest.src
  delete rest.alt
  delete rest.fit
  const boxStyle = takeBoxStyle(rest)
  const merged: StyleMap = {
    ...boxStyle,
    ...(fit && /^(cover|contain|fill|none|scale-down)$/.test(fit) ? { objectFit: fit } : null),
    ...style,
  }
  if (!src || state.failed === src) {
    return view("span", {
      role: "img",
      "aria-label": alt || undefined,
      class: joinClass("iui-el iui-image", className),
      "data-missing": "",
      style: merged,
    })
  }
  return view("img", {
    pass: dom(rest),
    src,
    alt,
    loading: "lazy",
    decoding: "async",
    referrerpolicy: "no-referrer",
    class: joinClass("iui-el iui-image", className),
    style: merged,
    on: { error: () => state.onError(src) },
  })
}

function linkView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-link")
  const href = safeUrl(rest.href)
  delete rest.href
  const text = textProps(rest)
  const merged = { ...text.style, ...style }
  if (!href) {
    return view(
      "button",
      { type: "button", pass: dom(rest), ...text.data, class: className, style: merged },
      [children]
    )
  }
  const external = /^https?:/i.test(href)
  return view(
    "a",
    {
      pass: dom(rest),
      ...text.data,
      href,
      target: external ? "_blank" : undefined,
      rel: external ? "noopener noreferrer" : undefined,
      class: className,
      style: merged,
    },
    [children]
  )
}

function listView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-list")
  const marker = textValue(rest.marker) ?? "none"
  const connector = rest.connector
  delete rest.marker
  delete rest.connector
  return view(
    marker === "number" ? "ol" : "ul",
    {
      pass: dom(rest),
      class: className,
      "data-marker": marker,
      "data-connector":
        connector === undefined || connector === false || connector === "none" ? undefined : "",
      style,
    },
    [children]
  )
}

function listItemView(props: ViewProps, children: unknown): View {
  const { rest, className, style } = box(props, "iui-list-item")
  const icon = rest.icon
  delete rest.icon
  return view("li", { pass: dom(rest), class: className, style }, [
    view("span", { class: "iui-list-marker", "aria-hidden": "true" }, [
      icon ? part("icon", { name: icon, size: "sm" }) : null,
    ]),
    view("div", { class: "iui-list-body" }, [children]),
  ])
}

/**
 * The layout primitives that need nothing but their props. `icon` and
 * `image` are not here: one loads its drawing and the other remembers a
 * failed load, so each framework wraps `iconSpec` and `imageView` itself.
 */
export const PRIMITIVE_VIEWS: Record<string, (props: ViewProps, children: unknown) => View> = {
  box: boxView,
  row: rowView,
  grid: gridView,
  "grid-item": gridItemView,
  card: cardView,
  text: textView,
  title: titleView,
  badge: badgeView,
  divider: dividerView,
  spacer: spacerView,
  link: linkView,
  list: listView,
  "list-item": listItemView,
}
