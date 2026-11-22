import { Component, type ReactNode } from "react"

interface BoundaryProps {
  /** When this changes, a failed block is tried again. */
  resetKey: unknown
  /** While streaming, a broken block stays hidden instead of showing an error. */
  quiet: boolean
  onError: (error: unknown) => void
  children: ReactNode
}

interface BoundaryState {
  error: unknown
  resetKey: unknown
}

/**
 * Catches a block that fails to render, so one bad component doesn't take
 * down the rest of the surface.
 */
export class Boundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState
  ): Partial<BoundaryState> | null {
    if (props.resetKey === state.resetKey) return null
    return { error: null, resetKey: props.resetKey }
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError(error)
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children
    if (this.props.quiet) return <span className="iui-pending" aria-hidden="true" />
    const message =
      this.state.error instanceof Error
        ? this.state.error.message
        : String(this.state.error)
    return (
      <div className="iui-error" role="note">
        <strong>This part couldn't be shown.</strong>
        <span>{message}</span>
      </div>
    )
  }
}
