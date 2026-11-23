import { formatValue } from "./format"
import type { ViewProps } from "./primitives"
import { color, flag, size, type StyleMap, takeBoxStyle, textValue } from "./tokens"
import { hasContent, joinClass, part, type View, view } from "./view"

function numberFormat(props: ViewProps) {
  const target = Number(props.value)
  return {
    format: props.format,
    currency: props.currency,
    digits:
      props.digits ?? (Number.isInteger(target) && props.format !== "percent" ? 0 : undefined),
    unit: props.unit,
    locale: props.locale as string | undefined,
  }
}

/** Whether there is a number to count to: nothing, text and infinity are shown as they are. */
function countable(value: unknown): boolean {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") {
    return false
  }
  return Number.isFinite(Number(value))
}

/** Where a `<Number>` is heading and how long it takes to get there. */
export function numberTarget(props: ViewProps): { target: number; duration: number } {
  const target = Number(props.value)
  return { target: Number.isFinite(target) ? target : 0, duration: Number(props.duration) || 500 }
}

/**
 * A number that counts up or down to its new value. `current` is where the
 * count has got to; readers of the accessibility tree get the final value.
 */
export function numberView(props: ViewProps, current: number): View {
  const options = numberFormat(props)
  const shown = formatValue(countable(props.value) ? current : props.value, options)
  return view(
    "span",
    {
      class: joinClass("iui-number", props.class),
      style: props.style,
      "aria-label": formatValue(props.value, options),
    },
    [view("span", { "aria-hidden": "true" }, [shown])]
  )
}

/** One headline figure with its label and how it changed. */
export function statView(props: ViewProps, children: unknown): View {
  const { class: className, style, ...rest } = props
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
  const boxStyle = takeBoxStyle(rest)
  return view(
    "div",
    { class: joinClass("iui-el iui-stat", className), style: { ...boxStyle, ...style } },
    [
      view("div", { class: "iui-stat-label" }, [
        icon ? part("icon", { name: icon, size: "sm" }) : null,
        String(rest.label ?? ""),
      ]),
      view("div", { class: "iui-stat-value" }, [
        typeof value === "number"
          ? part("number", {
              value,
              format: rest.format,
              currency: rest.currency,
              digits: rest.digits,
              unit: rest.unit,
            })
          : String(value ?? "–"),
      ]),
      delta !== null || rest.caption
        ? view("div", { class: "iui-stat-meta" }, [
            delta !== null && Number.isFinite(delta)
              ? view("span", { class: "iui-stat-delta", "data-tone": tone }, [
                  part("icon", {
                    name:
                      trend === "down"
                        ? "arrow-down-right"
                        : trend === "up"
                          ? "arrow-up-right"
                          : "minus",
                    size: "xs",
                  }),
                  formatValue(Math.abs(delta), {
                    format: rest.deltaFormat ?? "percent",
                    digits: rest.deltaDigits,
                  }),
                ])
              : null,
            rest.caption ? view("span", {}, [String(rest.caption)]) : null,
          ])
        : null,
      hasContent(children) ? view("div", { class: "iui-stat-extra" }, [children]) : null,
    ]
  )
}

/** A placeholder with the shape of content that is still loading. */
export function skeletonView(props: ViewProps): View {
  const lines = Math.min(12, Math.max(1, Number(props.lines) || 1))
  const width = size(props.width)
  const height = size(props.height)
  const round = flag(props.circle)
  if (lines > 1) {
    return view("div", { class: joinClass("iui-skeleton-lines", props.class), style: props.style }, [
      Array.from({ length: lines }, (_, index) =>
        view("span", {
          // Lines are identical; their position is their identity.
          key: `line-${index}`,
          class: "iui-skeleton",
          style: { width: index === lines - 1 ? "62%" : "100%" },
        })
      ),
    ])
  }
  return view("span", {
    class: joinClass("iui-skeleton", props.class),
    "aria-hidden": "true",
    style: {
      width: width ?? "100%",
      height: height ?? "1em",
      ...(round ? { borderRadius: "9999px" } : null),
      ...props.style,
    },
  })
}

/** The text of a `<CodeBlock>`: its `code`, or the strings among its children. */
export function codeText(props: ViewProps, children: unknown): string {
  if (typeof props.code === "string") return props.code
  if (typeof children === "string") return children
  if (Array.isArray(children)) {
    return children.filter((item) => typeof item === "string").join("")
  }
  return ""
}

/** How long the copy button says "Copied". */
export const COPIED_LIFETIME = 1400

/** Copies a code block's text, through the host's `onCopy` when it has one. */
export function copyCode(props: ViewProps, code: string, done: () => void): void {
  if (typeof props.onCopy === "function") {
    ;(props.onCopy as (text: string) => void)(code)
    done()
  } else {
    void navigator.clipboard?.writeText(code).then(done, () => {})
  }
}

export interface CodeState {
  code: string
  /** True for a moment after the code was copied. */
  copied: boolean
  onCopy: () => void
}

/** Code with its language and a copy button. */
export function codeView(props: ViewProps, state: CodeState): View {
  const lang = textValue(props.lang) ?? textValue(props.language)
  return view("div", { class: joinClass("iui-el iui-code", props.class), style: props.style }, [
    view("div", { class: "iui-code-bar" }, [
      view("span", {}, [lang ?? "text"]),
      view("button", { type: "button", "aria-label": "Copy code", on: { click: state.onCopy } }, [
        part("icon", { name: state.copied ? "check" : "copy", size: "xs" }),
        state.copied ? "Copied" : "Copy",
      ]),
    ]),
    view("pre", {}, [view("code", {}, [state.code])]),
  ])
}

