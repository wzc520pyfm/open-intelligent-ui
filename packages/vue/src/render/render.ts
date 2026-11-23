import {
  createRenderer,
  type RenderContext as CoreRenderContext,
  isHtmlAttribute,
  type LetBinding,
  lazyRecord,
} from "@open-intelligent-ui/core/renderer"
import { type Component, camelize, Fragment, h, shallowRef, type VNodeChild } from "vue"
import { PARTS, PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { vueDialect } from "./dialect"
import { Presence } from "./Presence"
import { isWidget, widgetComponent } from "./widget"

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

/**
 * `onVnodeMounted` and its kin are not events: Vue calls them with the node
 * it built, which leads to the app around the surface. Markup gets none.
 */
const VNODE_HOOK = /^onVnode/i

function withoutHooks(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (!VNODE_HOOK.test(name)) out[name] = value
  }
  return out
}

const declarations = new WeakMap<object, Set<string> | null>()

/**
 * A component from `defineAsyncComponent` declares nothing itself: its props
 * are those of what it loads. Until then nothing it is given is known to be one.
 */
const NOTHING = new Set<string>()
const loading = new WeakSet<object>()
const loaded = shallowRef(0)

/** The renderer's own components read what they are given by name and choose what reaches the DOM. */
const OWN = new Set<Component>([...Object.values(PRIMITIVES), ...Object.values(PRESETS)])

/**
 * The props a component declares, or `null` when everything it is given is
 * a prop: the renderer's own components, and functions that declare none.
 */
function declared(type: Component): Set<string> | null {
  if (OWN.has(type) || isWidget(type)) return null
  const later = type as { __asyncLoader?: () => Promise<unknown>; __asyncResolved?: Component }
  if (later.__asyncLoader) {
    if (later.__asyncResolved) return declared(later.__asyncResolved)
    // Read so the surface is drawn again once the props are known.
    void loaded.value
    if (!loading.has(type)) {
      loading.add(type)
      const settle = () => {
        loaded.value += 1
      }
      later.__asyncLoader().then(settle, settle)
    }
    return NOTHING
  }
  const known = declarations.get(type)
  if (known !== undefined) return known
  const options = type as { props?: unknown; mixins?: Component[]; extends?: Component }
  const names = new Set<string>()
  const collect = (from: typeof options) => {
    if (Array.isArray(from.props)) for (const name of from.props) names.add(camelize(String(name)))
    else if (from.props && typeof from.props === "object") {
      for (const name of Object.keys(from.props)) names.add(camelize(name))
    }
    for (const mixin of from.mixins ?? []) collect(mixin as typeof options)
    if (from.extends) collect(from.extends as typeof options)
  }
  collect(options)
  // A function that says nothing about props is given all of them as props.
  // One that declares some, or none, has the rest fall through like any other.
  const found = typeof type === "function" && options.props === undefined ? null : names
  declarations.set(type, found)
  return found
}

/**
 * What a component is given. A prop it doesn't declare lands on its element,
 * and there Vue sets a property when the element has one of that name:
 * `outerHTML` would replace the element with markup of the model's choosing,
 * `hostname` would repoint a link that was checked. So such a name is kept
 * only if it is a plain HTML attribute, and is otherwise set as an attribute
 * (`^name`), which is what React does with a prop it doesn't know.
 */
function componentProps(type: Component, props: Record<string, unknown>, key: string) {
  const own = declared(type)
  if (own === null) return { ...withoutHooks(props), key }
  const out: Record<string, unknown> = { key }
  for (const [name, value] of Object.entries(props)) {
    if (VNODE_HOOK.test(name)) continue
    // Set as an attribute, text under an `on` name would be an inline handler.
    if (/^on/i.test(name) && typeof value !== "function" && !own.has(camelize(name))) continue
    const passes =
      name === "class" ||
      name === "style" ||
      own.has(camelize(name)) ||
      name.startsWith("aria-") ||
      name.startsWith("data-") ||
      (/^on[A-Z]/.test(name) && typeof value === "function") ||
      isHtmlAttribute(name.toLowerCase()) ||
      name === "htmlFor"
    out[passes ? name : `^${name}`] = value
  }
  return out
}

/** Renders parsed markup to Vue nodes. */
export const renderNodes = createRenderer<VNodeChild, Component>({
  dialect: vueDialect,
  primitives: PRIMITIVES,
  presets: PRESETS,
  lookup: lookupUiSdk,
  widget: (setup) => widgetComponent(setup, PARTS),
  fragment: (children, key) => h(Fragment, { key }, children),
  element: (tag, props, key, children) =>
    h(tag, { ...withoutHooks(props), key }, children ?? undefined),
  component: (type, props, key, children) =>
    h(
      type,
      componentProps(type, props, key),
      children.length ? { default: () => children } : undefined
    ),
  scoped: (type, props, key, lets, render) =>
    h(type, componentProps(type, props, key), {
      default: (given: unknown) =>
        render(lets.map((binding, position) => slotValue(given, binding, position))),
    }),
  presence: (child, show, key) => h(Presence, { key, show }, { default: () => [child] }),
  pending: (key) => h("span", { key, class: "iui-pending", "aria-hidden": "true" }),
})
