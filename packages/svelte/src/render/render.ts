import {
  createRenderer,
  type RenderContext as CoreRenderContext,
  lazyRecord,
  type Lookup,
} from "@open-intelligent-ui/core/renderer"
import { PRESETS } from "../presets/presets.js"
import { PRIMITIVES, VIEWS } from "../primitives/primitives.js"
import { lookupUiSdk } from "../registry/ui-sdk.js"
import { UI_SDK_PROPS } from "../registry/ui-sdk.generated.js"
import { svelteDialect } from "./dialect.js"
import type { AnyComponent, RenderNode } from "./node.js"
import { componentProps, nativeProps, type SelectOption, selectProps } from "./props.js"

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

/** The text an option shows, which a block inside it can hold. */
function textOf(nodes: readonly unknown[]): string {
  let text = ""
  for (const node of nodes) {
    if (typeof node === "string") text += node
    else if (Array.isArray(node)) text += textOf(node)
    else if (node !== null && typeof node === "object") {
      const given = node as Exclude<RenderNode, string>
      if (given.kind === "fragment") text += textOf(given.children)
    }
  }
  return text
}

/** The options of a `<select>`, wherever in its children they are. */
function optionsOf(nodes: readonly unknown[], found: SelectOption[] = []): SelectOption[] {
  for (const node of nodes) {
    if (node === null || typeof node !== "object") continue
    if (Array.isArray(node)) {
      optionsOf(node, found)
      continue
    }
    const given = node as Exclude<RenderNode, string>
    if (given.kind === "fragment") optionsOf(given.children, found)
    else if (given.kind === "presence") optionsOf([given.child], found)
    else if (given.kind !== "element" || !given.children) continue
    else if (given.tag === "optgroup") optionsOf(given.children, found)
    else if (given.tag === "option") {
      // Without a `value` an option's value is its text.
      const value = given.props.value ?? textOf(given.children).trim().replace(/\s+/g, " ")
      found.push({ value: String(value), disabled: given.props.disabled !== undefined })
    }
  }
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
    props: tag === "select" ? selectProps(props, optionsOf(children ?? [])) : nativeProps(props, tag),
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
