import {
  createRenderer,
  type RenderContext as CoreRenderContext,
  lazyRecord,
  type Lookup,
} from "@open-intelligent-ui/core/renderer"
import { PRESETS } from "../presets/presets"
import { PRIMITIVES, VIEWS } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { UI_SDK_PROPS } from "../registry/ui-sdk.generated"
import { svelteDialect } from "./dialect"
import type { AnyComponent, RenderNode } from "./node"
import { componentProps, nativeProps } from "./props"

export type RenderContext = CoreRenderContext<AnyComponent>

/**
 * State a Svelte part hands its snippet knows a field only when asked for
 * it, and listens for changes to the fields that were asked for. It has to
 * be read as the markup reads it, not copied.
 */
function readable(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length) return value
  const state = value as Record<string, unknown>
  return lazyRecord((name) => state[name])
}

/** The renderer's own components read what they are given by name and choose what reaches the DOM. */
const OWN = new Set<AnyComponent>([...Object.values(PRIMITIVES), ...Object.values(PRESETS)])

const fromUiSdk = new WeakSet<AnyComponent>()

function lookup(name: string): Lookup<AnyComponent> {
  const found: Lookup<AnyComponent> = lookupUiSdk(name)
  if (found.status === "ready") fromUiSdk.add(found.component)
  return found
}

function component(
  type: AnyComponent,
  props: Record<string, unknown>,
  key: string,
  children: RenderNode[]
): RenderNode {
  const draw = VIEWS.get(type)
  if (draw) return { kind: "view", key, draw, props, children }
  const given = OWN.has(type) ? props : componentProps(props, fromUiSdk.has(type) ? UI_SDK_PROPS : null)
  return { kind: "component", type, props: given, key, children }
}

/** Renders parsed markup to the nodes `Nodes.svelte` draws. */
export const renderNodes = createRenderer<RenderNode, AnyComponent>({
  dialect: svelteDialect,
  primitives: PRIMITIVES,
  presets: PRESETS,
  lookup,
  fragment: (children, key) => ({ kind: "fragment", key, children }),
  element: (tag, props, key, children) => ({
    kind: "element",
    tag,
    props: nativeProps(props),
    key,
    children,
  }),
  component,
  // A Svelte part hands its snippet one value, as a React part hands its
  // function child: the first `let:` names it.
  scoped: (type, props, key, lets, render) => {
    const node = component(type, props, key, [])
    if (typeof node === "string" || node.kind !== "component") return node
    return {
      ...node,
      render: (given) => render(lets.map((_, position) => (position === 0 ? readable(given) : undefined))),
    }
  },
  presence: (child, show, key) => ({ kind: "presence", key, show, child }),
  pending: (key) => ({
    kind: "element",
    tag: "span",
    props: { class: "iui-pending", "aria-hidden": "true" },
    key,
    children: [],
  }),
})
