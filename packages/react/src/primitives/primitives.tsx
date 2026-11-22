import { safeUrl } from "@open-intelligent-ui/core"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useState,
} from "react"
import {
  color,
  flag,
  fontWeight,
  gridColumns,
  size,
  space,
  TEXT_SIZES,
  takeBoxStyle,
  takeGridItemStyle,
  textColor,
  textValue,
} from "../render/tokens"

/** Props as the renderer hands them over: already evaluated, not yet typed. */
export type PrimitiveProps = Record<string, unknown> & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

type Primitive = (props: PrimitiveProps) => ReactNode

function join(...names: (string | undefined | false)[]): string {
  return names.filter(Boolean).join(" ")
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
function box(props: PrimitiveProps, base: string) {
  const { children, className, style, ...rest } = props
  const boxStyle = takeBoxStyle(rest)
  return {
    children,
    rest,
    className: join("iui-el", base, className),
    style: { ...boxStyle, ...style },
  }
}

const Box: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-box")
  const direction = textValue(rest.direction)
  delete rest.direction
  return (
    <div
      {...dom(rest)}
      className={className}
      data-direction={direction === "row" ? "row" : undefined}
      style={style}
    >
      {children}
    </div>
  )
}

const Row: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-row")
  return (
    <div {...dom(rest)} className={className} style={style}>
      {children}
    </div>
  )
}

const Grid: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-grid")
  const columns = gridColumns(rest.columns, rest.minColumnWidth)
  const count = rest.minColumnWidth === undefined ? Number(rest.columns) : Number.NaN
  // Fixed column counts fold to fewer columns when the surface is narrow.
  const fold = Number.isInteger(count) && count > 1 && rest.responsive !== false
  delete rest.columns
  delete rest.minColumnWidth
  delete rest.responsive
  return (
    <div
      {...dom(rest)}
      className={className}
      data-columns={fold ? Math.min(count, 12) : undefined}
      style={{ ...(columns ? { gridTemplateColumns: columns } : null), ...style }}
    >
      {children}
    </div>
  )
}

const GridItem: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-grid-item")
  const placement = takeGridItemStyle(rest)
  return (
    <div
      {...dom(rest)}
      className={className}
      data-span={placement.gridColumn ? "" : undefined}
      style={{ ...placement, ...style }}
    >
      {children}
    </div>
  )
}

const Card: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-card")
  const interactive = flag(rest.interactive) || typeof rest.onClick === "function"
  delete rest.interactive
  const variant = textValue(rest.variant)
  delete rest.variant
  return (
    <div
      {...dom(rest)}
      className={className}
      data-interactive={interactive ? "" : undefined}
      data-variant={variant ?? undefined}
      role={typeof rest.onClick === "function" ? "button" : undefined}
      tabIndex={typeof rest.onClick === "function" ? 0 : undefined}
      onKeyDown={
        typeof rest.onClick === "function"
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                ;(rest.onClick as (event: unknown) => void)(event)
              }
            }
          : undefined
      }
      style={style}
    >
      {children}
    </div>
  )
}

function textProps(rest: Record<string, unknown>) {
  const style: Record<string, string | number> = {}
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

const Text: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-text")
  const text = textProps(rest)
  const block = flag(rest.block)
  delete rest.block
  const Tag: ElementType = block ? "div" : "span"
  return (
    <Tag {...dom(rest)} {...text.data} className={className} style={{ ...text.style, ...style }}>
      {children}
    </Tag>
  )
}

const Title: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-title")
  const level = Math.min(6, Math.max(1, Number(rest.level) || 2))
  delete rest.level
  const text = textProps(rest)
  const Tag = `h${level}` as ElementType
  return (
    <Tag {...dom(rest)} {...text.data} className={className} style={{ ...text.style, ...style }}>
      {children}
    </Tag>
  )
}

