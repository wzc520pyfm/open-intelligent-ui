import type { MotionPresetSpec, MotionSpec } from "../library/library"
import { prefersReducedMotion } from "./format"

/**
 * What moves, as numbers an engine can read whatever its own vocabulary:
 * each property is a list of values to pass through, first to last.
 */
export interface MotionKeyframes {
  opacity?: number[]
  /** Pixels to the right. */
  x?: number[]
  /** Pixels down. */
  y?: number[]
  scale?: number[]
  scaleX?: number[]
  scaleY?: number[]
  /** Degrees. */
  rotate?: number[]
  /** Pixels of blur. */
  blur?: number[]
  /** Of a stroke whose length is 1: 1 is undrawn, 0 is drawn. */
  strokeDashoffset?: number[]
}

/**
 * - `enter`: content arriving.
 * - `exit`: content leaving; it is removed when the animation ends.
 * - `emphasis`: the one entrance worth noticing (`pop`).
 * - `draw`: a stroke drawing itself.
 * - `layout`: an element travelling to a new place (`morph`).
 * - `loop`: repeats until the element goes: status, not decoration.
 */
export type MotionKind = "enter" | "exit" | "emphasis" | "draw" | "layout" | "loop"

/** When and how long, already read from the design's motion tokens. */
export interface MotionTiming {
  kind: MotionKind
  /** The preset being played: `rise`, `pop`, `leave`, `morph`, or one of the adapter's own. */
  name: string
  /** Milliseconds. */
  duration: number
  /** Milliseconds. */
  delay: number
  /** A CSS timing function, from the design. */
  easing: string
  /** The control points when `easing` is a cubic bezier, for engines that take numbers. */
  bezier: [number, number, number, number] | null
  /** True when it repeats without end. */
  repeat: boolean
  /** True when every other repeat runs backwards. */
  alternate: boolean
  /** The preset's own settings for this engine, such as a spring. */
  transition?: unknown
}

export interface MotionPlayback {
  /** Settles when the animation has played. An animation that repeats never settles. */
  finished: Promise<unknown>
  /** Stops it and lets go of the element. */
  cancel(): void
}

/** A named entrance: what `motion="name"` plays. */
export interface MotionPreset extends MotionPresetSpec {
  keyframes: MotionKeyframes
  /** Which of the design's motion tokens times it. Defaults to `surface-enter`. */
  token?: "state-change" | "surface-enter" | "surface-exit" | "layout" | "emphasis"
  /** Milliseconds, instead of the token's. */
  duration?: number
  /** A CSS timing function, instead of the token's. */
  easing?: string
  /** Repeats until the element goes. */
  repeat?: boolean
  alternate?: boolean
  /** Settings for the engine, passed through as `timing.transition`. */
  transition?: unknown
}

/**
 * What plays motion in place of the built-in CSS: entrances
 * (`motion="…"`, `stagger`, blocks arriving), exits (`show`), loops and
 * `morph`. The renderer decides what moves and when; the adapter moves it.
 */
export interface MotionAdapter extends MotionSpec {
  /**
   * Plays `keyframes` on `element`. Return nothing when the engine can't,
   * and the element simply appears.
   */
  animate(
    element: HTMLElement | SVGElement,
    keyframes: MotionKeyframes,
    timing: MotionTiming
  ): MotionPlayback | undefined
  /** Entrances beyond the built-in ones, or replacements for them, by name. */
  presets?: Record<string, MotionPreset>
  /**
   * How `morph` travels. `flip` (the default) moves the element with this
   * engine from where it was to where it is; `view-transition` leaves it to
   * the browser, as without an adapter.
   */
  morph?: "flip" | "view-transition"
  /**
   * True when the engine leaves inline styles on an element it has
   * animated. The renderer then puts back what was there when an entrance
   * ends. Defaults to true.
   */
  writesStyle?: boolean
}

