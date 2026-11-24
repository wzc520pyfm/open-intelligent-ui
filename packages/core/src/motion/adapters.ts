import type {
  MotionAdapter,
  MotionKeyframes,
  MotionKind,
  MotionPlayback,
  MotionPreset,
  MotionTiming,
} from "../renderer/motion"
import { cssKeyframes, cubicBezier, keyframeCount } from "./keyframes"

/** What every adapter lets a product set. */
export interface MotionAdapterOptions {
  /** The engine's name, as the prompt gives it. */
  name?: string
  /** Entrances of the product's own, by the name `motion="…"` takes. */
  presets?: Record<string, MotionPreset>
  /** Replaces the motion section of the prompt. */
  guide?: string
  /** How `morph` travels: with this engine (`flip`), or with the browser's view transitions. */
  morph?: "flip" | "view-transition"
}

function common(options: MotionAdapterOptions): Partial<MotionAdapter> {
  const shared: Partial<MotionAdapter> = {}
  if (options.presets) shared.presets = options.presets
  if (options.guide) shared.guide = options.guide
  if (options.morph) shared.morph = options.morph
  return shared
}

/**
 * An adapter for an engine of your own. `animate` is the whole contract:
 * play these keyframes on this element with this timing, and say when it
 * is over.
 *
 * ```ts
 * const anime = createMotionAdapter({
 *   name: "Anime.js",
 *   animate: (element, keyframes, timing) => {
 *     const animation = animate(element, { ...cssKeyframes(keyframes), duration: timing.duration, delay: timing.delay })
 *     return { finished: animation.then(), cancel: () => animation.revert() }
 *   },
 * })
 * ```
 */
export function createMotionAdapter(adapter: MotionAdapter): MotionAdapter {
  if (typeof adapter?.animate !== "function") {
    throw new TypeError("createMotionAdapter needs an animate function")
  }
  return { ...adapter, name: adapter.name || "Custom" }
}

/**
 * Plays motion with the browser's Web Animations API. It moves what the
 * built-in CSS moves, the same way, from script: a base for an adapter of
 * your own, and a way to add presets without another dependency.
 */
export function waapiAdapter(options: MotionAdapterOptions = {}): MotionAdapter {
  return {
    name: options.name ?? "Web Animations",
    ...common(options),
    // An animation's effect is not an inline style; there is nothing to put back.
    writesStyle: false,
    // The browser starts the clock at the frame that first shows the animation.
    startsOnPaint: true,
    animate(element, keyframes, timing) {
      if (typeof element.animate !== "function") return undefined
      const settings: KeyframeAnimationOptions = {
        duration: timing.duration,
        delay: timing.delay,
        iterations: timing.repeat ? Number.POSITIVE_INFINITY : 1,
        direction: timing.alternate ? "alternate" : "normal",
        // Before it starts an element shows its first frame; what has left stays gone.
        fill: timing.kind === "exit" ? "both" : "backwards",
      }
      const frames = cssKeyframes(keyframes) as PropertyIndexedKeyframes
      let animation: Animation
      try {
        animation = element.animate(frames, { ...settings, easing: timing.easing })
      } catch {
        // A timing function the browser doesn't read.
        animation = element.animate(frames, settings)
      }
      return {
        finished: animation.finished,
        cancel: () => animation.cancel(),
      }
    },
  }
}

/** What Motion's `animate` returns, as far as the adapter reads it. */
interface MotionControls {
  finished?: Promise<unknown>
  then?: (resolve: () => void, reject?: () => void) => unknown
  cancel?: () => void
  stop?: () => void
}

/** Motion's `animate`: `import { animate } from "motion"`. */
// biome-ignore lint/suspicious/noExplicitAny: Motion's own types are wider than what the adapter passes
export type MotionAnimate = (element: any, keyframes: any, options?: any) => MotionControls

export interface MotionOptions extends MotionAdapterOptions {
  /**
   * Motion transitions by kind of movement, merged over the design's
   * duration and easing: `{ enter: { type: "spring", bounce: 0.2 } }`.
   * By default `emphasis` and `layout` are springs, which is what Motion
   * is for; pass `false` for a kind to keep the design's easing there.
   */
  transitions?: Partial<Record<MotionKind, Record<string, unknown> | false>>
}

const SPRINGS: Partial<Record<MotionKind, Record<string, unknown>>> = {
  emphasis: { type: "spring", bounce: 0.4 },
  layout: { type: "spring", bounce: 0.18 },
}

/** Keyframes under the names Motion gives them. */
function motionKeyframes(keyframes: MotionKeyframes): Record<string, unknown> {
  const { blur, ...direct } = keyframes
  const values: Record<string, unknown> = { ...direct }
  if (blur) values.filter = blur.map((amount) => `blur(${amount}px)`)
  return values
}

/**
 * Plays motion with [Motion](https://motion.dev): springs for the entrance
 * worth noticing and for `morph`, the design's timing for everything else.
 *
 * ```ts
 * import { animate } from "motion"
 * const library = defineLibrary({ motion: motionAdapter(animate) })
 * ```
 */
