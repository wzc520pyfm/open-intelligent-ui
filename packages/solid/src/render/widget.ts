import type { ViewProps } from "@open-intelligent-ui/core/renderer"
import type { Node } from "./node"

/** What a widget can do besides draw. */
export interface WidgetHandle {
  /** Draws again with the props it was last given, after its own state changed. */
  redraw(): void
  /** Runs `work` when the widget leaves the screen. */
  cleanup(work: () => void): void
}

/**
 * Draws a view from props, or `undefined` children when it was given none.
 * The result is a view from the shared renderer, or nodes.
 */
export type Draw = (props: ViewProps, children: Node[] | undefined) => unknown

/**
 * One of the renderer's own primitives or presets. Called once per place it
 * is used; what it keeps between draws lives in its closure.
 */
export type Widget = (handle: WidgetHandle) => Draw

/** A widget that is nothing but its view. */
export const stateless =
  (draw: Draw): Widget =>
  () =>
    draw
