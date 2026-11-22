import { useEffect, useRef, useState } from "react"

export interface FormatOptions {
  format?: unknown
  currency?: unknown
  digits?: unknown
  unit?: unknown
  locale?: string
}

/** Formats a value for display: `number`, `currency`, `percent`, `compact` or `date`. */
export function formatValue(value: unknown, options: FormatOptions = {}): string {
  if (value === null || value === undefined || value === "") return "–"
  const { locale } = options
  const format = typeof options.format === "string" ? options.format : "number"
  const digits =
    options.digits === undefined ? undefined : Math.max(0, Number(options.digits) || 0)
  if (format === "date" || format === "datetime" || format === "time") {
    const date = new Date(value as string | number)
    if (Number.isNaN(date.getTime())) return String(value)
    return new Intl.DateTimeFormat(locale, {
      ...(format !== "time" ? { dateStyle: "medium" } : null),
      ...(format !== "date" ? { timeStyle: "short" } : null),
    }).format(date)
  }
  const number = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(number)) return String(value)
  let out: string
  try {
    if (format === "currency") {
      out = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: typeof options.currency === "string" ? options.currency : "USD",
        maximumFractionDigits: digits ?? (Math.abs(number) >= 1000 ? 0 : 2),
        minimumFractionDigits: digits ?? 0,
      }).format(number)
    } else if (format === "percent") {
      out = new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: digits ?? 1,
      }).format(number)
    } else if (format === "compact") {
      out = new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: digits ?? 1,
      }).format(number)
    } else {
      out = new Intl.NumberFormat(locale, {
        maximumFractionDigits: digits ?? 2,
        minimumFractionDigits: digits ?? 0,
      }).format(number)
    }
  } catch {
    out = String(number)
  }
  return typeof options.unit === "string" && options.unit ? `${out} ${options.unit}` : out
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * Moves a list of numbers smoothly towards `target` whenever it changes.
 * Starts from `from` (zero by default) the first time, so charts grow in.
 */
export function useTween(target: number[], duration = 420, from = 0): number[] {
  const [values, setValues] = useState<number[]>(() =>
    prefersReducedMotion() || typeof requestAnimationFrame !== "function"
      ? target
      : target.map(() => from)
  )
  const current = useRef(values)
  current.current = values
  const key = target.join(",")

  // `key` stands in for `target`, which is a new array on every render.
  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setValues(target)
      return
    }
    const start = target.map((_, index) => current.current[index] ?? from)
    if (start.every((value, index) => value === target[index])) {
      if (current.current.length !== target.length) setValues(target)
      return
    }
    let frame = 0
    const began = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration)
      const eased = easeOut(t)
      setValues(
        target.map((end, index) => {
          const begin = start[index] as number
          return begin + (end - begin) * eased
        })
      )
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [key, duration, from])

  return values.length === target.length ? values : target
}
