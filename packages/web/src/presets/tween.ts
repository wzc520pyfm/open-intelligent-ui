import { tween, tweenless } from "@open-intelligent-ui/core/renderer"
import type { Instance } from "../dom/node"

/**
 * Moves a list of numbers smoothly towards `target()` whenever it changes.
 * Starts from `from` (zero by default) the first time, so charts grow in.
 * Read the result through `current()`, which never lags behind a change in
 * how many numbers there are.
 */
export function useTween(
  // biome-ignore lint/suspicious/noExplicitAny: any component can tween
  instance: Instance<any>,
  target: () => number[],
  duration: () => number = () => 420,
  from = 0
): { current: () => number[] } {
  const first = target()
  let values = tweenless() ? first : first.map(() => from)
  let stop: (() => void) | undefined
  let key: string | undefined

  const run = () => {
    const goal = target()
    const next = goal.join(",")
    if (next === key) return
    key = next
    stop?.()
    stop = undefined
    if (tweenless()) {
      if (values !== goal) {
        values = goal
        instance.invalidate()
      }
      return
    }
    const start = goal.map((_, index) => values[index] ?? from)
    if (start.every((value, index) => value === goal[index])) {
      if (values.length !== goal.length) values = goal
      return
    }
    stop = tween(start, goal, duration(), (step) => {
      values = step
      instance.invalidate()
    })
  }

  instance.onMounted(run)
  instance.onUpdated(run)
  instance.onUnmounted(() => stop?.())

  return {
    current: () => {
      const goal = target()
      return values.length === goal.length ? values : goal
    },
  }
}
