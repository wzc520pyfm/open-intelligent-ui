import type { ChartEngineSpec, WidgetSetup } from "../library/library"
import { readChartData } from "./chart"
import { formatValue, prefersReducedMotion } from "./format"
import type { ViewProps } from "./primitives"
import { color, flag, type StyleMap, textValue } from "./tokens"
import { joinClass, px, view } from "./view"

export interface ChartSeries {
  /** The field of each row this series reads. */
  key: string
  /** What the legend and the tooltip call it. */
  name: string
  /** A color the engine can paint with: `rgb(…)`, never a CSS variable. */
  color: string
  values: number[]
}

/** The design's colors and type, read from the page for an engine that paints on a canvas. */
export interface ChartTheme {
  foreground: string
  /** Supporting text: axis labels, legends. */
  muted: string
  /** Grid lines and axes. */
  border: string
  /** The page behind the surface. A chart is drawn on nothing, so what is under it shows. */
  background: string
  /** What floats above the chart: a tooltip's background. */
  surface: string
  fontFamily: string
  fontSize: number
  dark: boolean
}

/**
 * A `<Chart>` as an engine reads it: the props markup wrote, already turned
 * into rows, series, resolved colors and a number format.
 */
export interface ChartSpec {
  /** `bar`, `line`, `area`, `donut`, `pie`, `spark`, or a type the engine adds. */
  type: string
  rows: Record<string, unknown>[]
  /** The category of each row. */
  labels: string[]
  series: ChartSeries[]
  /** A color per row, for charts that color by row: donut, pie. */
  palette: string[]
  /** How tall the chart is, in pixels. */
  height: number
  stacked: boolean
  legend: boolean
  grid: boolean
  /** Whether each mark shows its value. */
  valueLabels: boolean
  /** True when markup listens with `on:select`. */
  selectable: boolean
  /** Formats a number the way `format`, `currency`, `digits` and `unit` ask. */
  format(value: number): string
  theme: ChartTheme
  /** The chart's accessible name. */
  label: string
  /** Every prop as markup wrote it, for options of the engine's own. */
  props: Record<string, unknown>
}

export interface ChartContext {
  /** Reports the row at `index` to `on:select`. */
  select(index: number): void
  /** True when the reader asked for less motion: draw without animating. */
  reducedMotion: boolean
}

/** A chart an engine has put on the page. */
export interface ChartHandle {
  /** Draws the new spec: data, type, colors or theme changed. */
  update(spec: ChartSpec): void
  destroy(): void
}

/**
 * What draws `<Chart>` in place of the built-in SVG. Either `mount`, which
 * works in every renderer, or `component`, one framework's own component
 * that takes the chart's props as markup wrote them.
 */
export interface ChartEngine<C = unknown> extends ChartEngineSpec {
  /**
   * Draws a chart into `element` and returns how to change and remove it.
   * It may return a promise, so the engine can be loaded when the first
   * chart appears.
   */
  mount?(
    element: HTMLElement,
    spec: ChartSpec,
    context: ChartContext
  ): ChartHandle | Promise<ChartHandle>
  component?: C
}

const BUILT_IN = new Set(["bar", "line", "area", "donut", "pie", "spark"])

const typeName = (value: unknown) => {
  const type = textValue(value) ?? "bar"
  return type === "sparkline" ? "spark" : type
}

/** Whether the engine draws a chart of this type, or leaves it to the built-in SVG. */
export function engineDraws(engine: ChartEngineSpec, type: unknown): boolean {
  const name = typeName(type)
  if (engine.extra && Object.hasOwn(engine.extra, name)) return true
  return engine.types ? engine.types.includes(name) : BUILT_IN.has(name)
}

let canvas: CanvasRenderingContext2D | null | undefined

