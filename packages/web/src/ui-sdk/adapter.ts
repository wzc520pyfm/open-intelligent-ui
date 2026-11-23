import type { LetBinding } from "@open-intelligent-ui/core/renderer"
import {
  type Child,
  type Component,
  component,
  type ElementVNode,
  fragment,
  h,
  type Listener,
} from "../dom/node"
import { reassert } from "../dom/patch"
import { attributeName, isHandlerName } from "../render/attributes"
import { listenerName } from "../render/dialect"
import { type ElementParts, emptyParts, nativeProp } from "../render/native"
import type { UiSdkElement } from "../registry/ui-sdk.generated"

/** What markup's `let:` is drawn from: the values to hand over, in the order React hands them. */
export type ScopedRender = (values: unknown[]) => Child[]

/**
 * One UI SDK component as the renderer uses it: the custom element that
 * stands for the React component of that name, and how to draw it.
 */
export interface UiSdkComponent {
  name: string
  /** `null` for the few names that have no custom element of their own. */
  spec: UiSdkElement | null
  draw(props: Record<string, unknown>, key: string | undefined, children: Child[]): Child
  scoped(
    props: Record<string, unknown>,
    key: string | undefined,
    lets: LetBinding[],
    render: ScopedRender
  ): Child
}

/** Draws a component differently from the plain mapping, or supplies what its `let:` names. */
export interface Special {
  draw?: UiSdkComponent["draw"]
  scoped?: UiSdkComponent["scoped"]
}

const VOID = new Set(["input", "img"])

/**
 * Options the custom elements read as a CSS selector looked up in the whole
 * page. React takes an element there, which markup cannot name, so these
 * would let a reply reach outside its surface only in this renderer.
 */
const REFUSED = new Set(["container"])

const words = (list: string | undefined): Set<string> => new Set(list ? list.split(" ") : [])

interface Shape {
  options: Set<string>
  live: Set<string>
  events: Set<string>
}

const shapes = new WeakMap<UiSdkElement, Shape>()

function shapeOf(spec: UiSdkElement): Shape {
  let shape = shapes.get(spec)
  if (!shape) {
    shape = { options: words(spec.options), live: words(spec.live), events: words(spec.events) }
    shapes.set(spec, shape)
  }
  return shape
}

/** After an element changed itself, puts back whatever the state it is bound to didn't take. */
function settle(event: Event) {
  const element = event.currentTarget
  if (element instanceof Element) queueMicrotask(() => reassert(element))
}

/**
 * A React-style callback as a listener for the element's event. The custom
 * elements put what React passes as arguments in `detail`: the new value as
 * `detail.value`, with the rest of the details beside it.
 */
function callback(handler: (...args: unknown[]) => unknown): Listener {
  return (event: Event) => {
    const detail = (event as CustomEvent).detail as Record<string, unknown> | null | undefined
    const first = detail && typeof detail === "object" && "value" in detail ? detail.value : detail
    const result = handler(first, detail)
    const wait = detail && typeof detail === "object" ? detail.waitUntil : undefined
    if (typeof wait === "function" && result instanceof Promise) wait.call(detail, result)
    settle(event)
  }
}

/** The DOM event a callback prop is dispatched as: `onValueChange` is `valuechange`. */
function eventName(spec: UiSdkElement, prop: string): string {
  const named = spec.eventNames
  if (named && Object.hasOwn(named, prop)) return named[prop] as string
  return prop.slice(2).toLowerCase()
}

/**
 * Draws a UI SDK custom element from React-shaped props.
 *
 * An option the element declares is assigned as that property, which is how
 * it takes arrays and objects; a value it keeps itself (`value`, `open`) is
 * kept equal to the bound state; a callback becomes a listener for the
 * element's event. Everything else is what React would put on the element
 * the component renders, so it goes on the element the part is bound to:
 * the native `<button>` or `<input>` inside, or the custom element itself.
 */
