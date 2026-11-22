import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useMemo,
  useState,
} from "react"
import { Icon } from "../primitives/primitives"
import { color, flag, size, takeBoxStyle, textValue } from "../render/tokens"
import { Chart } from "./Chart"
import { formatValue, useTween } from "./format"

type Props = Record<string, unknown> & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

function join(...names: (string | undefined | false)[]): string {
  return names.filter(Boolean).join(" ")
}

/** A number that counts up or down to its new value. */
function AnimatedNumber(props: Props) {
  const target = Number(props.value)
  const [value] = useTween([Number.isFinite(target) ? target : 0], Number(props.duration) || 500)
  const digits =
    props.digits ?? (Number.isInteger(target) && props.format !== "percent" ? 0 : undefined)
  const shown = formatValue(Number.isFinite(target) ? value : props.value, {
    format: props.format,
    currency: props.currency,
    digits,
    unit: props.unit,
    locale: props.locale as string | undefined,
  })
  const final = formatValue(props.value, {
    format: props.format,
    currency: props.currency,
    digits,
    unit: props.unit,
    locale: props.locale as string | undefined,
  })
  return (
    <span
      className={join("iui-number", props.className)}
      style={props.style}
      aria-label={final}
    >
      <span aria-hidden="true">{shown}</span>
    </span>
  )
}

/** One headline figure with its label and how it changed. */
function Stat(props: Props) {
  const { children, className, style, ...rest } = props
  const delta = rest.delta === undefined ? null : Number(rest.delta)
  const trend =
    textValue(rest.trend) ??
    (delta === null || !Number.isFinite(delta) || delta === 0
      ? null
      : delta > 0
        ? "up"
        : "down")
  // A falling number is good news for costs or errors: `invert` says so.
  const good = flag(rest.invert) ? trend === "down" : trend === "up"
  const tone = trend === null || trend === "flat" ? "muted" : good ? "success" : "danger"
  const icon = textValue(rest.icon)
  const value = rest.value
  const animated = typeof value === "number" && rest.format !== undefined
  const boxStyle = takeBoxStyle(rest)
  return (
    <div className={join("iui-el iui-stat", className)} style={{ ...boxStyle, ...style }}>
      <div className="iui-stat-label">
        {icon ? <Icon name={icon} size="sm" /> : null}
        {String(rest.label ?? "")}
      </div>
      <div className="iui-stat-value">
        {animated ? (
          <AnimatedNumber
            value={value}
            format={rest.format}
            currency={rest.currency}
            digits={rest.digits}
            unit={rest.unit}
          />
        ) : (
          String(value ?? "–")
        )}
      </div>
      {delta !== null || rest.caption ? (
        <div className="iui-stat-meta">
          {delta !== null && Number.isFinite(delta) ? (
            <span className="iui-stat-delta" data-tone={tone}>
              <Icon
                name={trend === "down" ? "arrow-down-right" : trend === "up" ? "arrow-up-right" : "minus"}
                size="xs"
              />
              {formatValue(Math.abs(delta), {
                format: rest.deltaFormat ?? "percent",
                digits: rest.deltaDigits,
              })}
            </span>
          ) : null}
          {rest.caption ? <span>{String(rest.caption)}</span> : null}
        </div>
      ) : null}
      {children ? <div className="iui-stat-extra">{children}</div> : null}
    </div>
  )
}

/** A placeholder with the shape of content that is still loading. */
function Skeleton(props: Props) {
  const lines = Math.min(12, Math.max(1, Number(props.lines) || 1))
  const width = size(props.width)
  const height = size(props.height)
  const round = flag(props.circle)
  if (lines > 1) {
    return (
      <div className={join("iui-skeleton-lines", props.className)} style={props.style}>
        {Array.from({ length: lines }, (_, index) => (
          <span
            // Lines are identical; their position is their identity.
            key={`line-${index}`}
            className="iui-skeleton"
            style={{ width: index === lines - 1 ? "62%" : "100%" }}
          />
        ))}
      </div>
    )
  }
  return (
    <span
      className={join("iui-skeleton", props.className)}
      aria-hidden="true"
      style={{
        width: width ?? "100%",
        height: height ?? "1em",
        ...(round ? { borderRadius: "9999px" } : null),
        ...props.style,
      }}
    />
  )
}

/** Code with its language and a copy button. */
function CodeBlock(props: Props) {
  const [copied, setCopied] = useState(false)
  const code =
    typeof props.code === "string"
      ? props.code
      : typeof props.children === "string"
        ? props.children
        : Array.isArray(props.children)
          ? props.children.filter((item) => typeof item === "string").join("")
          : ""
  const lang = textValue(props.lang) ?? textValue(props.language)
  const copy = () => {
    const done = () => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    }
    if (typeof props.onCopy === "function") {
      ;(props.onCopy as (text: string) => void)(code)
      done()
    } else {
      void navigator.clipboard?.writeText(code).then(done, () => {})
    }
  }
  return (
    <div className={join("iui-el iui-code", props.className)} style={props.style}>
      <div className="iui-code-bar">
        <span>{lang ?? "text"}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          <Icon name={copied ? "check" : "copy"} size="xs" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

interface Column {
  key: string
  label: string
  align?: string
  format?: unknown
  currency?: unknown
  digits?: unknown
  width?: unknown
  /** Maps cell values to badge colors, e.g. `{ paid: "success" }`. */
  badge?: Record<string, unknown>
  sortable?: boolean
}

/** `unit_price` and `unitPrice` both read as "Unit price". */
function humanize(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/^./, (ch) => ch.toUpperCase())
}

