import type {
  Child,
  Component,
  ComponentVNode,
  ElementVNode,
  Instance,
  Listener,
  VNode,
} from "./node"
import { nodes } from "./node"

const SVG = "http://www.w3.org/2000/svg"

/** A node of the tree as it stands on the page. */
interface Mounted {
  vnode: VNode
  parent: Mounted | null
  /** The element or text node; null for fragments, components and whatever a host node declined to build. */
  dom: Node | null
  children: Mounted[]
  state: ComponentState | null
  svg: boolean
  /** For a root placed among nodes it doesn't own: the node its own come before. */
  end: Node | null
}

interface ComponentState {
  instance: Instance<never>
  draw: () => Child
  mounted: (() => void)[]
  updated: (() => void)[]
  unmounted: (() => void)[]
  catches: ((error: unknown) => void) | null
  dirty: boolean
  alive: boolean
  depth: number
}

/** What a patch has put on the page so far, so a failure part-way can be undone. */
interface Journal {
  inserted: Node[]
  started: Mounted[]
}

const listeners = new WeakMap<Element, Record<string, Listener>>()
const drawn = new WeakMap<Element, Mounted>()
/** What `setAttribute` takes as a name. Anything else would throw part-way through a patch. */
const ATTRIBUTE_NAME = /^[A-Za-z_:][-\w:.]*$/
/** Nodes this patcher put where they are. One found elsewhere was moved by its owner, a popup to the top layer. */
const placed = new WeakSet<Node>()

let journal: Journal | null = null
let after: (() => void)[] = []
let depth = 0

function sameType(a: VNode, b: VNode): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "element") return a.tag === (b as ElementVNode).tag
  if (a.kind === "component") return a.type === (b as ComponentVNode).type
  return true
}

function keyOf(vnode: VNode, index: number): string {
  const key = vnode.kind === "text" ? undefined : vnode.key
  return key === undefined ? `#${index}` : `k${typeof key}:${key}`
}

function cssName(name: string): string {
  if (name.startsWith("--")) return name
  return name.replace(/^ms(?=[A-Z])/, "-ms").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
}

function setStyle(
  element: HTMLElement | SVGElement,
  before: Record<string, string | number> | undefined,
  next: Record<string, string | number> | undefined
) {
  if (before === next) return
  for (const name of Object.keys(before ?? {})) {
    if (!next || !(name in next)) element.style.removeProperty(cssName(name))
  }
  for (const [name, value] of Object.entries(next ?? {})) {
    if (before?.[name] !== value) element.style.setProperty(cssName(name), String(value))
  }
  if (!element.getAttribute("style")) element.removeAttribute("style")
}

function setAttrs(element: Element, before: Record<string, string>, next: Record<string, string>) {
  for (const name of Object.keys(before)) {
    if (!(name in next)) element.removeAttribute(name)
  }
  for (const [name, value] of Object.entries(next)) {
    if (before[name] !== value && ATTRIBUTE_NAME.test(name)) element.setAttribute(name, value)
  }
}