interface BuiltIn {
  keyframes: MotionKeyframes
  kind: MotionKind
  token: string
  /** Multiplies the token's duration. */
  stretch?: number
  easingToken?: string
  duration?: number
  easing?: string
  alternate?: boolean
}

const enter = (keyframes: MotionKeyframes): BuiltIn => ({ keyframes, kind: "enter", token: "surface-enter" })

/** The entrances `packages/core/styles/motion.css` plays, as keyframes. Keep the two in step. */
const BUILT_IN: Record<string, BuiltIn> = {
  fade: enter({ opacity: [0, 1] }),
  rise: enter({ opacity: [0, 1], y: [8, 0] }),
  drop: enter({ opacity: [0, 1], y: [-8, 0] }),
  scale: enter({ opacity: [0, 1], scale: [0.96, 1] }),
  "slide-left": enter({ opacity: [0, 1], x: [16, 0] }),
  "slide-right": enter({ opacity: [0, 1], x: [-16, 0] }),
  blur: enter({ opacity: [0, 1], blur: [6, 0] }),
  pop: { keyframes: { opacity: [0, 1], scale: [0.8, 1] }, kind: "emphasis", token: "emphasis" },
  draw: {
    keyframes: { strokeDashoffset: [1, 0] },
    kind: "draw",
    token: "emphasis",
    stretch: 1.6,
    easingToken: "layout",
  },
  pulse: {
    keyframes: { opacity: [1, 0.45] },
    kind: "loop",
    token: "",
    duration: 800,
    easing: "ease-in-out",
    alternate: true,
  },
  spin: { keyframes: { rotate: [0, 360] }, kind: "loop", token: "", duration: 1000, easing: "linear" },
  float: {
    keyframes: { y: [0, -4] },
    kind: "loop",
    token: "",
    duration: 3000,
    easing: "ease-in-out",
    alternate: true,
  },
}

const LEAVE: MotionKeyframes = { opacity: [1, 0], y: [0, -4] }

/** The names `motion="…"` plays without an adapter. */
export const MOTION_PRESET_NAMES = Object.keys(BUILT_IN)

const TOKEN_DEFAULTS: Record<string, [duration: number, easing: string]> = {
  "state-change": [120, "cubic-bezier(0.2, 0, 0, 1)"],
  "surface-enter": [260, "cubic-bezier(0.16, 1, 0.3, 1)"],
  "surface-exit": [160, "cubic-bezier(0.4, 0, 1, 1)"],
  layout: [320, "cubic-bezier(0.2, 0, 0, 1)"],
  emphasis: [520, "cubic-bezier(0.34, 1.4, 0.64, 1)"],
  stagger: [40, "linear"],
}

const TOP_LEVEL = ".iui-el, p, ul, ol, blockquote, table, h1, h2, h3, h4, h5, h6, figure"
const STREAMED = ".iui-el, li, tr"
const STAGGER_LIMIT = 11
const RESTORED = ["opacity", "transform", "translate", "scale", "rotate", "filter", "stroke-dashoffset", "transform-origin", "will-change"]

type Target = HTMLElement | SVGElement

function milliseconds(value: string | undefined): number | null {
  const match = /^\s*(-?[\d.]+)(ms|s)\s*$/.exec(value ?? "")
  if (!match) return null
  const number = Number(match[1]) * (match[2] === "s" ? 1000 : 1)
  return Number.isFinite(number) ? number : null
}

/** The control points of a CSS cubic bezier, or the bezier a keyword stands for. */
export function bezierOf(easing: string): [number, number, number, number] | null {
  const match = /^\s*cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)\s*$/.exec(easing)
  if (match) {
    const points = match.slice(1, 5).map(Number) as [number, number, number, number]
    return points.every(Number.isFinite) ? points : null
  }
  switch (easing.trim()) {
    case "ease":
      return [0.25, 0.1, 0.25, 1]
    case "ease-in":
      return [0.42, 0, 1, 1]
    case "ease-out":
      return [0, 0, 0.58, 1]
    case "ease-in-out":
      return [0.42, 0, 0.58, 1]
    case "linear":
      return [0, 0, 1, 1]
    default:
      return null
  }
}

