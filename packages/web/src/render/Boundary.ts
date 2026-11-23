import { type Component, h } from "../dom/node"

export interface BoundaryProps {
  /** When this changes, a failed block is tried again. */
  resetKey: string
  /** While streaming, a broken block stays hidden instead of showing an error. */
  quiet: boolean
  onError?: (error: unknown) => void
}

/**
 * Catches a block that fails to render, so one bad component doesn't take
 * down the rest of the surface.
 */
export const Boundary: Component<BoundaryProps> = (instance) => {
  let failure: { error: unknown } | null = null
  let key = instance.props.resetKey

  instance.onError((error) => {
    failure = { error }
    instance.props.onError?.(error)
  })

  return () => {
    if (key !== instance.props.resetKey) {
      key = instance.props.resetKey
      failure = null
    }
    if (failure === null) return instance.children
    if (instance.props.quiet) {
      return h("span", { attrs: { class: "iui-pending", "aria-hidden": "true" } })
    }
    const { error } = failure
    return h("div", { attrs: { class: "iui-error", role: "note" } }, [
      h("strong", {}, "This part couldn't be shown."),
      h("span", {}, error instanceof Error ? error.message : String(error)),
    ])
  }
}
