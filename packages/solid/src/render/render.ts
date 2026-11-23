import {
  createRenderer,
  type RenderContext as CoreRenderContext,
} from "@open-intelligent-ui/core/renderer"
import { PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { widgetOf } from "./component"
import { solidDialect } from "./dialect"
import { type AnyComponent, element, type Node } from "./node"

export type RenderContext = CoreRenderContext<AnyComponent>

/** Renders parsed markup to nodes for the renderer to mount or change. */
export const renderNodes = createRenderer<Node, AnyComponent>({
  dialect: solidDialect,
  primitives: PRIMITIVES,
  presets: PRESETS,
  lookup: lookupUiSdk,
  fragment: (children, key) => ({ kind: "fragment", key, children }),
  element: (tag, props, key, children) => ({
    kind: "element",
    tag,
    props,
    key,
    children,
    own: false,
  }),
  component: (type, props, key, children) => {
    const widget = widgetOf(type)
    return widget
      ? { kind: "widget", widget, props, key, children }
      : { kind: "component", type, props, key, children }
  },
  scoped: (type, props, key, lets, render) => ({
    kind: "component",
    type,
    props,
    key,
    children: [],
    scoped: { lets, render },
  }),
  presence: (child, show, key) => ({ kind: "presence", child, show, key }),
  pending: (key) => element("span", { class: "iui-pending", "aria-hidden": "true" }, null, key),
})