interface Playing {
  playback: MotionPlayback
  kind: MotionKind
  /** Puts back the inline styles the engine wrote. */
  restore(): void
}

/** One surface whose motion an adapter plays. */
class MotionRuntime {
  private readonly playing = new Map<Target, Playing>()
  private readonly entered = new WeakSet<Element>()
  private observer: MutationObserver | undefined

  constructor(
    readonly root: HTMLElement,
    readonly adapter: MotionAdapter
  ) {}

  start(): void {
    this.root.setAttribute("data-iui-motion-engine", this.adapter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    for (const child of this.root.children) this.arrive(child)
    if (typeof MutationObserver === "undefined") return
    this.observer = new MutationObserver((records) => this.changed(records))
    this.observer.observe(this.root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-iui-motion", "data-iui-exit"],
    })
  }

  stop(): void {
    this.observer?.disconnect()
    this.observer = undefined
    for (const target of [...this.playing.keys()]) this.cancel(target)
    this.root.removeAttribute("data-iui-motion-engine")
  }

  private changed(records: MutationRecord[]): void {
    let removed = false
    for (const record of records) {
      if (record.type === "attributes") {
        const target = record.target as Element
        if (record.attributeName === "data-iui-exit") {
          // `show` turned true again before the exit had played: the same elements come back.
          if (!target.hasAttribute("data-iui-exit")) {
            for (const child of target.children) this.replay(child)
          }
        } else this.replay(target)
        continue
      }
      if (record.removedNodes.length) removed = true
      for (const node of record.addedNodes) {
        if (node.nodeType === 1) this.arrive(node as Element)
      }
    }
    if (removed) {
      for (const target of [...this.playing.keys()]) {
        if (!this.root.contains(target)) this.cancel(target, false)
      }
    }
  }

  /** Plays the entrance of an element that just arrived, and of what arrived inside it. */
  private arrive(element: Element): void {
    this.enter(element)
    const inside = element.querySelectorAll("*")
    // A subtree larger than this arrives as one; its parts don't each need an entrance.
    if (inside.length > 2000) return
    for (const child of inside) this.enter(child)
  }

  private replay(element: Element): void {
    this.cancel(element as Target)
    this.entered.delete(element)
    this.enter(element)
  }

  private cancel(target: Target, restore = true): void {
    const current = this.playing.get(target)
    if (!current) return
    this.playing.delete(target)
    try {
      current.playback.cancel()
    } catch {
      // An engine that can't stop an animation leaves it to end by itself.
    }
    if (restore) current.restore()
  }

  private token(style: CSSStyleDeclaration, name: string): [duration: number, easing: string] {
    const fallback = TOKEN_DEFAULTS[name] ?? [200, "ease"]
    return [
      milliseconds(style.getPropertyValue(`--iui-motion-${name}-duration`)) ?? fallback[0],
      style.getPropertyValue(`--iui-motion-${name}-easing`).trim() || fallback[1],
    ]
  }

  private preset(name: string): (BuiltIn & { transition?: unknown }) | null {
    const own = this.adapter.presets
    if (own && Object.hasOwn(own, name)) {
      const preset = own[name] as MotionPreset
      const token = preset.token ?? "surface-enter"
      const built: BuiltIn & { transition?: unknown } = {
        keyframes: preset.keyframes,
        kind: preset.repeat ? "loop" : token === "emphasis" ? "emphasis" : token === "layout" ? "layout" : "enter",
        token,
      }
      if (preset.duration !== undefined) built.duration = preset.duration
      if (preset.easing !== undefined) built.easing = preset.easing
      if (preset.alternate) built.alternate = true
      if (preset.transition !== undefined) built.transition = preset.transition
      return built
    }
    return Object.hasOwn(BUILT_IN, name) ? (BUILT_IN[name] as BuiltIn) : null
  }

