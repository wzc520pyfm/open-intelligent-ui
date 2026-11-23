import { defineComponent, h, onErrorCaptured, type PropType, shallowRef, watch } from "vue"

/** Errors thrown by an event handler leave what is on screen intact. */
const FROM_HANDLER = /event handler$|#runtime-[56]$/

/**
 * Catches a block that fails to render, so one bad component doesn't take
 * down the rest of the surface.
 */
export const Boundary = defineComponent({
  name: "IuiBoundary",
  props: {
    /** When this changes, a failed block is tried again. */
    resetKey: { type: String, default: "" },
    /** While streaming, a broken block stays hidden instead of showing an error. */
    quiet: { type: Boolean, default: false },
    onError: { type: Function as PropType<(error: unknown) => void>, default: undefined },
  },
  setup(props, { slots }) {
    const failure = shallowRef<{ error: unknown } | null>(null)

    watch(
      () => props.resetKey,
      () => {
        failure.value = null
      }
    )

    onErrorCaptured((error, _instance, info) => {
      props.onError?.(error)
      if (!FROM_HANDLER.test(info)) failure.value = { error }
      return false
    })

    return () => {
      if (failure.value === null) return slots.default?.()
      if (props.quiet) return h("span", { class: "iui-pending", "aria-hidden": "true" })
      const { error } = failure.value
      return h("div", { class: "iui-error", role: "note" }, [
        h("strong", "This part couldn't be shown."),
        h("span", error instanceof Error ? error.message : String(error)),
      ])
    }
  },
})
