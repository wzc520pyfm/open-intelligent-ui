import type { WidgetSetup } from "@open-intelligent-ui/core"
import type { AnyComponent } from "./node.js"
import Widget from "./Widget.svelte"

const components = new WeakMap<WidgetSetup, AnyComponent>()
const made = new WeakSet<AnyComponent>()

/** Whether `type` is a widget's component, which reads what it is given by name like the renderer's own. */
export const isWidget = (type: AnyComponent): boolean => made.has(type)

/** A widget written with framework-neutral views as a Svelte component. */
export function widgetComponent(setup: WidgetSetup): AnyComponent {
  const known = components.get(setup)
  if (known) return known
  const component = ((anchor: unknown, props: Record<string, unknown>) =>
    (Widget as unknown as (anchor: unknown, props: unknown) => unknown)(anchor, {
      setup,
      props,
    })) as unknown as AnyComponent
  components.set(setup, component)
  made.add(component)
  return component
}