  private enter(element: Element): void {
    if (this.entered.has(element)) return
    const view = element.ownerDocument.defaultView
    if (!view || !("style" in element)) return
    const own = element.getAttribute("data-iui-motion")
    if (own === "none") return
    const parent = element.parentElement
    const staggered = parent?.hasAttribute("data-iui-stagger") === true
    let name = own
    if (!name) {
      if (parent?.classList.contains("iui-presence") || staggered) name = "rise"
      else if (parent === this.root && element.matches(TOP_LEVEL)) name = "rise"
      else if (this.root.hasAttribute("data-streaming") && element.matches(STREAMED)) name = "fade"
    }
    if (!name) return
    const preset = this.preset(name)
    if (!preset) return
    this.entered.add(element)
    if (prefersReducedMotion()) return

    const style = view.getComputedStyle(element)
    let delay = milliseconds(style.getPropertyValue("--iui-delay")) ?? 0
    if (staggered && parent) {
      const pause =
        milliseconds(view.getComputedStyle(parent).getPropertyValue("--iui-stagger")) ??
        this.token(style, "stagger")[0]
      const index = Array.prototype.indexOf.call(parent.children, element) as number
      delay += pause * Math.min(Math.max(index, 0), STAGGER_LIMIT)
    }
    const [duration, easing] = preset.token ? this.token(style, preset.token) : [200, "ease"]
    const timing = this.timing(preset.kind, name, {
      duration: preset.duration ?? duration * (preset.stretch ?? 1),
      easing: preset.easing ?? (preset.easingToken ? this.token(style, preset.easingToken)[1] : easing),
      delay,
      repeat: preset.kind === "loop",
      alternate: preset.alternate === true,
      transition: preset.transition,
    })
    const keyframes = { ...preset.keyframes }
    // An entrance ends at the element's own opacity, which markup may have set.
    const natural = Number.parseFloat(style.opacity)
    if (keyframes.opacity && Number.isFinite(natural) && natural !== 1 && preset.kind !== "loop") {
      keyframes.opacity = keyframes.opacity.map((value) => value * natural)
    }
    this.play(element as Target, keyframes, timing)
  }

  private timing(
    kind: MotionKind,
    name: string,
    values: {
      duration: number
      easing: string
      delay?: number
      repeat?: boolean
      alternate?: boolean
      transition?: unknown
    }
  ): MotionTiming {
    const timing: MotionTiming = {
      kind,
      name,
      duration: Math.max(0, values.duration),
      delay: Math.max(0, values.delay ?? 0),
      easing: values.easing,
      bezier: bezierOf(values.easing),
      repeat: values.repeat === true,
      alternate: values.alternate === true,
    }
    if (values.transition !== undefined) timing.transition = values.transition
    return timing
  }

  private play(target: Target, keyframes: MotionKeyframes, timing: MotionTiming, after?: () => void): Promise<unknown> | null {
    this.cancel(target)
    const before = RESTORED.map((property) => [property, target.style.getPropertyValue(property)] as const)
    const restore = () => {
      if (this.adapter.writesStyle === false) return
      for (const [property, value] of before) {
        if (value) target.style.setProperty(property, value)
        else target.style.removeProperty(property)
      }
    }
    let playback: MotionPlayback | undefined
    try {
      playback = this.adapter.animate(target, keyframes, timing)
    } catch {
      playback = undefined
    }
    if (!playback) {
      after?.()
      return null
    }
    const current: Playing = { playback, kind: timing.kind, restore: () => {
      restore()
      after?.()
    } }
    this.playing.set(target, current)
    const done = () => {
      if (this.playing.get(target) !== current) return
      this.playing.delete(target)
      // What has left stays as the exit left it until the renderer removes it.
      if (timing.kind !== "exit") current.restore()
    }
    const finished = Promise.resolve(playback.finished).then(done, done)
    return finished
  }