interface Column {
  key: string
  label: string
  align?: string | undefined
  format?: unknown
  currency?: unknown
  digits?: unknown
  width?: unknown
  /** Maps cell values to badge colors, e.g. `{ paid: "success" }`. */
  badge?: Record<string, unknown> | undefined
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

export interface TableSort {
  key: string
  desc: boolean
}

export interface TableState {
  sort: TableSort | null
  page: number
  setSort: (sort: TableSort | null) => void
  setPage: (page: number) => void
}

/** A table of rows with sorting, paging and row selection. */
export function tableView(props: ViewProps, state: TableState): View {
  const { sort } = state
  const rows = (Array.isArray(props.data) ? props.data : []).filter(
    (row): row is Record<string, unknown> => row !== null && typeof row === "object"
  )
  const columns = readColumns(props.columns, rows)
  const pageSize = Math.max(0, Number(props.pageSize) || 0)
  const sortable = props.sortable === undefined ? true : flag(props.sortable)
  const select =
    typeof props.onSelect === "function" ? (props.onSelect as (row: unknown) => void) : null
  const selectedKey = textValue(props.rowKey) ?? "id"

  let sorted = rows
  if (sort) {
    const direction = sort.desc ? -1 : 1
    sorted = [...rows].sort((a, b) => {
      const left = a[sort.key]
      const right = b[sort.key]
      if (typeof left === "number" && typeof right === "number") {
        return (left - right) * direction
      }
      return (
        String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true }) *
        direction
      )
    })
  }

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const current = Math.min(state.page, pages - 1)
  const visible = pageSize
    ? sorted.slice(current * pageSize, (current + 1) * pageSize)
    : sorted

  const head = columns.map((column) => {
    const active = sort?.key === column.key
    const numeric = typeof rows[0]?.[column.key] === "number"
    const width = size(column.width)
    const style: StyleMap = { textAlign: column.align ?? (numeric ? "right" : "left") }
    if (width) style.width = width
    return view(
      "th",
      {
        key: column.key,
        style,
        "aria-sort": active ? (sort?.desc ? "descending" : "ascending") : undefined,
      },
      [
        sortable && column.sortable !== false
          ? view(
              "button",
              {
                type: "button",
                on: {
                  click: () =>
                    state.setSort(
                      active
                        ? sort?.desc
                          ? null
                          : { key: column.key, desc: true }
                        : { key: column.key, desc: false }
                    ),
                },
              },
              [
                column.label,
                part("icon", {
                  name: active ? (sort?.desc ? "arrow-down" : "arrow-up") : "chevrons-up-down",
                  size: "xs",
                }),
              ]
            )
          : column.label,
      ]
    )
  })

  const body = visible.map((row, index) => {
    const id = row[selectedKey]
    const selected = props.selected !== undefined && props.selected === id
    return view(
      "tr",
      {
        key: typeof id === "string" || typeof id === "number" ? id : `row-${index}`,
        "data-selected": selected ? "" : undefined,
        "data-interactive": select ? "" : undefined,
        tabindex: select ? 0 : undefined,
        on: {
          click: select ? () => select(row) : undefined,
          keydown: select
            ? (event: KeyboardEvent) => {
                if (event.key === "Enter") select(row)
              }
            : undefined,
        },
      },
      [
        columns.map((column) => {
          const value = row[column.key]
          const numeric = typeof value === "number"
          const tone = column.badge?.[String(value)]
          const toneColor = tone ? color(tone) : undefined
          return view(
            "td",
            {
              key: column.key,
              style: { textAlign: column.align ?? (numeric ? "right" : "left") },
              "data-numeric": numeric ? "" : undefined,
              "data-short":
                column.badge || (typeof value === "string" && value.length <= 16) ? "" : undefined,
            },
            [
              column.badge
                ? view(
                    "span",
                    {
                      class: "iui-badge",
                      "data-variant": "soft",
                      style: toneColor ? { "--iui-tone": toneColor } : undefined,
                    },
                    [humanize(String(value ?? ""))]
                  )
                : column.format || numeric
                  ? formatValue(value, column)
                  : String(value ?? ""),
            ]
          )
        }),
      ]
    )
  })

  return view("div", { class: joinClass("iui-el iui-table", props.class), style: props.style }, [
    view("div", { class: "iui-table-scroll" }, [
      view("table", { style: { "--iui-columns": columns.length } }, [
        view("thead", {}, [view("tr", {}, [head])]),
        view("tbody", {}, [
          body,
          visible.length === 0
            ? view("tr", {}, [
                view("td", { colspan: Math.max(1, columns.length), class: "iui-table-empty" }, [
                  textValue(props.empty) ?? "Nothing to show",
                ]),
              ])
            : null,
        ]),
      ]),
    ]),
    pageSize && pages > 1
      ? view("div", { class: "iui-table-pager" }, [
          view("span", {}, [
            `${current * pageSize + 1}–${Math.min(sorted.length, (current + 1) * pageSize)} of ${sorted.length}`,
          ]),
          view(
            "button",
            {
              type: "button",
              disabled: current === 0,
              "aria-label": "Previous page",
              on: { click: () => state.setPage(current - 1) },
            },
            [part("icon", { name: "chevron-left", size: "sm" })]
          ),
          view(
            "button",
            {
              type: "button",
              disabled: current >= pages - 1,
              "aria-label": "Next page",
              on: { click: () => state.setPage(current + 1) },
            },
            [part("icon", { name: "chevron-right", size: "sm" })]
          ),
        ])
      : null,
  ])
}

/** The tags of the preset widgets, in the order the prompt lists them. */
export const PRESET_NAMES = ["Chart", "Stat", "Number", "Skeleton", "CodeBlock", "DataTable"]
