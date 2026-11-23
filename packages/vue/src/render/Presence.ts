import { exitAnimations } from "@open-intelligent-ui/core/renderer"
import { defineComponent, h, nextTick, ref, watch } from "vue"

/**
 * Keeps its child on screen while the exit animation plays. The child gets
 * `data-iui-exit` on its wrapper during that time, and is removed once every
 * animation inside that ends has finished.
 */
export const Presence = defineComponent({
  name: "IuiPresence",
  props: { show: { type: Boolean, required: true } },
  setup(props, { slots }) {
    const mounted = ref(props.show)
    const exiting = ref(false)
    const element = ref<HTMLElement | null>(null)
    let run = 0

    watch(
      () => props.show,
      (show) => {
        const mine = ++run
        if (show) {
          mounted.value = true
          exiting.value = false
          return
        }
        if (!mounted.value) return
        exiting.value = true
        const done = () => {
          if (run !== mine) return
          mounted.value = false
          exiting.value = false
        }
        // The exit styles have to be applied before their animations exist.
        void nextTick(() => {
          if (run !== mine) return
          const exit = exitAnimations(element.value)
          if (exit) void exit.then(done)
          else done()
        })
      }
    )

    return () =>
      mounted.value
        ? h(
            "span",
            {
              ref: element,
              class: "iui-presence",
              "data-iui-exit": exiting.value ? "" : undefined,
            },
            slots.default?.()
          )
        : null
  },
})
