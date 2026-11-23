/**
 * The tree the renderer describes before any of it is DOM. The patcher keeps
 * the page in step with it, so an element that is still wanted is the same
 * element afterwards: it keeps its focus, what was typed into it, where it
 * was scrolled to, and whatever a custom element holds inside.
 */
export type VNode =
  | ElementVNode
  // biome-ignore lint/suspicious/noExplicitAny: a tree holds components of every props type
  | ComponentVNode<any>
  | FragmentVNode
  | TextVNode
  | RawVNode

// biome-ignore lint/suspicious/noExplicitAny: listeners take whichever event they were registered for
export type Listener = (event: any) => unknown

export interface ElementHooks {
  /** Called once the element and everything in it is on the page. */
  mounted?(element: Element): void
  /** Called after every later patch of the element. */
  updated?(element: Element): void
  removed?(element: Element): void
}

export interface ElementVNode {
  kind: "element"
  tag: string
  key: string | number | undefined
  /** Set with `setAttribute`. Nothing here is ever assigned as a property. */
  attrs: Record<string, string>
  /**
   * Assigned as properties, which the caller has to have a reason for: the
   * value of a control, or a property a custom element declares.
   */
  props: Record<string, unknown> | undefined
  /** Properties kept equal to what the tree says however the element changed since. */
  live: Record<string, unknown> | undefined
  style: Record<string, string | number> | undefined
  on: Record<string, Listener> | undefined
  hooks: ElementHooks | undefined
  /**
   * Drawn before all of its markup had arrived. An element that was open is
   * drawn anew, with everything in it, on the first pass in which it isn't.
   */
  open?: boolean
  children: VNode[]
}

export interface TextVNode {
  kind: "text"
  text: string
}

export interface FragmentVNode {
  kind: "fragment"
  key: string | number | undefined
  children: VNode[]
}

/** A node the host application built itself. It is placed, never patched. */
export interface RawVNode {
  kind: "raw"
  key: string | number | undefined
  /** Builds the node the first time, and again whenever `signature` changes. */
  create: () => Node | null
  signature: unknown
}

export interface ComponentVNode<P = Record<string, unknown>> {
  kind: "component"
  type: Component<P>
  key: string | number | undefined
  props: P
  /** As they were given: a component may want to know a child was text. */
  children: Child[]
}

/** What a component is handed when it is set up, and reads from each time it draws. */
export interface Instance<P = Record<string, unknown>> {
  /** The props of the latest render. */
  props: P
  children: Child[]
  /** Whether the component sits inside an `<svg>`, where elements are shapes. */
  svg: boolean
  /** Asks for the component to be drawn again. */
  invalidate(): void
  /** Runs once the component's nodes are on the page. */
  onMounted(work: () => void): void
  /** Runs after each later draw has reached the page. */
  onUpdated(work: () => void): void
  onUnmounted(work: () => void): void
  /**
   * Makes this component the place where a failure below it stops. It is
   * drawn again afterwards, and what it draws then replaces what failed.
   */
  onError(handle: (error: unknown) => void): void
}

/** Sets a component up once and returns what draws it from then on. */
export type Component<P = Record<string, unknown>> = (
  instance: Instance<P>
) => () => Child

export type Child = VNode | string | number | boolean | null | undefined | Child[]

export interface ElementData {
  key?: string | number | undefined
  attrs?: Record<string, string | undefined>
  props?: Record<string, unknown>
  live?: Record<string, unknown>
  style?: Record<string, string | number> | undefined
  on?: Record<string, Listener | undefined>
  hooks?: ElementHooks
}

/** Turns loose children into nodes: lists are flattened, nothing and booleans are dropped. */
export function nodes(children: Child, into: VNode[] = []): VNode[] {
  if (children === null || children === undefined || typeof children === "boolean") return into
  if (Array.isArray(children)) {
    for (const child of children) nodes(child, into)
  } else if (typeof children === "string") {
    into.push({ kind: "text", text: children })
  } else if (typeof children === "number") {
    into.push({ kind: "text", text: String(children) })
  } else {
    into.push(children)
  }
  return into
}

export function h(tag: string, data: ElementData = {}, children: Child = []): ElementVNode {
  const attrs: Record<string, string> = {}
  for (const [name, value] of Object.entries(data.attrs ?? {})) {
    if (value !== undefined) attrs[name] = value
  }
  let on: Record<string, Listener> | undefined
  for (const [name, listener] of Object.entries(data.on ?? {})) {
    if (listener) (on ??= {})[name] = listener
  }
  return {
    kind: "element",
    tag,
    key: data.key,
    attrs,
    props: data.props,
    live: data.live,
    style: data.style,
    on,
    hooks: data.hooks,
    children: nodes(children),
  }
}

export function fragment(children: Child, key?: string | number): FragmentVNode {
  return { kind: "fragment", key, children: nodes(children) }
}

export function component<P>(
  type: Component<P>,
  props: P,
  key?: string | number,
  children: Child[] = []
): ComponentVNode<P> {
  return { kind: "component", type, key, props, children }
}
