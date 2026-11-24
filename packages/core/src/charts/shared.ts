import type { ChartEngine } from "../renderer/chart-engine"

/** A library, or a function that loads it: `() => import("echarts")`. */
export type Loader<T> = T | (() => T | Promise<T | { default: T }>)

/** Loads the library once, however many charts ask for it. */
export function loader<T extends object>(source: Loader<T>, has: keyof T): () => Promise<T> {
  let loaded: Promise<T> | undefined
  return () => {
    loaded ??= Promise.resolve(typeof source === "function" ? (source as () => unknown)() : source).then(
      (module) => {
        const given = module as T & { default?: T }
        return given[has] === undefined && given.default ? given.default : given
      }
    )
    return loaded
  }
}

/** The chart types the adapters add to the built-in ones, as the prompt describes them. */
export const EXTRA_TYPES: Record<string, string> = {
  scatter: "Points for two measures. `x` names the field across, `y` the field up; both are numbers.",
  radar: "Several measures of one thing, or of a few things to compare: one row per measure, one `y` field per thing.",
  funnel: "How many are left after each step: one row per step, in order.",
}

export interface ChartAdapterOptions {
  /** The engine's name, as the prompt gives it. */
  name?: string
  /** The chart types this engine draws. The built-in SVG draws the rest. */
  types?: readonly string[]
  /** More for the prompt about charts in this product. */
  guide?: string
}

export function engineSpec(
  name: string,
  options: ChartAdapterOptions,
  extra: Record<string, string> = EXTRA_TYPES
): Pick<ChartEngine, "name" | "types" | "extra" | "guide"> {
  const spec: Pick<ChartEngine, "name" | "types" | "extra" | "guide"> = { name: options.name ?? name }
  if (options.types) {
    spec.types = options.types
    const kept = Object.entries(extra).filter(([type]) => options.types?.includes(type))
    if (kept.length) spec.extra = Object.fromEntries(kept)
  } else if (Object.keys(extra).length) spec.extra = extra
  if (options.guide) spec.guide = options.guide
  return spec
}

export interface TooltipRow {
  name: string
  value: string
  color?: string | undefined
}

/**
 * A tooltip's content as elements, never as HTML: a label or a series name
 * came from a model, and is only ever text here.
 */
export function tooltipElement(doc: Document, title: string | undefined, rows: TooltipRow[]): HTMLElement {
  const tip = doc.createElement("div")
  tip.className = "iui-chart-tip"
  if (title) {
    const heading = doc.createElement("strong")
    heading.textContent = title
    tip.append(heading)
  }
  for (const row of rows) {
    const line = doc.createElement("span")
    if (row.color) {
      const swatch = doc.createElement("i")
      swatch.style.background = row.color
      line.append(swatch)
    }
    line.append(row.name)
    const value = doc.createElement("b")
    value.textContent = row.value
    line.append(value)
    tip.append(line)
  }
  return tip
}

/**
 * Runs `start` once the element has a size, since an engine that measures
 * an element nobody can see yet draws nothing, and `resize` whenever the
 * size changes after that. Returns what stops watching.
 */
export function whenSized(element: HTMLElement, start: () => void, resize: () => void): () => void {
  let started = false
  const check = () => {
    if (element.clientWidth === 0 || element.clientHeight === 0) return
    if (started) resize()
    else {
      started = true
      start()
    }
  }
  check()
  if (typeof ResizeObserver === "undefined") {
    if (!started) {
      started = true
      start()
    }
    return () => {}
  }
  const observer = new ResizeObserver(check)
  observer.observe(element)
  return () => observer.disconnect()
}

/** A round number at or above the largest value, for an axis that starts at zero. */
export function niceMax(values: number[]): number {
  const max = Math.max(0, ...values.filter(Number.isFinite))
  if (max === 0) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (max <= step * power) return step * power
  }
  return max
}
