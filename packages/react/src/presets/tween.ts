import { easeOut, prefersReducedMotion } from "@open-intelligent-ui/core/renderer"
import { useEffect, useRef, useState } from "react"

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