  /** Plays the exit of what a `show` wrapper holds. Null when there is nothing to wait for. */
  exit(wrapper: Element): Promise<unknown> | null {
    if (prefersReducedMotion()) return null
    const view = wrapper.ownerDocument.defaultView
    if (!view) return null
    const waits: Promise<unknown>[] = []
    for (const child of wrapper.children) {
      if (!("style" in child)) continue
      const [duration, easing] = this.token(view.getComputedStyle(child), "surface-exit")
      const wait = this.play(child as Target, LEAVE, this.timing("exit", "leave", { duration, easing }))
      if (wait) waits.push(wait)
    }
    return waits.length ? Promise.allSettled(waits) : null
  }

  /**
   * Runs `update` and moves every `morph` element from where it was to
   * where the update put it. Returns false, having done nothing, when the
   * reader asked for less motion.
   */
  morph(update: () => void | Promise<void>): boolean {
    if (prefersReducedMotion()) return false
    const first = new Map<string, DOMRect>()
    for (const element of this.root.querySelectorAll<HTMLElement>("[data-iui-morph]")) {
      const name = element.dataset.iuiMorph as string
      if (first.has(name)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) first.set(name, rect)
    }
    const travel = () => {
      const moved = new Set<string>()
      for (const element of this.root.querySelectorAll<HTMLElement>("[data-iui-morph]")) {
        const name = element.dataset.iuiMorph as string
        const from = first.get(name)
        if (!from || moved.has(name)) continue
        moved.add(name)
        // Measured where it now belongs, not where an earlier journey has it.
        this.cancel(element)
        const to = element.getBoundingClientRect()
        if (to.width === 0 || to.height === 0) continue
        const x = from.left - to.left
        const y = from.top - to.top
        const scaleX = from.width / to.width
        const scaleY = from.height / to.height
        const still = Math.abs(x) < 0.5 && Math.abs(y) < 0.5
        const sized = Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01
        if (still && sized) continue
        const view = element.ownerDocument.defaultView
        if (!view) continue
        const [duration, easing] = this.token(view.getComputedStyle(element), "layout")
        const keyframes: MotionKeyframes = { x: [x, 0], y: [y, 0] }
        if (!sized) {
          keyframes.scaleX = [scaleX, 1]
          keyframes.scaleY = [scaleY, 1]
        }
        const origin = element.style.transformOrigin
        element.style.transformOrigin = "0 0"
        this.play(element, keyframes, this.timing("layout", "morph", { duration, easing }), () => {
          element.style.transformOrigin = origin
        })
      }
    }
    const result = update()
    if (result instanceof Promise) void result.then(travel, () => {})
    else travel()
    return true
  }
}

const runtimes = new WeakMap<Element, MotionRuntime>()

/**
 * Hands a surface's motion to an adapter: from now on the adapter plays
 * what the built-in CSS would have. Call it with the surface's root element
 * once it is on the page; call what it returns when the surface goes or
 * the adapter changes. With no adapter it does nothing.
 */
export function attachMotion(root: HTMLElement | null, adapter: MotionSpec | undefined): () => void {
  const engine = adapter as MotionAdapter | undefined
  if (!root || !engine || typeof engine.animate !== "function") return () => {}
  runtimes.get(root)?.stop()
  const runtime = new MotionRuntime(root, engine)
  runtimes.set(root, runtime)
  runtime.start()
  return () => {
    if (runtimes.get(root) !== runtime) return
    runtime.stop()
    runtimes.delete(root)
  }
}

/** The adapter's runtime for the surface `element` is in, if it has one. */
export function motionRuntime(element: Element | null): MotionRuntime | undefined {
  // Tests hand this what is not an element; nothing plays there.
  const root = typeof element?.closest === "function" ? element.closest(".iui-root") : null
  return root ? runtimes.get(root) : undefined
}

export type { MotionRuntime }