function setListeners(element: Element, next: Record<string, Listener> | undefined) {
  let current = listeners.get(element)
  if (!current) {
    if (!next) return
    current = {}
    listeners.set(element, current)
  }
  for (const name of Object.keys(current)) {
    if (!next || !(name in next)) delete current[name]
  }
  for (const [name, listener] of Object.entries(next ?? {})) {
    // One real listener per event stays for the element's life and calls whichever handler is current.
    if (!(name in current)) {
      const table = current
      const [type, phase] = name.split("@")
      element.addEventListener(type as string, (event) => table[name]?.(event), phase === "capture")
    }
    current[name] = listener
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** Sets a control's value the way a person's typing left room for: `1.` stays while the number is still 1. */
function setLive(element: Element, name: string, value: unknown) {
  const target = element as unknown as Record<string, unknown>
  if (element instanceof HTMLInputElement && name === "value") {
    const text = value === null || value === undefined ? "" : String(value)
    if (element.value === text) return
    const numeric = element.type === "number" || element.type === "range"
    if (numeric && element.value !== "" && text !== "" && Number(element.value) === Number(text)) return
    element.value = text
    return
  }
  if (
    (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) &&
    name === "value"
  ) {
    const text = value === null || value === undefined ? "" : String(value)
    if (element.value !== text) element.value = text
    return
  }
  if (!sameValue(target[name], value)) target[name] = value
}

function setProps(
  element: Element,
  before: Record<string, unknown> | undefined,
  next: Record<string, unknown> | undefined
) {
  const target = element as unknown as Record<string, unknown>
  for (const name of Object.keys(before ?? {})) {
    if (!next || !(name in next)) target[name] = undefined
  }
  for (const [name, value] of Object.entries(next ?? {})) {
    if (!before || !(name in before) || !sameValue(before[name], value)) target[name] = value
  }
}

function applyElement(element: Element, before: ElementVNode | null, next: ElementVNode) {
  setAttrs(element, before?.attrs ?? {}, next.attrs)
  setStyle(element as HTMLElement, before?.style, next.style)
  setListeners(element, next.on)
  setProps(element, before?.props, next.props)
}

function applyLive(element: Element, vnode: ElementVNode) {
  for (const [name, value] of Object.entries(vnode.live ?? {})) setLive(element, name, value)
}

/**
 * Puts the properties the tree keeps in step back to what it says. An element
 * that changed itself in answer to the user calls for this when the state it
 * is bound to turned the change down.
 */
export function reassert(element: Element) {
  const mounted = drawn.get(element)
  if (mounted?.vnode.kind === "element") applyLive(element, mounted.vnode)
}

/** Where an element's children go: a template keeps its own apart from the page. */
function insideOf(element: Element): Node {
  return element instanceof HTMLTemplateElement ? element.content : element
}

function record(node: Node) {
  journal?.inserted.push(node)
}

function create(vnode: VNode, parent: Mounted | null, svg: boolean): Mounted {
  const mounted: Mounted = { vnode, parent, dom: null, children: [], state: null, svg, end: null }
  switch (vnode.kind) {
    case "text":
      mounted.dom = document.createTextNode(vnode.text)
      break
    case "raw":
      mounted.dom = vnode.create()
      break
    case "element": {
      const inside = svg || vnode.tag === "svg"
      const element = inside
        ? document.createElementNS(SVG, vnode.tag)
        : document.createElement(vnode.tag)
      mounted.dom = element
      mounted.svg = inside
      drawn.set(element, mounted)
      applyElement(element, null, vnode)
      const below = inside && vnode.tag !== "foreignObject"
      mounted.children = vnode.children.map((child) => create(child, mounted, below))
      const into = insideOf(element)
      for (const node of domOf(mounted.children)) {
        into.appendChild(node)
        placed.add(node)
      }
      // A select can only take a value once its options are in it.
      applyLive(element, vnode)
      const { hooks } = vnode
      if (hooks?.mounted) after.push(() => hooks.mounted?.(element))
      break
    }
    case "fragment":
      mounted.children = vnode.children.map((child) => create(child, mounted, svg))
      break
    case "component":
      setup(mounted, vnode)
      break
  }
  return mounted
}

function setup(mounted: Mounted, vnode: ComponentVNode) {
  const state: ComponentState = {
    instance: null as unknown as Instance<never>,
    draw: () => null,
    mounted: [],
    updated: [],
    unmounted: [],
    catches: null,
    dirty: false,
    alive: true,
    depth: depthOf(mounted),
  }
  const instance: Instance = {
    props: vnode.props as Record<string, unknown>,
    children: vnode.children,
    svg: mounted.svg,
    invalidate: () => invalidate(mounted),
    onMounted: (work) => state.mounted.push(work),
    onUpdated: (work) => state.updated.push(work),
    onUnmounted: (work) => state.unmounted.push(work),
    onError: (handle) => {
      state.catches = handle
    },
  }
  state.instance = instance as Instance<never>
  mounted.state = state
  journal?.started.push(mounted)
  state.draw = (vnode.type as Component)(instance)
  const draw = () => {
    mounted.children = nodes(state.draw()).map((child) => create(child, mounted, mounted.svg))
  }
  if (state.catches) contain(mounted, draw)
  else draw()
  after.push(() => {
    if (state.alive) for (const work of state.mounted) work()
  })
}

function depthOf(mounted: Mounted): number {
  let count = 0
  for (let at = mounted.parent; at; at = at.parent) count++
  return count
}

/** The DOM nodes a list of mounted nodes stands for, in order. */
function domOf(list: Mounted[], into: Node[] = []): Node[] {
  for (const mounted of list) {
    if (mounted.dom) into.push(mounted.dom)
    else domOf(mounted.children, into)
  }
  return into
}

function teardown(mounted: Mounted) {
  for (const child of mounted.children) teardown(child)
  const { state, vnode } = mounted
  if (state) {
    state.alive = false
    for (const work of state.unmounted) {
      try {
        work()
      } catch (error) {
        console.error(error)
      }
    }
  }
  if (vnode.kind === "element" && vnode.hooks?.removed && mounted.dom) {
    try {
      vnode.hooks.removed(mounted.dom as Element)
    } catch (error) {
      console.error(error)
    }
  }
}

function remove(mounted: Mounted) {
  teardown(mounted)
  for (const node of domOf([mounted])) node.parentNode?.removeChild(node)
}

/** Names each child of a list. Two children given the same key are told apart by their turn. */
function namer(): (vnode: VNode, index: number) => string {
  const seen = new Map<string, number>()
  return (vnode, index) => {
    const key = keyOf(vnode, index)
    const count = seen.get(key) ?? 0
    seen.set(key, count + 1)
    return count ? `${key}~${count}` : key
  }
}

function reconcile(parent: Mounted, before: Mounted[], next: VNode[], svg: boolean): Mounted[] {
  const old = new Map<string, Mounted>()
  const nameOld = namer()
  before.forEach((mounted, index) => {
    old.set(nameOld(mounted.vnode, index), mounted)
  })
  const nameNext = namer()
  const result = next.map((vnode, index) => {
    const key = nameNext(vnode, index)
    const match = old.get(key)
    const same = match && sameType(match.vnode, vnode)
    if (match && same && !closed(match.vnode, vnode)) {
      old.delete(key)
      return update(match, vnode)
    }
    const fresh = create(vnode, parent, svg)
    if (match) takePlace(fresh, match)
    if (match && same) handOver(match, fresh)
    return fresh
  })
  for (const leftover of old.values()) remove(leftover)
  return result
}

/**
 * Whether an element was drawn while its markup was still arriving and is now
 * whole. A custom element reads what is in it when it joins the page, and not
 * every one of them keeps up with what joins it later, so a streamed element
 * could end up unlike the same element drawn in one go. Drawing it once more
 * when its last piece is in makes the two the same.
 */
function closed(before: VNode, next: VNode): boolean {
  return before.kind === "element" && before.open === true && (next as ElementVNode).open !== true
}

/**
 * Hands over what a person would notice missing when an element is drawn
 * anew: where the focus is, with what was typed there and what is selected,
 * and animations that had already run.
 */
function handOver(stale: Mounted, fresh: Mounted) {
  const from = stale.dom
  const to = fresh.dom
  if (!(from instanceof Element) || !(to instanceof Element)) return
  if (typeof to.getAnimations === "function") {
    for (const animation of to.getAnimations({ subtree: true })) {
      if (animation.effect?.getComputedTiming().endTime === Infinity) continue
      try {
        animation.finish()
      } catch {
        // An animation that can't be finished is left to run.
      }
    }
  }
  const active = from.ownerDocument.activeElement
  if (!active || active === from || !from.contains(active)) return
  const path: number[] = []
  for (let at: Element = active; at !== from; at = at.parentElement as Element) {
    path.unshift(Array.prototype.indexOf.call((at.parentElement as Element).children, at))
  }
  let target: Element | undefined = to
  for (const index of path) target = target?.children[index]
  if (!(target instanceof HTMLElement) || target.localName !== active.localName) return
  const typed = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  if (typed && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    target.value = active.value
    target.focus({ preventScroll: true })
    try {
      target.setSelectionRange(active.selectionStart, active.selectionEnd, active.selectionDirection ?? undefined)
    } catch {
      // Not every kind of input has a selection.
    }
    return
  }
  target.focus({ preventScroll: true })
}

/** Puts a node's DOM where the one it replaces stands, which may be among nodes that aren't the patcher's. */
function takePlace(fresh: Mounted, stale: Mounted) {
  const anchor = domOf([stale])[0]
  const parent = anchor?.parentNode
  if (!anchor || !parent || !placed.has(anchor)) return
  for (const node of domOf([fresh])) {
    parent.insertBefore(node, anchor)
    placed.add(node)
    record(node)
  }
}

function update(mounted: Mounted, vnode: VNode): Mounted {
  const before = mounted.vnode
  mounted.vnode = vnode
  switch (vnode.kind) {
    case "text":
      if ((before as typeof vnode).text !== vnode.text) (mounted.dom as Text).data = vnode.text
      break
    case "raw":
      if (!sameValue((before as typeof vnode).signature, vnode.signature)) {
        const stale = mounted.dom
        mounted.dom = vnode.create()
        stale?.parentNode?.removeChild(stale)
      }
      break
    case "element": {
      const element = mounted.dom as Element
      applyElement(element, before as ElementVNode, vnode)
      const below = mounted.svg && vnode.tag !== "foreignObject"
      mounted.children = reconcile(mounted, mounted.children, vnode.children, below)
      place(insideOf(element), mounted.children)
      applyLive(element, vnode)
      const { hooks } = vnode
      if (hooks?.updated) after.push(() => hooks.updated?.(element))
      break
    }
    case "fragment":
      mounted.children = reconcile(mounted, mounted.children, vnode.children, mounted.svg)
      break
    case "component": {
      const state = mounted.state as ComponentState
      state.instance.props = vnode.props as never
      state.instance.children = vnode.children
      redraw(mounted)
      break
    }
  }
  return mounted
}

function redraw(mounted: Mounted) {
  const state = mounted.state as ComponentState
  state.dirty = false
  const draw = () => {
    mounted.children = reconcile(mounted, mounted.children, nodes(state.draw()), mounted.svg)
  }
  if (state.catches) contain(mounted, draw)
  else draw()
  after.push(() => {
    if (state.alive) for (const work of state.updated) work()
  })
}

let reports: { error: unknown }[] | null = null

function report(event: ErrorEvent) {
  if (!reports) return
  reports.push({ error: event.error ?? new Error(event.message) })
  event.preventDefault()
}

/**
 * A custom element that fails in one of its own callbacks doesn't throw at
 * whoever put it on the page: the browser reports the error to the window.
 * While `work` runs those reports can only come from what it draws, so the
 * first of them is thrown once it's done.
 */
function reported(work: () => void) {
  const view = typeof window === "undefined" ? null : window
  const outer = reports
  const own: { error: unknown }[] = []
  reports = own
  if (!outer) view?.addEventListener("error", report)
  try {
    work()
  } finally {
    reports = outer
    if (!outer) view?.removeEventListener("error", report)
  }
  if (own[0]) {
    aftermath(view)
    throw own[0].error
  }
}

/**
 * An element that failed can have left work queued that fails in turn, after
 * it's off the page. That is the same failure, so it's heard here until the
 * work queued so far has run, rather than reaching the page as a second one.
 */
function aftermath(view: Window | null) {
  if (!view) return
  const hear = (event: ErrorEvent) => event.preventDefault()
  view.addEventListener("error", hear)
  queueMicrotask(() => view.removeEventListener("error", hear))
}

/**
 * Runs `work` for a component that catches failures. If it throws, whatever
 * the component had on the page or had begun to put there is taken away, the
 * component is told, and it draws again.
 */
function contain(mounted: Mounted, work: () => void) {
  const state = mounted.state as ComponentState
  const outer = journal
  const own: Journal = { inserted: [], started: [] }
  journal = own
  try {
    reported(work)
  } catch (error) {
    discard(mounted, own)
    journal = outer
    state.catches?.(error)
    mounted.children = nodes(state.draw()).map((child) => create(child, mounted, mounted.svg))
    return
  } finally {
    journal = outer
  }
  if (outer) {
    outer.inserted.push(...own.inserted)
    outer.started.push(...own.started)
  }
}

function discard(mounted: Mounted, own: Journal) {
  for (const child of mounted.children) teardown(child)
  for (const begun of own.started) {
    if (begun === mounted || !begun.state?.alive) continue
    begun.state.alive = false
    for (const work of begun.state.unmounted) {
      try {
        work()
      } catch (error) {
        console.error(error)
      }
    }
  }
  for (const node of [...domOf(mounted.children), ...own.inserted]) {
    node.parentNode?.removeChild(node)
  }
  mounted.children = []
}

/**
 * Puts `parent`'s nodes in the order the tree wants them, moving as few as
 * it can: a node that is moved loses its focus and scroll position, and a
 * custom element is told it left the page. Nodes the patcher doesn't know,
 * which a custom element added for itself, stay where they are.
 */
function place(parent: Node, children: Mounted[], end: Node | null = null) {
  const wanted = domOf(children)
  const ours = new Set(wanted)
  let pointer = parent.firstChild
  let last: Node | null = null
  for (const node of wanted) {
    if (node.parentNode !== parent && placed.has(node) && node.parentNode) continue
    while (pointer && pointer !== end && !ours.has(pointer)) pointer = pointer.nextSibling
    if (node === pointer) {
      pointer = pointer.nextSibling
      last = node
      continue
    }
    // Next to the one before it, so what a custom element appended for itself stays last.
    const before: Node | null = last ? last.nextSibling : (pointer ?? end)
    if (before !== node) {
      const catcher = arrive(parent, node, before)
      if (catcher) {
        place(parent, children, end)
        return
      }
    }
    if (pointer === node) pointer = node.nextSibling
    last = node
    placed.add(node)
    record(node)
  }
}

/**
 * Puts a node among its siblings. This is where a custom element first meets
 * the page, so one that fails on arrival is a failure of the component around
 * it that catches them, which is returned once it has drawn again.
 *
 * When the node arrives with such components inside it, as a whole surface
 * does the first time, the report doesn't say which of them failed. The node
 * is then taken off again and put back without them, and they follow one at a
 * time.
 */
function arrive(parent: Node, node: Node, before: Node | null): Mounted | null {
  if (reports || !parent.isConnected) {
    parent.insertBefore(node, before)
    return null
  }
  try {
    reported(() => parent.insertBefore(node, before))
    return null
  } catch (error) {
    const mounted = drawn.get(node as Element)
    let around = mounted ?? null
    while (around && !around.state?.catches) around = around.parent
    if (around) {
      fail(around, error)
      return around
    }
    const inside = mounted ? catchersIn(mounted) : []
    if (inside.length === 0) {
      console.error(error)
      return null
    }
    parent.removeChild(node)
    const held = inside.map((catcher) => {
      const own = domOf(catcher.children)
      const marker = document.createComment("")
      own[0]?.parentNode?.insertBefore(marker, own[0])
      for (const dom of own) dom.parentNode?.removeChild(dom)
      return { catcher, own, marker }
    })
    try {
      reported(() => parent.insertBefore(node, before))
    } catch (outside) {
      console.error(outside)
    }
    for (const { catcher, own, marker } of held) {
      const put = (list: Node[]) => {
        for (const dom of list) marker.parentNode?.insertBefore(dom, marker)
      }
      try {
        reported(() => put(own))
      } catch (failure) {
        fail(catcher, failure)
        const drawnAgain = domOf(catcher.children)
        put(drawnAgain)
        for (const dom of drawnAgain) placed.add(dom)
      }
      marker.parentNode?.removeChild(marker)
    }
    return null
  }
}

/** The components under a node that catch failures, not looking inside one. */
function catchersIn(mounted: Mounted, into: Mounted[] = []): Mounted[] {
  for (const child of mounted.children) {
    if (child.state?.catches) into.push(child)
    else catchersIn(child, into)
  }
  return into
}

function fail(catcher: Mounted, error: unknown) {
  const state = catcher.state as ComponentState
  discard(catcher, { inserted: [], started: [] })
  state.catches?.(error)
  catcher.children = nodes(state.draw()).map((child) => create(child, catcher, catcher.svg))
}

/** The element whose children a mounted node's DOM sits among. */
function containerOf(mounted: Mounted): Mounted {
  let at = mounted.parent
  while (at && !(at.vnode.kind === "element" || at.parent === null)) at = at.parent
  return at as Mounted
}

const queue = new Set<Mounted>()
let scheduled = false
const roots = new Set<Root>()

function invalidate(mounted: Mounted) {
  const state = mounted.state
  if (!state?.alive) return
  state.dirty = true
  queue.add(mounted)
  schedule()
}

function schedule() {
  if (scheduled) return
  scheduled = true
  queueMicrotask(() => {
    scheduled = false
    flush()
  })
}

/** Runs what was put off: surfaces that asked to be drawn again, then components that did. */
export function flush() {
  for (const root of [...roots]) {
    if (root.pending) root.run()
  }
  while (queue.size) {
    const batch = [...queue].sort(
      (a, b) => (a.state as ComponentState).depth - (b.state as ComponentState).depth
    )
    queue.clear()
    for (const mounted of batch) {
      const state = mounted.state as ComponentState
      if (!state.alive || !state.dirty) continue
      try {
        perform(() => {
          const drawn = within(mounted, () => redraw(mounted))
          const container = containerOf(drawn)
          if (container.dom) {
            const into = container.parent ? insideOf(container.dom as Element) : container.dom
            place(into, container.children, container.end)
          }
        })
      } catch (error) {
        console.error(error)
      }
    }
  }
}

/**
 * Runs a component's own redraw so a failure reaches the nearest component
 * that catches them. Returns the component whose nodes changed.
 */
function within(mounted: Mounted, work: () => void): Mounted {
  let catcher = mounted.parent
  while (catcher && !catcher.state?.catches) catcher = catcher.parent
  if (!catcher || mounted.state?.catches) {
    work()
    return mounted
  }
  const state = catcher.state as ComponentState
  const outer = journal
  const own: Journal = { inserted: [], started: [] }
  journal = own
  try {
    reported(work)
  } catch (error) {
    discard(catcher, own)
    state.catches?.(error)
    const failed = catcher
    failed.children = nodes(state.draw()).map((child) => create(child, failed, failed.svg))
    return failed
  } finally {
    journal = outer
  }
  return mounted
}

function perform(work: () => void) {
  depth++
  try {
    work()
  } finally {
    depth--
    if (depth === 0) {
      const callbacks = after
      after = []
      for (const callback of callbacks) {
        try {
          callback()
        } catch (error) {
          console.error(error)
        }
      }
    }
  }
}

/** A tree kept on the page inside one element. */
export interface Root {
  /** Draws `children` now. */
  render(children: Child): void
  /** Asks for `draw` to be called and its result drawn before the next task. */
  schedule(draw: () => Child): void
  /**
   * Says where the tree's nodes live now, when something else moved them:
   * the element they are in, and the node of that element they come before.
   */
  moveTo(container: Node, end: Node | null): void
  /** The tree's top-level DOM nodes, in order. */
  nodes(): Node[]
  pending: boolean
  run(): void
  unmount(): void
}

export function createRoot(container: Node, end: Node | null = null, svg = false): Root {
  const top: Mounted = {
    vnode: { kind: "fragment", key: undefined, children: [] },
    parent: null,
    dom: container,
    children: [],
    state: null,
    svg,
    end,
  }
  let waiting: (() => Child) | null = null
  const root: Root = {
    pending: false,
    render(children) {
      waiting = null
      root.pending = false
      perform(() => {
        top.children = reconcile(top, top.children, nodes(children), svg)
        place(top.dom as Node, top.children, top.end)
      })
    },
    moveTo(next, before) {
      top.dom = next
      top.end = before
    },
    nodes: () => domOf(top.children),
    schedule(draw) {
      waiting = draw
      root.pending = true
      schedule()
    },
    run() {
      const draw = waiting
      if (draw) root.render(draw())
    },
    unmount() {
      roots.delete(root)
      waiting = null
      root.pending = false
      for (const child of top.children) remove(child)
      top.children = []
    },
  }
  roots.add(root)
  return root
}