export function motionAdapter(animate: MotionAnimate, options: MotionOptions = {}): MotionAdapter {
  return {
    name: options.name ?? "Motion",
    ...common(options),
    animate(element, keyframes, timing) {
      const seconds = timing.duration / 1000
      const tween = { duration: seconds, ease: timing.bezier ?? "easeOut" }
      const chosen = options.transitions?.[timing.kind]
      const own = chosen === false ? undefined : (chosen ?? SPRINGS[timing.kind])
      const transition: Record<string, unknown> = {
        ...tween,
        ...(own
          ? {
              ...own,
              // A spring settles in about the time the design gives the movement.
              ...(own.type === "spring" && own.duration === undefined && own.stiffness === undefined
                ? { visualDuration: seconds * 0.6 }
                : {}),
              // What fades keeps the design's curve: a spring would overshoot past opaque.
              opacity: tween,
              filter: tween,
            }
          : {}),
        ...(typeof timing.transition === "object" && timing.transition !== null ? timing.transition : {}),
        delay: timing.delay / 1000,
      }
      if (timing.repeat) {
        transition.repeat = Number.POSITIVE_INFINITY
        transition.repeatType = timing.alternate ? "reverse" : "loop"
      }
      const controls = animate(element, motionKeyframes(keyframes), transition)
      if (!controls) return undefined
      const finished =
        controls.finished ??
        new Promise<void>((resolve) => {
          if (typeof controls.then === "function") controls.then(resolve, resolve)
          else resolve()
        })
      return {
        finished,
        cancel: () => (controls.cancel ?? controls.stop)?.call(controls),
      }
    },
  }
}

interface GsapTween {
  kill(): unknown
}

/** The part of GSAP the adapter calls: `import gsap from "gsap"`. */
export interface GsapLike {
  // biome-ignore lint/suspicious/noExplicitAny: GSAP's own types are wider than what the adapter passes
  fromTo(target: any, from: any, to: any): GsapTween
  // biome-ignore lint/suspicious/noExplicitAny: as above
  to(target: any, vars: any): GsapTween
  // biome-ignore lint/suspicious/noExplicitAny: as above
  set(target: any, vars: any): unknown
}

export interface GsapOptions extends MotionAdapterOptions {
  /**
   * GSAP eases by kind of movement, instead of the design's curve:
   * `{ emphasis: "back.out(1.7)", enter: "power3.out" }`.
   */
  eases?: Partial<Record<MotionKind, string | ((progress: number) => number)>>
}

const GSAP_NAMES: Record<string, string> = {
  rotate: "rotation",
}

function gsapValues(keyframes: MotionKeyframes, index: number | "all"): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const [name, list] of Object.entries(keyframes) as [keyof MotionKeyframes, number[]][]) {
    if (!list?.length) continue
    const pick = (value: number) => (name === "blur" ? `blur(${value}px)` : value)
    const key = name === "blur" ? "filter" : (GSAP_NAMES[name] ?? name)
    values[key] =
      index === "all" ? list.map(pick) : pick(list[Math.min(index, list.length - 1)] as number)
  }
  return values
}

/**
 * Plays motion with [GSAP](https://gsap.com). The design's easing curves
 * are followed exactly unless `eases` names GSAP's own.
 *
 * ```ts
 * import gsap from "gsap"
 * const library = defineLibrary({ motion: gsapAdapter(gsap, { eases: { emphasis: "back.out(1.7)" } }) })
 * ```
 */
export function gsapAdapter(gsap: GsapLike, options: GsapOptions = {}): MotionAdapter {
  return {
    name: options.name ?? "GSAP",
    ...common(options),
    animate(element, keyframes, timing): MotionPlayback | undefined {
      const ease =
        options.eases?.[timing.kind] ??
        (typeof timing.transition === "string" ? timing.transition : undefined) ??
        (timing.bezier ? cubicBezier(...timing.bezier) : timing.easing === "linear" ? "none" : "power2.out")
      let done: () => void = () => {}
      const finished = new Promise<void>((resolve) => {
        done = resolve
      })
      const vars = {
        duration: timing.duration / 1000,
        delay: timing.delay / 1000,
        ease,
        repeat: timing.repeat ? -1 : 0,
        yoyo: timing.alternate,
        // The first frame shows through the delay, as with the built-in entrances.
        immediateRender: true,
        overwrite: "auto",
        onComplete: done,
      }
      const tween =
        keyframeCount(keyframes) > 2
          ? (gsap.set(element, gsapValues(keyframes, 0)),
            gsap.to(element, { ...vars, keyframes: { ...gsapValues(keyframes, "all"), ease } }))
          : gsap.fromTo(element, gsapValues(keyframes, 0), { ...gsapValues(keyframes, 1), ...vars })
      return {
        finished,
        cancel: () => {
          tween.kill()
        },
      }
    },
  }
}

export type { MotionAdapter, MotionKeyframes, MotionKind, MotionPlayback, MotionPreset, MotionTiming }
