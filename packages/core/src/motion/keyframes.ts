import type { MotionKeyframes } from "../renderer/motion"

/** The value at `index` of a list that may be shorter than the animation: its last one holds. */
const at = (values: number[] | undefined, index: number, rest: number): number =>
  values?.length ? (values[Math.min(index, values.length - 1)] as number) : rest

/** How many steps the longest property has. */
export function keyframeCount(keyframes: MotionKeyframes): number {
  return Math.max(0, ...Object.values(keyframes).map((values) => (Array.isArray(values) ? values.length : 0)))
}

/**
 * Keyframes as the Web Animations API and CSS spell them: one list per
 * property, with `translate`, `scale` and `rotate` as properties of their
 * own, so an element's `transform` is left alone.
 */
export function cssKeyframes(keyframes: MotionKeyframes): Record<string, (string | number)[]> {
  const count = keyframeCount(keyframes)
  const steps = Array.from({ length: count }, (_, index) => index)
  const css: Record<string, (string | number)[]> = {}
  if (keyframes.opacity) css.opacity = steps.map((index) => at(keyframes.opacity, index, 1))
  if (keyframes.x || keyframes.y) {
    css.translate = steps.map((index) => `${at(keyframes.x, index, 0)}px ${at(keyframes.y, index, 0)}px`)
  }
  if (keyframes.scale || keyframes.scaleX || keyframes.scaleY) {
    css.scale = steps.map((index) => {
      const all = at(keyframes.scale, index, 1)
      return `${at(keyframes.scaleX, index, 1) * all} ${at(keyframes.scaleY, index, 1) * all}`
    })
  }
  if (keyframes.rotate) css.rotate = steps.map((index) => `${at(keyframes.rotate, index, 0)}deg`)
  if (keyframes.blur) css.filter = steps.map((index) => `blur(${at(keyframes.blur, index, 0)}px)`)
  if (keyframes.strokeDashoffset) {
    css.strokeDashoffset = steps.map((index) => at(keyframes.strokeDashoffset, index, 0))
  }
  return css
}

/**
 * A cubic bezier timing function as a function of progress, for an engine
 * that takes easing as code. The same curve CSS draws for
 * `cubic-bezier(x1, y1, x2, y2)`.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (progress: number) => number {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (t: number) => ((ax * t + bx) * t + cx) * t
  const y = (t: number) => ((ay * t + by) * t + cy) * t
  const slope = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (progress) => {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    let t = progress
    for (let round = 0; round < 8; round++) {
      const error = x(t) - progress
      if (Math.abs(error) < 1e-5) return y(t)
      const d = slope(t)
      if (Math.abs(d) < 1e-6) break
      t -= error / d
    }
    // Newton's method stalled on a flat stretch: close in by halves.
    let low = 0
    let high = 1
    t = progress
    for (let round = 0; round < 24; round++) {
      const value = x(t)
      if (Math.abs(value - progress) < 1e-5) break
      if (value < progress) low = t
      else high = t
      t = (low + high) / 2
    }
    return y(t)
  }
}
