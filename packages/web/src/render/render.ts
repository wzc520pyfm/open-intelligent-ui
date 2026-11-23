import {
  type RenderContext as CoreRenderContext,
  createRenderer,
  type ViewProps,
} from "@open-intelligent-ui/core/renderer"
import { type Child, type Component, component, fragment, h } from "../dom/node"
import { PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import type { UiSdkComponent } from "../ui-sdk/adapter"
import { webDialect } from "./dialect"
import {
  type HostComponent,
  type HostFunction,
  HostFunctionComponent,
  hostElement,
  isHostElement,
} from "./host"
import { nativeElement } from "./native"
import { Presence } from "./Presence"

/** One of the renderer's own components: a primitive or a preset. */
interface Own {
  own: Component<ViewProps>
}

/** Everything a name in markup can stand for. */
export type Renderable = Own | UiSdkComponent | HostComponent

export type RenderContext = CoreRenderContext<Renderable>

const own = (components: Record<string, Component<ViewProps>>): Record<string, Renderable> =>
  Object.fromEntries(Object.entries(components).map(([name, value]) => [name, { own: value }]))

const isOwn = (type: Renderable): type is Own =>
  typeof type === "object" && typeof (type as Own).own === "function"

const isUiSdk = (type: Renderable): type is UiSdkComponent =>
  typeof type === "object" && typeof (type as UiSdkComponent).draw === "function"

function draw(
  type: Renderable,
  props: Record<string, unknown>,
  key: string,
  children: Child[],
  open: boolean
): Child {
  if (isOwn(type)) return component(type.own, props as ViewProps, key, children)
  if (isUiSdk(type)) return type.draw(props, key, children, open)
  if (typeof type === "function") {
    return component(HostFunctionComponent, { type: type as HostFunction, props }, key, children)
  }
  if (typeof type === "string" || isHostElement(type)) return hostElement(type, props, key, children)
  return fragment(children, key)
}

/** Renders parsed markup to nodes for the patcher. */
export const renderNodes = createRenderer<Child, Renderable>({
  dialect: webDialect,
  primitives: own(PRIMITIVES),
  presets: own(PRESETS),
  lookup: lookupUiSdk,
  fragment: (children, key) => fragment(children, key),
  element: (tag, props, key, children) => nativeElement(tag, props, key, children ?? []),
  component: draw,
  scoped: (type, props, key, lets, render, open) => {
    if (isUiSdk(type)) return type.scoped(props, key, lets, render, open)
    // Nothing else hands its children anything, so what `let:` names is empty there.
    return draw(
      type,
      props,
      key,
      render(lets.map(() => undefined)),
      open
    )
  },
  presence: (child, show, key) => component(Presence, { show }, key, [child]),
  pending: (key) => h("span", { key, attrs: { class: "iui-pending", "aria-hidden": "true" } }),
})
