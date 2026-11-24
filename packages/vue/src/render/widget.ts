import type { WidgetSetup } from "@open-intelligent-ui/core"
import { startWidget, type ViewProps } from "@open-intelligent-ui/core/renderer"
import { type Component, defineComponent, onBeforeUnmount, shallowRef } from "vue"
import { toVue, type ViewParts } from "./view"

const components = new WeakMap<WidgetSetup, Component>()
const made = new WeakSet<Component>()

/** Whether `type` is a widget's component, which reads what it is given by name like the renderer's own. */
export const isWidget = (type: Component): boolean => made.has(type)

/**
 * A widget written with framework-neutral views as a Vue component. The
 * widget's own state lives in its closure; Vue is only asked to draw again
 * when the widget says so.
 */
export function widgetComponent(setup: WidgetSetup, parts: ViewParts): Component {
  const known = components.get(setup)
  if (known) return known
  const component = defineComponent({
    name: "IuiWidget",
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const drawn = shallowRef(0)
      const instance = startWidget(setup, {
        redraw: () => {
          drawn.value += 1
        },
        ref: (set) => ({ ref: set }),
      })
      onBeforeUnmount(() => instance.dispose())
      return () => {
        // Read so the widget's own changes draw it again.
        void drawn.value
        const props: ViewProps = {}
        for (const [name, value] of Object.entries(attrs)) {
          // `bind:` reaches a widget as `onValueChange`; `update:value` is for Vue's own components.
          if (!name.startsWith("onUpdate:")) props[name] = value
        }
        return toVue(instance.draw(props, slots.default?.() ?? []), parts)
      }
    },
  })
  components.set(setup, component)
  made.add(component)
  return component
}