function readColumns(input: unknown, rows: Record<string, unknown>[]): Column[] {
  const list = Array.isArray(input) && input.length ? input : Object.keys(rows[0] ?? {})
  return list.flatMap((item): Column[] => {
    if (typeof item === "string") {
      return [{ key: item, label: humanize(item) }]
    }
    if (item === null || typeof item !== "object") return []
    const column = item as Record<string, unknown>
    const key = textValue(column.key)
    if (key === null) return []
    return [
      {
        key,
        label: textValue(column.label) ?? humanize(key),
        align: textValue(column.align) ?? undefined,
        format: column.format,
        currency: column.currency,
        digits: column.digits,
        width: column.width,
        badge:
          column.badge !== null && typeof column.badge === "object"
            ? (column.badge as Record<string, unknown>)
            : undefined,
        sortable: column.sortable !== false,
      },
    ]
  })
}

/** A table of rows with sorting, paging and row selection. */
function DataTable(props: Props) {
  const rows = useMemo(
    () =>
      (Array.isArray(props.data) ? props.data : []).filter(
        (row): row is Record<string, unknown> => row !== null && typeof row === "object"
      ),
    [props.data]
  )
  const columns = readColumns(props.columns, rows)
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null)
  const [page, setPage] = useState(0)
  const pageSize = Math.max(0, Number(props.pageSize) || 0)
  const sortable = props.sortable === undefined ? true : flag(props.sortable)
  const select = typeof props.onSelect === "function" ? props.onSelect : null
  const selectedKey = textValue(props.rowKey) ?? "id"

  const sorted = useMemo(() => {
    if (!sort) return rows
    const direction = sort.desc ? -1 : 1
    return [...rows].sort((a, b) => {
      const left = a[sort.key]
      const right = b[sort.key]
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction
      }
      return String(left ?? "").localeCompare(String(right ?? ""), undefined, {
        numeric: true,
      }) * direction
    })
  }, [rows, sort])

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const current = Math.min(page, pages - 1)
  const visible = pageSize
    ? sorted.slice(current * pageSize, (current + 1) * pageSize)
    : sorted

  return (
    <div className={join("iui-el iui-table", props.className)} style={props.style}>
      <div className="iui-table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((column) => {
                const active = sort?.key === column.key
                const numeric = typeof rows[0]?.[column.key] === "number"
                return (
                  <th
                    key={column.key}
                    style={{
                      textAlign: (column.align ?? (numeric ? "right" : "left")) as "left",
                      width: size(column.width),
                    }}
                    aria-sort={active ? (sort?.desc ? "descending" : "ascending") : undefined}
                  >
                    {sortable && column.sortable !== false ? (
                      <button
                        type="button"
                        onClick={() =>
                          setSort(
                            active
                              ? sort?.desc
                                ? null
                                : { key: column.key, desc: true }
                              : { key: column.key, desc: false }
                          )
                        }
                      >
                        {column.label}
                        <Icon
                          name={active ? (sort?.desc ? "arrow-down" : "arrow-up") : "chevrons-up-down"}
                          size="xs"
                        />
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, index) => {
              const id = row[selectedKey]
              const selected = props.selected !== undefined && props.selected === id
              return (
                <tr
                  key={typeof id === "string" || typeof id === "number" ? id : `row-${index}`}
                  data-selected={selected ? "" : undefined}
                  data-interactive={select ? "" : undefined}
                  tabIndex={select ? 0 : undefined}
                  onClick={select ? () => (select as (row: unknown) => void)(row) : undefined}
                  onKeyDown={
                    select
                      ? (event) => {
                          if (event.key === "Enter") (select as (row: unknown) => void)(row)
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => {
                    const value = row[column.key]
                    const numeric = typeof value === "number"
                    const tone = column.badge?.[String(value)]
                    return (
                      <td
                        key={column.key}
                        style={{
                          textAlign: (column.align ?? (numeric ? "right" : "left")) as "left",
                        }}
                        data-numeric={numeric ? "" : undefined}
                      >
                        {column.badge ? (
                          <span
                            className="iui-badge"
                            data-variant="soft"
                            style={
                              tone
                                ? ({ "--iui-tone": color(tone) } as CSSProperties)
                                : undefined
                            }
                          >
                            {String(value ?? "")}
                          </span>
                        ) : column.format || numeric ? (
                          formatValue(value, column)
                        ) : (
                          String(value ?? "")
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={Math.max(1, columns.length)} className="iui-table-empty">
                  {textValue(props.empty) ?? "Nothing to show"}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {pageSize && pages > 1 ? (
        <div className="iui-table-pager">
          <span>
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of{" "}
            {sorted.length}
          </span>
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            aria-label="Previous page"
          >
            <Icon name="chevron-left" size="sm" />
          </button>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            aria-label="Next page"
          >
            <Icon name="chevron-right" size="sm" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, ComponentType<Props>> = {
  Chart: Chart as ComponentType<Props>,
  Stat,
  Number: AnimatedNumber,
  Skeleton,
  CodeBlock,
  DataTable,
}

export const PRESET_NAMES = Object.keys(PRESETS)
