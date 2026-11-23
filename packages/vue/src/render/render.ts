import {
  createRenderer,
  type RenderContext as CoreRenderContext,
  type LetBinding,
  lazyRecord,
} from "@open-intelligent-ui/core/renderer"
import { type Component, Fragment, h, type VNodeChild } from "vue"
import { PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { vueDialect } from "./dialect"
import { Presence } from "./Presence"

export type RenderContext = CoreRenderContext<Component>

/**
 * State a Vue part hands its slot knows a field only when asked for it, and
 * listens for changes to the fields that were asked for. It has to be read
 * as the markup reads it, not copied.
 */
function readable(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length) return value
  const state = value as Record<string, unknown>
  return lazyRecord((name) => state[name])
}

/**
 * What a `let:` names. React parts hand their children one value; Vue parts
 * hand their slot an object holding it, usually as `state`.
 */
function slotValue(given: unknown, binding: LetBinding, position: number): unknown {
  if (given === null || typeof given !== "object") return position === 0 ? given : undefined
  const props = given as Record<string, unknown>
  if (Object.hasOwn(props, binding.name)) return readable(props[binding.name])
  if (position > 0) return undefined
  const names = Object.keys(props)
  if (names.length === 1) return readable(props[names[0] as string])
  if (Object.hasOwn(props, "state")) return readable(props.state)
  return props
}

/** Renders parsed markup to Vue nodes. */
export const renderNodes = createRenderer<VNodeChild, Component>({
  dialect: vueDialect,
  primitives: PRIMITIVES,
  presets: PRESETS,
  lookup: lookupUiSdk,
  fragment: (children, key) => h(Fragment, { key }, children),
  element: (tag, props, key, children) => h(tag, { ...props, key }, children ?? undefined),
  component: (type, props, key, children) =>
    h(type, { ...props, key }, children.length ? { default: () => children } : undefined),
  scoped: (type, props, key, lets, render) =>
    h(
      type,
      { ...props, key },
      {
        default: (given: unknown) =>
          render(lets.map((binding, position) => slotValue(given, binding, position))),
      }
    ),
  presence: (child, show, key) => h(Presence, { key, show }, { default: () => [child] }),
  pending: (key) => h("span", { key, class: "iui-pending", "aria-hidden": "true" }),
})
