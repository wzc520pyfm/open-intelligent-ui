import { tween, tweenless } from "@open-intelligent-ui/core/renderer"
import type { WidgetHandle } from "../render/widget"

/**
 * Moves a list of numbers smoothly towards the goal it is asked for, drawing
 * the widget again on every frame. Starts from `from` (zero by default) the
 * first time, so charts grow in. What it returns never lags behind a change
 * in how many numbers there are.
 */
export function createTween(
  handle: WidgetHandle,
  from = 0
): (goal: number[], duration?: number) => number[] {
  let values: number[] | undefined
  let heading: string | undefined
  let stop: (() => void) | undefined
  handle.cleanup(() => stop?.())

  return (goal, duration = 420) => {
    values ??= tweenless() ? goal : goal.map(() => from)
    const key = goal.join(",")
    if (key !== heading) {
      heading = key
      stop?.()
      stop = undefined
      const before = values
      if (tweenless()) values = goal
      else {
        const start = goal.map((_, index) => before[index] ?? from)
        if (start.every((value, index) => value === goal[index])) {
          if (before.length !== goal.length) values = goal
        } else {
          stop = tween(start, goal, duration, (next) => {
            values = next
            handle.redraw()
          })
        }
      }
    }
    return values.length === goal.length ? values : goal
  }
}
