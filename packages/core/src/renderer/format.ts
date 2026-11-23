export interface FormatOptions {
  format?: unknown
  currency?: unknown
  digits?: unknown
  unit?: unknown
  locale?: string
}

/** Seconds as the two largest units that matter: `2d 4h`, `1h 30m`, `45s`. */
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const units: [string, number][] = [
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ]
  const parts: string[] = []
  let rest = total
  for (const [label, size] of units) {
    const count = Math.floor(rest / size)
    rest -= count * size
    if (count > 0 || (label === "s" && parts.length === 0)) parts.push(`${count}${label}`)
    else if (parts.length > 0) break
    if (parts.length === 2) break
  }
  return parts.join(" ")
}

/**
 * Formats a value for display: `number`, `currency`, `percent`, `compact`,
 * `duration` (from seconds), `date`, `time` or `datetime`.
 */
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
  if (format === "duration") return formatDuration(number)
  const whole = Number.isInteger(number) || Math.abs(number) >= 1000
  let out: string
  try {
    if (format === "currency") {
      out = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: typeof options.currency === "string" ? options.currency : "USD",
        maximumFractionDigits: digits ?? (whole ? 0 : 2),
        minimumFractionDigits: digits ?? (whole ? 0 : 2),
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

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/** Whether numbers should jump to their new value instead of travelling there. */
export function tweenless(): boolean {
  return prefersReducedMotion() || typeof requestAnimationFrame !== "function"
}

/**
 * Moves a list of numbers from `start` to `target` over `duration`
 * milliseconds, calling `set` on every frame. Returns a function that stops it.
 */
export function tween(
  start: number[],
  target: number[],
  duration: number,
  set: (values: number[]) => void
): () => void {
  let frame = 0
  const began = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - began) / duration)
    const eased = easeOut(t)
    set(
      target.map((end, index) => {
        const begin = start[index] as number
        return begin + (end - begin) * eased
      })
    )
    if (t < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}
