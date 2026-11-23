import { exitAnimations } from "@open-intelligent-ui/core/renderer"
import { type Component, h } from "../dom/node"

/**
 * Keeps its child on screen while the exit animation plays. The child gets
 * `data-iui-exit` on its wrapper during that time, and is removed once every
 * animation inside that ends has finished.
 */
export const Presence: Component<{ show: boolean }> = (instance) => {
  let shown = instance.props.show
  let mounted = shown
  let exiting = false
  let element: Element | null = null
  let run = 0

  const settle = () => {
    const { show } = instance.props
    if (show === shown) return
    shown = show
    const mine = ++run
    if (show) {
      mounted = true
      exiting = false
      return
    }
    if (!mounted) return
    exiting = true
    const done = () => {
      if (run !== mine) return
      mounted = false
      exiting = false
      instance.invalidate()
    }
    // The exit styles have to be applied before their animations exist.
    wait = () => {
      if (run !== mine) return
      const exit = exitAnimations(element as HTMLElement | null)
      if (exit) void exit.then(done)
      else done()
    }
  }

  let wait: (() => void) | null = null
  instance.onUpdated(() => {
    const work = wait
    wait = null
    work?.()
  })

  return () => {
    settle()
    if (!mounted) return null
    return h(
      "span",
      {
        attrs: { class: "iui-presence", "data-iui-exit": exiting ? "" : undefined },
        hooks: {
          mounted: (target) => {
            element = target
          },
          removed: () => {
            element = null
          },
        },
      },
      instance.children
    )
  }
}
