import { tween, tweenless } from "@open-intelligent-ui/core/renderer"
import { untrack } from "svelte"

/**
 * Moves a list of numbers smoothly towards `target()` whenever it changes.
 * Starts from `from` (zero by default) the first time, so charts grow in.
 * Read the result through `current()`, which never lags behind a change in
 * how many numbers there are.
 */
export function useTween(
  target: () => number[],
  duration: () => number = () => 420,
  from = 0
): { current: () => number[] } {
  const first = untrack(target)
  let values = $state.raw(tweenless() ? first : first.map(() => from))
  let stop: (() => void) | undefined

  const run = () => {
    stop?.()
    stop = undefined
    const goal = target()
    if (tweenless()) {
      values = goal
      return
    }
    const start = goal.map((_, index) => values[index] ?? from)
    if (start.every((value, index) => value === goal[index])) {
      if (values.length !== goal.length) values = goal
      return
    }
    stop = tween(start, goal, duration(), (next) => {
      values = next
    })
  }

  $effect(() => {
    void target().join(",")
    untrack(run)
  })
  $effect(() => () => stop?.())

  return {
    current: () => {
      const goal = target()
      return values.length === goal.length ? values : goal
    },
  }
}
