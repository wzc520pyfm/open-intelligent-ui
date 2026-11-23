import { PRIMITIVE_VIEWS } from "@open-intelligent-ui/core/renderer"
import type { AnyComponent, Draw } from "../render/node.js"
import { PARTS } from "../render/view.js"
import View from "../render/View.svelte"
import Icon from "./Icon.svelte"
import Image from "./Image.svelte"

/** The stateless parts and what draws each. The renderer draws these without a component. */
export const VIEWS = new Map<AnyComponent, Draw>()

/** A stateless part: a description of elements, and a component that draws it. */
export function stateless(draw: Draw): AnyComponent {
  const component = ((anchor: unknown, props: Record<string, unknown>) =>
    (View as unknown as (anchor: unknown, props: unknown) => unknown)(anchor, {
      draw,
      props,
    })) as unknown as AnyComponent
  VIEWS.set(component, draw)
  return component
}

PARTS.icon = Icon

const shared = Object.fromEntries(
  Object.entries(PRIMITIVE_VIEWS).map(([name, draw]): [string, AnyComponent] => [
    name,
    stateless(draw as Draw),
  ])
)

/** The layout primitives of IUI markup, by tag name. */
export const PRIMITIVES: Record<string, AnyComponent> = {
  ...shared,
  icon: Icon,
  image: Image,
}

export { Icon }
export { preloadIcons } from "./icons.svelte.js"
