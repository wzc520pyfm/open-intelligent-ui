import { ExprRuntimeError } from "./ast"
import { createNamespace, isCallable, registerCallable } from "./evaluate"

type AnyFn = (...args: unknown[]) => unknown

export interface BuiltinOptions {
  /** BCP 47 tag used by the formatting functions. Defaults to the runtime's locale. */
  locale?: string
  /** Default currency for `currency()`. */
  currency?: string
  /** Fixes "now" for tests and server rendering. */
  now?: () => number
}

function numbers(args: unknown[]): number[] {
  const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return flat.map(Number).filter((n) => !Number.isNaN(n))
}

function picker(key: unknown): (item: unknown) => unknown {
  if (isCallable(key)) return key
  if (typeof key === "string" || typeof key === "number") {
    return (item) =>
      item !== null && typeof item === "object" && Object.hasOwn(item, key)
        ? (item as Record<string | number, unknown>)[key]
        : undefined
  }
  return (item) => item
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function toDate(value: unknown, now: () => number): Date | null {
  if (value === undefined || value === null || value === "") {
    return new Date(now())
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    // A bare date means that calendar day, wherever the reader is.
    const [year, month, day] = value.split("-").map(Number)
    return new Date(year!, month! - 1, day!)
  }
  const date = new Date(value as string | number)
  return Number.isNaN(date.getTime()) ? null : date
}

const DATE_STYLES: Record<string, Intl.DateTimeFormatOptions> = {
  short: { dateStyle: "short" },
  medium: { dateStyle: "medium" },
  long: { dateStyle: "long" },
  full: { dateStyle: "full" },
  weekday: { weekday: "long" },
  month: { month: "long", year: "numeric" },
  "month-day": { month: "short", day: "numeric" },
  year: { year: "numeric" },
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
  ["second", 1000],
]

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

/**
 * The pure functions every expression can call. Nothing here reads or changes
 * anything outside its arguments, except the clock.
 */
export function createBuiltins(
  options: BuiltinOptions = {}
): Record<string, unknown> {
  const { locale, currency: defaultCurrency = "USD" } = options
  const now = options.now ?? Date.now

  const format = (value: unknown, config: Intl.NumberFormatOptions) => {
    const n = Number(value)
    if (value == null || Number.isNaN(n)) return ""
    return new Intl.NumberFormat(locale, config).format(n)
  }

  const fns: Record<string, AnyFn> = {
    min: (...args) => {
      const list = numbers(args)
      return list.length ? Math.min(...list) : 0
    },
    max: (...args) => {
      const list = numbers(args)
      return list.length ? Math.max(...list) : 0
    },
    sum: (...args) => numbers(args).reduce((total, n) => total + n, 0),
    avg: (...args) => {
      const list = numbers(args)
      return list.length
        ? list.reduce((total, n) => total + n, 0) / list.length
        : 0
    },
    round: (value, digits = 0) => {
      const factor = 10 ** Number(digits)
      return Math.round(Number(value) * factor) / factor
    },
    floor: (value) => Math.floor(Number(value)),
    ceil: (value) => Math.ceil(Number(value)),
    abs: (value) => Math.abs(Number(value)),
    clamp: (value, low, high) =>
      Math.min(Math.max(Number(value), Number(low)), Number(high)),
    lerp: (from, to, t) =>
      Number(from) + (Number(to) - Number(from)) * Number(t),
    range: (a, b, step = 1) => {
      const start = b === undefined ? 0 : Number(a)
      const end = b === undefined ? Number(a) : Number(b)
      const by = Number(step) || 1
      const length = Math.max(0, Math.ceil((end - start) / by))
      if (length > 10_000) throw new ExprRuntimeError("range() is too long")
      return Array.from({ length }, (_, i) => start + i * by)
    },
    len: (value) =>
      typeof value === "string" || Array.isArray(value)
        ? value.length
        : value !== null && typeof value === "object"
          ? Object.keys(value).length
          : 0,
    keys: (value) =>
      value !== null && typeof value === "object" ? Object.keys(value) : [],
    values: (value) =>
      value !== null && typeof value === "object" ? Object.values(value) : [],
    entries: (value) =>
      value !== null && typeof value === "object" ? Object.entries(value) : [],
    fromEntries: (value) => {
      const out: Record<string, unknown> = {}
      for (const entry of asList(value)) {
        if (Array.isArray(entry)) out[String(entry[0])] = entry[1]
      }
      return out
    },
    isArray: (value) => Array.isArray(value),
    Number: (value) => Number(value),
    String: (value) => (value == null ? "" : String(value)),
    Boolean: (value) => Boolean(value),
    parseInt: (value, radix) =>
      Number.parseInt(String(value), radix === undefined ? 10 : Number(radix)),
    parseFloat: (value) => Number.parseFloat(String(value)),
    isNaN: (value) => Number.isNaN(Number(value)),
    isFinite: (value) => Number.isFinite(Number(value)),

    num: (value, digits) =>
      format(
        value,
        digits === undefined
          ? { maximumFractionDigits: 2 }
          : {
              minimumFractionDigits: Number(digits),
              maximumFractionDigits: Number(digits),
            }
      ),
    currency: (value, code, digits) =>
      format(value, {
        style: "currency",
        currency: typeof code === "string" ? code : defaultCurrency,
        ...(digits === undefined
          ? Number.isInteger(Number(value))
            ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
            : {}
          : {
              minimumFractionDigits: Number(digits),
              maximumFractionDigits: Number(digits),
            }),
      }),
    percent: (value, digits = 0) =>
      format(value, {
        style: "percent",
        minimumFractionDigits: Number(digits),
        maximumFractionDigits: Number(digits),
      }),
    compact: (value, digits = 1) =>
      format(value, {
        notation: "compact",
        maximumFractionDigits: Number(digits),
      }),
    signed: (value, digits) =>
      format(value, {
        signDisplay: "exceptZero",
        maximumFractionDigits: digits === undefined ? 2 : Number(digits),
      }),
    unit: (value, name, display = "short") => {
      try {
        return format(value, {
          style: "unit",
          unit: String(name),
          unitDisplay: display as "short",
          maximumFractionDigits: 2,
        })
      } catch {
        return `${format(value, { maximumFractionDigits: 2 })} ${String(name)}`
      }
    },
    date: (value, style = "medium") => {
      const date = toDate(value, now)
      if (!date) return ""
      const config = DATE_STYLES[String(style)] ?? DATE_STYLES.medium
      return new Intl.DateTimeFormat(locale, config).format(date)
    },
    time: (value, style = "short") => {
      const date = toDate(value, now)
      if (!date) return ""
      return new Intl.DateTimeFormat(locale, {
        timeStyle: style === "medium" ? "medium" : "short",
      }).format(date)
    },
    datetime: (value) => {
      const date = toDate(value, now)
      if (!date) return ""
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    },
    relative: (value) => {
      const date = toDate(value, now)
      if (!date) return ""
      const diff = date.getTime() - now()
      const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
      for (const [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(diff) >= size || unit === "second") {
          return formatter.format(Math.round(diff / size), unit)
        }
      }
      return ""
    },
    duration: (seconds) => {
      const total = Math.max(0, Math.round(Number(seconds) || 0))
      const d = Math.floor(total / 86400)
      if (d > 0) {
        const hours = Math.floor((total % 86400) / 3600)
        return hours > 0 ? `${d}d ${hours}h` : `${d}d`
      }
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
      if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`
      return `${s}s`
    },
    plural: (count, one, many) =>
      Number(count) === 1 ? String(one) : String(many ?? `${String(one)}s`),
    ordinal: (value) => {
      const n = Number(value)
      const rule = new Intl.PluralRules("en", { type: "ordinal" }).select(n)
      const suffix = { one: "st", two: "nd", few: "rd" }[rule as "one"] ?? "th"
      return `${n}${suffix}`
    },
    capitalize: (value) => {
      const text = value == null ? "" : String(value)
      return text.charAt(0).toUpperCase() + text.slice(1)
    },
    truncate: (value, length = 80) => {
      const text = value == null ? "" : String(value)
      const max = Number(length)
      return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text
    },
    initials: (value) =>
      String(value ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join(""),
    json: (value) => JSON.stringify(value, null, 2),

    sortBy: (list, key, direction = "asc") => {
      const pick = picker(key)
      const sign = direction === "desc" ? -1 : 1
      return asList(list)
        .slice()
        .sort((a, b) => sign * compare(pick(a), pick(b)))
    },
    groupBy: (list, key) => {
      const pick = picker(key)
      const out: Record<string, unknown[]> = {}
      for (const item of asList(list)) {
        const group = String(pick(item))
        if (group === "__proto__") continue
        ;(out[group] ??= []).push(item)
      }
      return out
    },
    countBy: (list, key) => {
      const pick = picker(key)
      const out: Record<string, number> = {}
      for (const item of asList(list)) {
        const group = String(pick(item))
        if (group === "__proto__") continue
        out[group] = (out[group] ?? 0) + 1
      }
      return out
    },
    sumBy: (list, key) => {
      const pick = picker(key)
      return asList(list).reduce<number>(
        (total, item) => total + (Number(pick(item)) || 0),
        0
      )
    },
    maxBy: (list, key) => {
      const pick = picker(key)
      return asList(list).reduce<unknown>(
        (best, item) =>
          best === undefined || compare(pick(item), pick(best)) > 0
            ? item
            : best,
        undefined
      )
    },
    minBy: (list, key) => {
      const pick = picker(key)
      return asList(list).reduce<unknown>(
        (best, item) =>
          best === undefined || compare(pick(item), pick(best)) < 0
            ? item
            : best,
        undefined
      )
    },
    unique: (list, key) => {
      const pick = picker(key)
      const seen = new Set<unknown>()
      return asList(list).filter((item) => {
        const id = pick(item)
        if (seen.has(id)) return false
        seen.add(id)
        return true
      })
    },
    toggle: (list, item) => {
      const items = asList(list)
      return items.includes(item)
        ? items.filter((entry) => entry !== item)
        : [...items, item]
    },
    without: (list, ...items) =>
      asList(list).filter((entry) => !items.includes(entry)),
    chunk: (list, size) => {
      const items = asList(list)
      const by = Math.max(1, Math.floor(Number(size) || 1))
      const out: unknown[][] = []
      for (let i = 0; i < items.length; i += by) {
        out.push(items.slice(i, i + by))
      }
      return out
    },
    first: (list) => asList(list)[0],
    last: (list) => asList(list).at(-1),

    now: () => now(),
    today: () => {
      const date = new Date(now())
      const pad = (n: number) => String(n).padStart(2, "0")
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    },
    addDays: (value, days) => {
      const date = toDate(value, now)
      if (!date) return ""
      date.setDate(date.getDate() + Number(days))
      const pad = (n: number) => String(n).padStart(2, "0")
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    },
    uid: () => Math.random().toString(36).slice(2, 10),
  }

  const out: Record<string, unknown> = {}
  for (const [name, fn] of Object.entries(fns)) {
    out[name] = registerCallable(fn)
  }

  out.Math = createNamespace({
    PI: Math.PI,
    E: Math.E,
    abs: Math.abs,
    ceil: Math.ceil,
    floor: Math.floor,
    round: Math.round,
    trunc: Math.trunc,
    sign: Math.sign,
    min: Math.min,
    max: Math.max,
    pow: Math.pow,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    hypot: Math.hypot,
    exp: Math.exp,
    log: Math.log,
    log2: Math.log2,
    log10: Math.log10,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    atan2: Math.atan2,
    random: Math.random,
  })
  out.JSON = createNamespace({
    stringify: (value: unknown, _replacer: unknown, indent: unknown) =>
      JSON.stringify(value, null, typeof indent === "number" ? indent : 0),
    parse: (text: unknown) => {
      try {
        return JSON.parse(String(text))
      } catch {
        return undefined
      }
    },
  })
  out.Object = createNamespace({
    keys: fns.keys,
    values: fns.values,
    entries: fns.entries,
    fromEntries: fns.fromEntries,
  })
  out.Array = createNamespace({
    isArray: fns.isArray,
    from: (value: unknown) =>
      Array.isArray(value)
        ? value.slice()
        : typeof value === "string"
          ? [...value]
          : [],
  })
  out.Infinity = Number.POSITIVE_INFINITY
  out.NaN = Number.NaN

  return out
}