export function drawElement(
  spec: UiSdkElement,
  props: Record<string, unknown>,
  key: string | number | undefined,
  children: Child
): ElementVNode {
  const shape = shapeOf(spec)
  const outer = emptyParts(key)
  const inner = spec.inner ? emptyParts() : null
  const bound: ElementParts = inner ?? outer
  const boundTag = spec.inner ?? spec.tag

  for (const [name, value] of Object.entries(props)) {
    if (name === "key" || name === "children") continue
    if (shape.events.has(name)) {
      if (typeof value === "function") {
        outer.on[eventName(spec, name)] = callback(value as (...args: unknown[]) => unknown)
      }
      continue
    }
    // React draws no element here, so there is nothing for a class, a style or a listener to be on.
    if (spec.bare && !shape.options.has(name) && !shape.live.has(name)) continue
    if (typeof value === "function" && !shape.options.has(name)) {
      const event = listenerName(name, value)
      if (event) bound.on[event] = value as Listener
      continue
    }
    // An HTML attribute is found in any casing, so a name is judged as the attribute it would be.
    const attribute = attributeName(name)
    if (REFUSED.has(attribute)) continue
    if (shape.live.has(name)) {
      if (value !== undefined) (outer.live ??= {})[name] = value
      continue
    }
    if (shape.options.has(name)) {
      ;(outer.props ??= {})[name] = value
      continue
    }
    // A part finds its root by `for` anywhere in the page, the host's own included.
    if (!spec.root && attribute === "for") continue
    if (isHandlerName(name)) continue
    // The custom element is not a control, so none of its properties are live.
    nativeProp(inner ? boundTag : "", bound, name, value)
  }

  // A value the state holds has to win when the element changed and the state didn't follow.
  for (const name of Object.keys(outer.live ?? {})) {
    const change = `${name.toLowerCase()}change`
    outer.on[change] ??= settle
  }

  // Such a root must make no box either, or it would be a flex or grid item of its own.
  if (spec.bare) outer.style = { display: "contents" }

  if (!inner) return h(spec.tag, outer, children)
  return h(spec.tag, outer, [h(boundTag, inner, VOID.has(boundTag) ? [] : children)])
}

export interface ScopedProps {
  type: UiSdkComponent
  props: Record<string, unknown>
  lets: LetBinding[]
  render: ScopedRender
  /** What the part gives its children, read from the element once it is on the page. */
  read: (element: Element) => unknown[] | null
  /** Draws the children for one reading. By default they are drawn once, from all of it. */
  each?: (values: unknown[], render: ScopedRender) => Child
}

/**
 * A part whose children are drawn from its state (`let:`). The custom
 * element only has its state once it is on the page, so the children come
 * in on the pass after, and again whenever the element or its root changes.
 */
export const Scoped: Component<ScopedProps> = (instance) => {
  let element: Element | null = null
  let values: unknown[] | null = null
  let seen = ""
  let observer: MutationObserver | undefined
  let stop: (() => void) | undefined

  const check = () => {
    if (!element) return
    let next: unknown[] | null = null
    try {
      next = instance.props.read(element)
    } catch {
      next = null
    }
    const signature = sign(next)
    if (signature === seen) return
    seen = signature
    values = next
    instance.invalidate()
  }

  const watch = (target: Element) => {
    element = target
    const root = rootOf(target)
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(check)
      observer.observe(target, { attributes: true })
      if (root && root !== target) observer.observe(root, { attributes: true })
    }
    if (root) {
      const names = [...rootEvents(root)]
      for (const name of names) root.addEventListener(name, check)
      stop = () => {
        for (const name of names) root.removeEventListener(name, check)
      }
    }
    check()
    // An element that isn't defined yet has nothing to read until it is.
    if (!customElements.get(target.localName)) {
      void customElements.whenDefined(target.localName).then(check)
    }
  }

  instance.onUpdated(check)
  instance.onUnmounted(() => {
    observer?.disconnect()
    stop?.()
    element = null
  })

  return () => {
    const { type, props, render, each } = instance.props
    const spec = type.spec as UiSdkElement
    // Never empty: a part with nothing in it is one the element fills with its own text.
    const children = [
      "",
      values === null ? [] : each ? each(values, render) : render(values),
    ]
    const drawn = drawElement(spec, props, undefined, children)
    drawn.hooks = { mounted: watch }
    return drawn
  }
}

