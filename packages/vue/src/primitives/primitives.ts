import {
  iconPlaceholder,
  iconSpec,
  imageView,
  PRIMITIVE_VIEWS,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import { type Component, defineComponent, h, ref, shallowRef } from "vue"
import { toVue, type ViewParts } from "../render/view"
import { ICON_LOADERS, type IconData } from "./icons.generated"

const drawings = new Map<string, IconData>()
const loading = new Set<string>()
/** Read by every icon on screen, so one arriving redraws the ones waiting for it. */
const arrivals = shallowRef(0)

function drawing(name: string): IconData | undefined {
  const ready = drawings.get(name)
  if (ready) return ready
  // Subscribes the icon being drawn to the next arrival.
  void arrivals.value
  if (!loading.has(name)) {
    loading.add(name)
    void (ICON_LOADERS[name] as (typeof ICON_LOADERS)[string])().then(
      (module) => {
        drawings.set(name, module.__iconData)
        arrivals.value++
      },
      (error: unknown) => {
        loading.delete(name)
        console.error(error)
      }
    )
  }
  return undefined
}

/** Loads icons ahead of time, so the first render draws them at once. */
export async function preloadIcons(...names: string[]): Promise<void> {
  await Promise.all(
    names
      .filter((name) => Object.hasOwn(ICON_LOADERS, name) && !drawings.has(name))
      .map(async (name) => {
        const module = await (ICON_LOADERS[name] as (typeof ICON_LOADERS)[string])()
        drawings.set(name, module.__iconData)
      })
  )
  arrivals.value++
}

const PARTS: ViewParts = {}

/** Draws a lucide icon by name, at the sizes and colors of the design. */
const Icon: Component = defineComponent({
  name: "IuiIcon",
  inheritAttrs: false,
  setup(_, { attrs }) {
    return () => {
      const spec = iconSpec(attrs as ViewProps)
      if (spec.name === null || !Object.hasOwn(ICON_LOADERS, spec.name)) {
        return toVue(iconPlaceholder(spec, true), PARTS)
      }
      const data = drawing(spec.name)
      if (!data) return toVue(iconPlaceholder(spec, false), PARTS)
      const box = data.size ?? 24
      // The same element lucide-react draws, so one stylesheet fits both.
      return h(
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: spec.pixels,
          height: spec.pixels,
          viewBox: `0 0 ${box} ${box}`,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": spec.stroke,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          class: [
            "lucide",
            `lucide-${data.name}`,
            ...(data.aliases ?? []).map((alias) => `lucide-${alias}`),
            spec.class,
          ],
          "aria-hidden": spec.label ? undefined : "true",
          "aria-label": spec.label ?? undefined,
          role: spec.label ? "img" : undefined,
          style: spec.style,
        },
        data.node.map(([tag, attributes]) => h(tag, attributes))
      )
    }
  },
})

PARTS.icon = Icon

const Image = defineComponent({
  name: "IuiImage",
  inheritAttrs: false,
  setup(_, { attrs }) {
    const failed = ref(false)
    const onError = () => {
      failed.value = true
    }
    return () => toVue(imageView(attrs as ViewProps, { failed: failed.value, onError }), PARTS)
  },
})

const shared = Object.fromEntries(
  Object.entries(PRIMITIVE_VIEWS).map(([name, draw]): [string, Component] => {
    const primitive = defineComponent({
      name: `Iui${name}`,
      inheritAttrs: false,
      setup(_, { attrs, slots }) {
        return () => toVue(draw(attrs as ViewProps, slots.default?.()), PARTS)
      },
    })
    return [name, primitive]
  })
)

/** The layout primitives of IUI markup, by tag name. */
export const PRIMITIVES: Record<string, Component> = {
  ...shared,
  icon: Icon,
  image: Image,
}

export { Icon }
