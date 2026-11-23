import { tween, tweenless } from "@open-intelligent-ui/core/renderer"
import { useEffect, useRef, useState } from "react"

/**
 * Moves a list of numbers smoothly towards `target` whenever it changes.
 * Starts from `from` (zero by default) the first time, so charts grow in.
 */
export function useTween(target: number[], duration = 420, from = 0): number[] {
  const [values, setValues] = useState<number[]>(() =>
    tweenless() ? target : target.map(() => from)
  )
  const current = useRef(values)
  current.current = values
  const key = target.join(",")

  // `key` stands in for `target`, which is a new array on every render.
  useEffect(() => {
    if (tweenless()) {
      setValues(target)
      return
    }
    const start = target.map((_, index) => current.current[index] ?? from)
    if (start.every((value, index) => value === target[index])) {
      if (current.current.length !== target.length) setValues(target)
      return
    }
    return tween(start, target, duration, setValues)
  }, [key, duration, from])

  return values.length === target.length ? values : target
}
