import { tween, tweenless } from "@open-intelligent-ui/core/renderer"
import { onBeforeUnmount, onMounted, type ShallowRef, shallowRef, watch } from "vue"

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
): { values: ShallowRef<number[]>; current: () => number[] } {
  const first = target()
  const values = shallowRef(tweenless() ? first : first.map(() => from))
  let stop: (() => void) | undefined

  const run = () => {
    stop?.()
    stop = undefined
    const goal = target()
    if (tweenless()) {
      values.value = goal
      return
    }
    const start = goal.map((_, index) => values.value[index] ?? from)
    if (start.every((value, index) => value === goal[index])) {
      if (values.value.length !== goal.length) values.value = goal
      return
    }
    stop = tween(start, goal, duration(), (next) => {
      values.value = next
    })
  }

  onMounted(run)
  watch(() => target().join(","), run)
  onBeforeUnmount(() => stop?.())

  return {
    values,
    current: () => {
      const goal = target()
      return values.value.length === goal.length ? values.value : goal
    },
  }
}