/** Any CSS color as `rgb()` or `rgba()`, which every engine reads. */
function toRgb(value: string, doc: Document): string {
  if (/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i.test(value)) return value
  if (canvas === undefined) {
    try {
      canvas = doc.createElement("canvas").getContext("2d", { willReadFrequently: true })
    } catch {
      canvas = null
    }
  }
  if (!canvas) return value
  try {
    canvas.clearRect(0, 0, 1, 1)
    canvas.fillStyle = "#000"
    canvas.fillStyle = value
    canvas.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = canvas.getImageData(0, 0, 1, 1).data as unknown as [number, number, number, number]
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`
  } catch {
    return value
  }
}

/**
 * Reads colors as they compute on `element`, so `var(--iui-color-chart-1)`
 * or `color-mix(…)` becomes a color an engine can paint with.
 */
export function resolveColors(element: Element, values: string[]): string[] {
  const doc = element.ownerDocument
  const view = doc.defaultView
  if (!view) return values
  const probe = doc.createElement("span")
  probe.style.display = "none"
  element.append(probe)
  try {
    return values.map((value) => {
      probe.style.color = ""
      probe.style.color = value
      const computed = probe.style.color ? view.getComputedStyle(probe).color : ""
      return computed && !computed.includes("var(") ? toRgb(computed, doc) : value
    })
  } finally {
    probe.remove()
  }
}

const THEME_COLORS = ["foreground", "muted-foreground", "border", "background", "surface"]

function readTheme(element: Element): ChartTheme {
  const [foreground, muted, border, background, surface] = resolveColors(
    element,
    THEME_COLORS.map((name) => `var(--iui-color-${name})`)
  ) as [string, string, string, string, string]
  const style = element.ownerDocument.defaultView?.getComputedStyle(element)
  return {
    foreground,
    muted,
    border,
    background,
    surface,
    fontFamily: style?.fontFamily || "sans-serif",
    fontSize: 12,
    dark: style?.colorScheme === "dark",
  }
}

/** A chart as its props describe it, before anything is read from the page. */
export type ChartDescription = Omit<ChartSpec, "theme">

/**
 * Reads a `<Chart>`'s props into rows, series and settings. Colors are as
 * the design names them (`var(--iui-color-chart-1)`), which is what an
 * engine that draws SVG or HTML wants; `chartSpec` resolves them for one
 * that paints on a canvas.
 */
export function describeChart(props: ViewProps): ChartDescription {
  const type = typeName(props.type)
  const data = readChartData(props)
  const round = type === "donut" || type === "pie" || type === "funnel"
  const given = Array.isArray(props.colors) ? props.colors : []
  return {
    type,
    rows: data.rows,
    labels: data.labels,
    series: data.series.map((item) => ({
      key: item.key,
      name: item.name,
      color: item.color,
      values: item.values,
    })),
    palette: data.rows.map(
      (_, index) => color(given[index]) ?? `var(--iui-color-chart-${(index % 6) + 1})`
    ),
    height: chartHeight(props),
    stacked: flag(props.stacked),
    legend: props.legend === undefined ? data.series.length > 1 || round : flag(props.legend),
    grid: props.grid === undefined ? true : flag(props.grid),
    valueLabels: flag(props.labels),
    selectable: typeof props.onSelect === "function",
    format: (value) =>
      formatValue(value, {
        format: props.format ?? "compact",
        currency: props.currency,
        digits: props.digits,
        unit: props.unit,
        locale: props.locale as string | undefined,
      }),
    label: textValue(props["aria-label"]) ?? `${type} chart`,
    props,
  }
}

/** How tall a chart is when markup doesn't say, by type. */
function chartHeight(props: ViewProps): number {
  const type = typeName(props.type)
  const given = Number(props.height)
  if (Number.isFinite(given) && given > 0) return Math.min(given, 2000)
  if (type === "spark") return 36
  return type === "donut" || type === "pie" ? 200 : 220
}

/** The spec an engine draws, from a chart's props and the element it is drawn in. */
export function chartSpec(props: ViewProps, element: Element): ChartSpec {
  const described = describeChart(props)
  const resolved = resolveColors(element, [
    ...described.series.map((item) => item.color),
    ...described.palette,
  ])
  return {
    ...described,
    series: described.series.map((item, index) => ({ ...item, color: resolved[index] as string })),
    palette: resolved.slice(described.series.length),
    theme: readTheme(element),
  }
}

/** What decides how a chart looks, as text: when it is the same, there is nothing to draw again. */
function specKey(spec: ChartSpec): string {
  const { format: _format, props, rows: _rows, ...rest } = spec
  const data: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (typeof value !== "function" && name !== "class" && name !== "style") data[name] = value
  }
  try {
    return JSON.stringify([rest, data])
  } catch {
    return String(Math.random())
  }
}

const widgets = new WeakMap<ChartEngine, WidgetSetup>()

/**
 * `<Chart>` drawn by an engine, as a widget every renderer can host. The
 * element keeps the chart's height while the engine loads, so nothing
 * around it moves when the chart arrives.
 */
export function engineChart(engine: ChartEngine): WidgetSetup {
  const known = widgets.get(engine)
  if (known) return known
  const setup: WidgetSetup = (handle) => {
    let element: HTMLElement | undefined
    let chart: ChartHandle | undefined
    let props: ViewProps = {}
    let drawn = ""
    let queued = false
    let gone = false

    const context: ChartContext = {
      select: (index) => {
        const row = readChartData(props).rows[index]
        if (row !== undefined && typeof props.onSelect === "function") {
          ;(props.onSelect as (row: unknown) => void)(row)
        }
      },
      get reducedMotion() {
        return prefersReducedMotion()
      },
    }

    const draw = () => {
      queued = false
      if (!element || !chart || gone) return
      const spec = chartSpec(props, element)
      const key = specKey(spec)
      if (key === drawn) return
      drawn = key
      try {
        chart.update(spec)
      } catch (error) {
        handle.report(`${engine.name} could not draw the chart: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    const refresh = () => {
      if (queued) return
      queued = true
      queueMicrotask(draw)
    }

    const pass = handle.attach((target) => {
      element = target
      gone = false
      const spec = chartSpec(props, target)
      drawn = specKey(spec)
      const fail = (error: unknown) =>
        handle.report(`${engine.name} could not draw the chart: ${error instanceof Error ? error.message : String(error)}`)
      try {
        void Promise.resolve(engine.mount?.(target, spec, context)).then((mounted) => {
          if (!mounted) return
          if (gone) {
            mounted.destroy()
            return
          }
          chart = mounted
          // The props may have changed while the engine was loading.
          draw()
        }, fail)
      } catch (error) {
        fail(error)
      }

      // The design's colors change with the scheme and the design; a canvas has to be told.
      const root = target.closest(".iui-root")
      const watch = () => {
        if (!root || !observer) return
        observer.disconnect()
        observer.observe(root, {
          attributes: true,
          attributeFilter: ["data-iui-scheme", "class", "style"],
          childList: true,
        })
        // The design is a stylesheet at the top of the surface, rewritten when it changes.
        for (const sheet of root.children) {
          if (sheet.localName === "style") {
            observer.observe(sheet, { characterData: true, childList: true, subtree: true })
          }
        }
      }
      const observer =
        root && typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => {
              watch()
              refresh()
            })
          : null
      watch()
      const media = target.ownerDocument.defaultView?.matchMedia?.("(prefers-color-scheme: dark)")
      media?.addEventListener?.("change", refresh)

      return () => {
        gone = true
        observer?.disconnect()
        media?.removeEventListener?.("change", refresh)
        try {
          chart?.destroy()
        } catch {
          // The engine is gone with its element either way.
        }
        chart = undefined
        element = undefined
      }
    })

    return (next) => {
      props = next as ViewProps
      const type = typeName(props.type)
      const height = chartHeight(props)
      if (chart) refresh()
      return view("div", {
        pass,
        class: joinClass("iui-el iui-chart iui-chart-engine", props.class as string | undefined),
        "data-type": type,
        "data-engine": engine.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        role: "img",
        "aria-label": textValue(props["aria-label"]) ?? `${type} chart`,
        style: { ...(props.style as StyleMap | undefined), height: px(height) },
      })
    }
  }
  widgets.set(engine, setup)
  return setup
}
