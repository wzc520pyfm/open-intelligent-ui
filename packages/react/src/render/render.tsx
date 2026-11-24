import {
  createRenderer,
  type RenderContext as CoreRenderContext,
} from "@open-intelligent-ui/core/renderer"
import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactNode,
} from "react"
import { PARTS, PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { reactDialect } from "./dialect"
import { Presence } from "./Presence"
import { widgetComponent } from "./widget"

// biome-ignore lint/suspicious/noExplicitAny: components are looked up by name and take whatever markup passes
export type AnyComponent = ComponentType<any>

export type RenderContext = CoreRenderContext<AnyComponent>

/** Renders parsed markup to React nodes. */
export const renderNodes = createRenderer<ReactNode, AnyComponent>({
  dialect: reactDialect,
  primitives: PRIMITIVES,
  presets: PRESETS,
  lookup: lookupUiSdk,
  widget: (setup) => widgetComponent(setup, PARTS),
  fragment: (children, key) => <Fragment key={key}>{children}</Fragment>,
  element: (tag, props, key, children) =>
    children === null
      ? createElement(tag, { ...props, key })
      : createElement(tag, { ...props, key }, ...children),
  component: (type, props, key, children) =>
    createElement(type, { ...props, key }, ...children),
  // React components hand `let:` values to a function child, in order.
  scoped: (type, props, key, _lets, render) =>
    createElement(type, {
      ...props,
      key,
      children: (...values: unknown[]) => <>{render(values)}</>,
    }),
  presence: (child, show, key) => (
    <Presence key={key} show={show}>
      {child}
    </Presence>
  ),
  pending: (key) => <span key={key} className="iui-pending" aria-hidden="true" />,
})
