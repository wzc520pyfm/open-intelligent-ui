import type { WidgetSetup } from "@open-intelligent-ui/core"
import { startWidget } from "@open-intelligent-ui/core/renderer"
import { children as resolved, createRenderEffect, getOwner, onCleanup } from "solid-js"
import { Children } from "./mount"
import type { AnyComponent, Node } from "./node"
import type { Widget } from "./widget"

const widgets = new WeakMap<AnyComponent, Widget>()

/** The widget behind one of the renderer's own components, which markup draws without the wrapper. */
export const widgetOf = (type: AnyComponent): Widget | undefined => widgets.get(type)

/**
 * A widget as a Solid component, for a host that wants a primitive or a
 * preset in its own JSX. It draws the same view markup gets.
 */
export function component(widget: Widget): AnyComponent {
  const Component = (props: Record<string, unknown>) => {
    const mounted = new Children({ owner: getOwner(), space: "html" })
    onCleanup(() => mounted.dispose())
    // Resolved apart from the other props, so a prop changing doesn't make them again.
    const inside = resolved(() => props.children as never)
    createRenderEffect(
      () => {
        const given: Record<string, unknown> = {}
        for (const name of Object.keys(props)) {
          if (name !== "children") given[name] = props[name]
        }
        return { given, filled: "children" in props }
      },
      ({ given, filled }) => {
        const children: Node[] = filled
          ? [{ kind: "foreign", value: inside, key: undefined }]
          : []
        mounted.patch([{ kind: "widget", widget, props: given, key: undefined, children }])
      }
    )
    return mounted.read as never
  }
  widgets.set(Component, widget)
  return Component
}

const neutral = new WeakMap<WidgetSetup, AnyComponent>()

/**
 * A widget written for every renderer, from a host's library, as one of
 * this renderer's own: it is given an element by a `ref` on it.
 */
export function widgetComponent(setup: WidgetSetup): AnyComponent {
  const known = neutral.get(setup)
  if (known) return known
  const made = component((handle) => {
    const instance = startWidget(setup, {
      redraw: handle.redraw,
      ref: (set) => ({ ref: (element: Element) => set(element) }),
    })
    handle.cleanup(() => instance.dispose())
    return (props, children) => instance.draw(props, children ?? [])
  })
  neutral.set(setup, made)
  return made
}