const Badge: Primitive = (props) => {
  const { children, className, style, ...rest } = props
  const tone = textValue(rest.color) ?? textValue(rest.tone)
  delete rest.color
  delete rest.tone
  const variant = textValue(rest.variant) ?? "soft"
  delete rest.variant
  const sizeValue = textValue(rest.size)
  delete rest.size
  const boxStyle = takeBoxStyle(rest)
  const toneColor = tone ? color(tone === "muted" ? "muted-foreground" : tone) : undefined
  return (
    <span
      {...dom(rest)}
      className={join("iui-el iui-badge", className)}
      data-variant={variant}
      data-size={sizeValue ?? undefined}
      style={{
        ...(toneColor ? ({ "--iui-tone": toneColor } as CSSProperties) : null),
        ...boxStyle,
        ...style,
      }}
    >
      {children}
    </span>
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

function iconName(value: unknown): IconName | null {
  const input = textValue(value)
  if (input === null) return null
  const name = input
    .replace(/Icon$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()
  return Object.hasOwn(dynamicIconImports, name) ? (name as IconName) : null
}

const Icon: Primitive = (props) => {
  const { className, style, children: _children, ...rest } = props
  const name = iconName(rest.name)
  const sizeValue = textValue(rest.size) ?? "md"
  const pixels = ICON_SIZES[sizeValue] ?? (Number(sizeValue) || 16)
  const tone = textColor(rest.color)
  const stroke = Number(rest.stroke) || 2
  const label = textValue(rest.label) ?? textValue(rest["aria-label"])
  const common = {
    className: join("iui-el iui-icon", className),
    style: { width: pixels, height: pixels, ...(tone ? { color: tone } : null), ...style },
  }
  if (!name) {
    return <span {...common} data-missing="" aria-hidden="true" />
  }
  return (
    <DynamicIcon
      name={name}
      size={pixels}
      strokeWidth={stroke}
      aria-hidden={label ? undefined : true}
      aria-label={label ?? undefined}
      role={label ? "img" : undefined}
      fallback={() => <span {...common} aria-hidden="true" />}
      {...common}
    />
  )
}

const Divider: Primitive = (props) => {
  const { className, style, children: _children, ...rest } = props
  const vertical = flag(rest.vertical) || rest.orientation === "vertical"
  const tone = color(rest.color)
  const gap = space(rest.spacing)
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={join("iui-el iui-divider", className)}
      style={{
        ...(tone ? { background: tone } : null),
        ...(gap ? (vertical ? { marginInline: gap } : { marginBlock: gap }) : null),
        ...style,
      }}
    />
  )
}

const Spacer: Primitive = (props) => {
  const amount = space(props.size)
  return (
    <div
      aria-hidden="true"
      className="iui-spacer"
      style={amount ? { flex: `0 0 ${amount}` } : { flex: "1 1 0%" }}
    />
  )
}

const Image: Primitive = (props) => {
  const { className, style, children: _children, ...rest } = props
  const [failed, setFailed] = useState(false)
  const src = safeUrl(rest.src, "media")
  const alt = textValue(rest.alt) ?? ""
  const fit = textValue(rest.fit)
  delete rest.src
  delete rest.alt
  delete rest.fit
  const boxStyle = takeBoxStyle(rest)
  const merged = {
    ...boxStyle,
    ...(fit && /^(cover|contain|fill|none|scale-down)$/.test(fit) ? { objectFit: fit } : null),
    ...style,
  } as CSSProperties
  if (!src || failed) {
    return (
      <span
        role="img"
        aria-label={alt || undefined}
        className={join("iui-el iui-image", className)}
        data-missing=""
        style={merged}
      />
    )
  }
  return (
    <img
      {...dom(rest)}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={join("iui-el iui-image", className)}
      style={merged}
      onError={() => setFailed(true)}
    />
  )
}

const Link: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-link")
  const href = safeUrl(rest.href)
  delete rest.href
  const text = textProps(rest)
  const merged = { ...text.style, ...style }
  if (!href) {
    return (
      <button type="button" {...dom(rest)} {...text.data} className={className} style={merged}>
        {children}
      </button>
    )
  }
  const external = /^https?:/i.test(href)
  return (
    <a
      {...dom(rest)}
      {...text.data}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={className}
      style={merged}
    >
      {children}
    </a>
  )
}

const List: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-list")
  const marker = textValue(rest.marker) ?? "none"
  const connector = rest.connector
  delete rest.marker
  delete rest.connector
  const Tag: ElementType = marker === "number" ? "ol" : "ul"
  return (
    <Tag
      {...dom(rest)}
      className={className}
      data-marker={marker}
      data-connector={
        connector === undefined || connector === false || connector === "none"
          ? undefined
          : ""
      }
      style={style}
    >
      {children}
    </Tag>
  )
}

const ListItem: Primitive = (props) => {
  const { children, rest, className, style } = box(props, "iui-list-item")
  const icon = rest.icon
  delete rest.icon
  return (
    <li {...dom(rest)} className={className} style={style}>
      <span className="iui-list-marker" aria-hidden="true">
        {icon ? <Icon name={icon} size="sm" /> : null}
      </span>
      <div className="iui-list-body">{children}</div>
    </li>
  )
}

export const PRIMITIVES: Record<string, Primitive> = {
  box: Box,
  row: Row,
  grid: Grid,
  "grid-item": GridItem,
  card: Card,
  text: Text,
  title: Title,
  badge: Badge,
  icon: Icon,
  divider: Divider,
  spacer: Spacer,
  image: Image,
  link: Link,
  list: List,
  "list-item": ListItem,
}

export { Icon }