function sign(values: unknown): string {
  try {
    return JSON.stringify(values, (_, value) =>
      typeof File !== "undefined" && value instanceof File
        ? `${value.name}:${value.size}:${value.lastModified}`
        : value
    )
  } catch {
    return String(Math.random())
  }
}

const roots = new Map<string, UiSdkElement>()

/** Tells the adapter which custom elements hold a component's state. */
export function registerRoots(elements: Record<string, UiSdkElement>) {
  for (const spec of Object.values(elements)) {
    if (spec.root) roots.set(spec.tag, spec)
  }
}

/** The element holding the state of the component `element` is part of. */
export function rootOf(element: Element): Element | null {
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (roots.has(at.localName)) return at
  }
  return null
}

function rootEvents(root: Element): Set<string> {
  const spec = roots.get(root.localName)
  const names = new Set<string>()
  if (!spec) return names
  for (const name of words(spec.live)) names.add(`${name.toLowerCase()}change`)
  for (const name of words(spec.events)) names.add(eventName(spec, name))
  return names
}

const camel = (name: string) => name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())

/**
 * What a part can say about itself through what the custom elements make
 * public: the values its root keeps (`value`, `open`, `page`), the state
 * they write as `data-*` attributes (`data-disabled`, `data-orientation`),
 * and a range's numbers. React hands the part's own state object, which the
 * elements don't expose, so a field that is neither of these is missing here.
 */
export function publicState(element: Element): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  const root = rootOf(element)
  const spec = root ? roots.get(root.localName) : undefined
  const bound = element.querySelector(":scope > [data-slot]") ?? element
  for (const source of new Set([root, bound, element])) {
    if (!source) continue
    for (const attribute of Array.from(source.attributes)) {
      if (!attribute.name.startsWith("data-") || attribute.name === "data-slot") continue
      if (attribute.name.startsWith("data-iui-")) continue
      state[camel(attribute.name.slice(5))] = attribute.value === "" ? true : attribute.value
    }
  }
  const range = [root, bound].find((source) => source?.hasAttribute("aria-valuemin"))
  if (range) {
    const read = (name: string) => {
      const text = range.getAttribute(name)
      return text === null || text === "" ? null : Number(text)
    }
    const value = read("aria-valuenow")
    const min = read("aria-valuemin") ?? 0
    const max = read("aria-valuemax") ?? 100
    state.value = value
    state.min = min
    state.max = max
    state.percent = value === null || max === min ? null : ((value - min) / (max - min)) * 100
    state.text = range.getAttribute("aria-valuetext") ?? ""
  }
  const text = bound.getAttribute("data-text") !== null ? bound.textContent : null
  if (text !== null && state.text === undefined) state.text = text
  if (root && spec) {
    for (const name of words(spec.live)) {
      state[name] = (root as unknown as Record<string, unknown>)[name]
    }
  }
  return state
}

/** The plain mapping: the element the generator found, drawn from the props as given. */
export function adapt(name: string, spec: UiSdkElement | null, special?: Special): UiSdkComponent {
  const type: UiSdkComponent = {
    name,
    spec,
    draw:
      special?.draw ??
      ((props, key, children) =>
        spec ? drawElement(spec, props, key, children) : fragment(children, key)),
    scoped:
      special?.scoped ??
      ((props, key, lets, render) => {
        if (!spec) return fragment(render([]), key)
        return component(
          Scoped as Component<ScopedProps>,
          { type, props, lets, render, read: (element) => [publicState(element)] },
          key
        )
      }),
  }
  return type
}
