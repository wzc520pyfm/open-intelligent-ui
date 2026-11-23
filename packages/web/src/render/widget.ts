import type { WidgetSetup } from "@open-intelligent-ui/core"
import { startWidget, type ViewProps } from "@open-intelligent-ui/core/renderer"
import type { Component } from "../dom/node"
import { fromView, type ViewParts } from "./view"

const components = new WeakMap<WidgetSetup, Component<ViewProps>>()

/** A widget written with framework-neutral views, from a host's library, as one of this renderer's own. */
export function widgetComponent(setup: WidgetSetup, parts: ViewParts): Component<ViewProps> {
  const known = components.get(setup)
  if (known) return known
  const made: Component<ViewProps> = (instance) => {
    const widget = startWidget(setup, {
      redraw: () => instance.invalidate(),
      ref: (set) => ({ ref: set }),
    })
    instance.onUnmounted(() => widget.dispose())
    return () => fromView(widget.draw(instance.props, instance.children), parts)
  }
  components.set(setup, made)
  return made
}
