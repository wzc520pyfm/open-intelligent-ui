import { exitAnimations, lazyRecord } from "@open-intelligent-ui/core/renderer"
import { insert } from "@solidjs/web"
import {
  createComponent,
  createRenderEffect,
  createRoot,
  createSignal,
  Errored,
  getOwner,
  type Owner,
  onCleanup,
  runWithOwner,
  untrack,
} from "solid-js"
import { type Bag, createBag } from "./bag"
import {
  type Applied,
  applyProps,
  createElement,
  cssName,
  nothingApplied,
  type Space,
  settle,
} from "./dom"
import {
  type BoundaryNode,
  type ComponentNode,
  type Described,
  type ElementNode,
  element,
  type ForeignNode,
  type FragmentNode,
  type Node,
  type PresenceNode,
  type WidgetNode,
} from "./node"
import { fromView } from "./view"
import type { Draw } from "./widget"

const WRITABLE = { ownedWrite: true }

/** Where something is mounted: who owns its effects, and which kind of element it makes. */
export interface Place {
  owner: Owner | null
  space: Space
}

type Item = Described | string

/** Something on screen that can be changed to fit a new description of itself. */
interface Mounted {
  /** Whether it can become `next` in place. If not, it is replaced. */
  fits(next: Item): boolean
  patch(next: Item): void
  /** Adds what it puts in the DOM: nodes, or what Solid resolves to nodes. */
  collect(into: unknown[]): void
  dispose(): void
}

interface Entry {
  key: string
  item: Item
}

function flatten(nodes: Node[], prefix: string, into: Entry[]): void {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (node === null || node === undefined || typeof node === "boolean") continue
    if (Array.isArray(node)) flatten(node, `${prefix}${index}/`, into)
    else if (typeof node === "object") {
      const key = node.key === undefined || node.key === null ? `#${index}` : `$${node.key}`
      into.push({ key: prefix + key, item: node })
    } else {
      into.push({ key: `${prefix}#${index}`, item: String(node) })
    }
  }
}

/**
 * The children of one element or slot, kept in step with their description.
 * A child is matched to its description by key; one that matches is changed
 * in place, so its DOM, its focus and whatever a component remembers stay.
 */
export class Children {
  private mounted: Mounted[] = []
  private keyed = new Map<string, Mounted>()
  private readonly changed = createSignal(0, WRITABLE)
  private gone = false

  constructor(private readonly place: Place) {}

  /** The nodes to show, in order. Solid reads this again whenever the list changes. */
  readonly read = (): unknown[] => {
    this.changed[0]()
    const out: unknown[] = []
    for (const child of this.mounted) child.collect(out)
    return out
  }

  patch(nodes: Node[]): void {
    if (this.gone) return
    const entries: Entry[] = []
    flatten(nodes, "", entries)
    const before = this.mounted
    const old = this.keyed
    const next: Mounted[] = []
    const keyed = new Map<string, Mounted>()
    let moved = before.length !== entries.length
    try {
      runWithOwner(this.place.owner, () =>
        untrack(() => {
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index] as Entry
            let key = entry.key
            while (keyed.has(key)) key += "'"
            let child = old.get(key)
            if (child?.fits(entry.item)) {
              old.delete(key)
              child.patch(entry.item)
            } else {
              child = mount(entry.item, this.place)
            }
            if (before[index] !== child) moved = true
            next.push(child)
            keyed.set(key, child)
          }
        })
      )
    } catch (error) {
      // Half a list is worse than none: the boundary above shows the error.
      for (const child of new Set([...before, ...next])) child.dispose()
      this.mounted = []
      this.keyed = new Map()
      this.changed[1]((count) => count + 1)
      throw error
    }
    for (const child of old.values()) child.dispose()
    this.mounted = next
    this.keyed = keyed
    if (moved || old.size) this.changed[1]((count) => count + 1)
  }

  dispose(): void {
    if (this.gone) return
    this.gone = true
    for (const child of this.mounted) child.dispose()
    this.mounted = []
    this.keyed.clear()
  }
}

class TextMount implements Mounted {
  private readonly node: Text

  constructor(text: string) {
    this.node = document.createTextNode(text)
  }

  fits(next: Item): boolean {
    return typeof next === "string"
  }

  patch(next: Item): void {
    if (this.node.data !== next) this.node.data = next as string
  }

  collect(into: unknown[]): void {
    into.push(this.node)
  }

  dispose(): void {}
}

class ElementMount implements Mounted {
  readonly element: Element
  private readonly tag: string
  private readonly own: boolean
  private readonly applied: Applied = nothingApplied()
  private readonly inner: Space
  private children: Children | null = null
  private stop: (() => void) | undefined

  constructor(
    node: ElementNode,
    private readonly place: Place
  ) {
    this.tag = node.tag
    this.own = node.own
    const space = node.tag === "svg" ? "svg" : node.tag === "math" ? "math" : place.space
    this.inner = node.tag === "foreignObject" ? "html" : space
    this.element = createElement(node.tag, space)
    this.patch(node)
  }

  fits(next: Item): boolean {
    return (
      typeof next !== "string" &&
      next.kind === "element" &&
      next.tag === this.tag &&
      next.own === this.own
    )
  }

  patch(next: Item): void {
    const node = next as ElementNode
    applyProps(this.element, this.applied, node.props, this.own)
    if (this.children) this.children.patch(node.children ?? [])
    else if (node.children?.length) this.fill(node.children)
    settle(this.element, node.props)
  }

  private fill(nodes: Node[]): void {
    runWithOwner(this.place.owner, () =>
      createRoot((dispose) => {
        this.stop = dispose
        const children = new Children({ owner: getOwner(), space: this.inner })
        this.children = children
        children.patch(nodes)
        // Handed over as a function, so the effect that reads it is one Solid
        // makes for that purpose and owns nothing of ours.
        insert(this.element, () => children.read)
      })
    )
  }

  collect(into: unknown[]): void {
    into.push(this.element)
  }

  dispose(): void {
    this.children?.dispose()
    this.stop?.()
  }
}

class FragmentMount implements Mounted {
  private readonly children: Children

  constructor(node: FragmentNode, place: Place) {
    this.children = new Children(place)
    this.children.patch(node.children)
  }

  fits(next: Item): boolean {
    return typeof next !== "string" && next.kind === "fragment"
  }

  patch(next: Item): void {
    this.children.patch((next as FragmentNode).children)
  }

  collect(into: unknown[]): void {
    for (const node of this.children.read()) into.push(node)
  }

  dispose(): void {
    this.children.dispose()
  }
}

class ForeignMount implements Mounted {
  constructor(private readonly node: ForeignNode) {}

  fits(next: Item): boolean {
    return typeof next !== "string" && next.kind === "foreign" && next.value === this.node.value
  }

  patch(): void {}

  collect(into: unknown[]): void {
    into.push(this.node.value)
  }

  dispose(): void {}
}

/** One of the renderer's own primitives or presets, drawn from its view. */
class WidgetMount implements Mounted {
  private readonly children: Children
  private readonly draw: Draw
  private readonly cleanups: (() => void)[] = []
  private node: WidgetNode
  private gone = false

  constructor(node: WidgetNode, place: Place) {
    this.node = node
    this.children = new Children(place)
    this.draw = node.widget({
      redraw: () => {
        if (!this.gone) this.render()
      },
      cleanup: (work) => {
        this.cleanups.push(work)
      },
    })
    this.render()
  }

  fits(next: Item): boolean {
    return typeof next !== "string" && next.kind === "widget" && next.widget === this.node.widget
  }

  patch(next: Item): void {
    this.node = next as WidgetNode
    this.render()
  }

  private render(): void {
    const { props, children } = this.node
    this.children.patch([fromView(this.draw(props, children.length ? children : undefined))])
  }

  collect(into: unknown[]): void {
    for (const node of this.children.read()) into.push(node)
  }

  dispose(): void {
    if (this.gone) return
    this.gone = true
    for (const work of this.cleanups) work()
    this.children.dispose()
  }
}

/**
 * State a UI SDK part hands its children knows a field only when asked for
 * it, and listens for changes to the fields that were asked for. It has to
 * be read as the markup reads it, not copied.
 */
function readable(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value
  if (Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length) return value
  const state = value as Record<string, unknown>
  return lazyRecord((name) => state[name])
}

/**
 * Names that would reach a DOM property or the element itself. A Solid
 * component hands the props it doesn't know to its element, and there Solid
 * sets `prop:x` as the property `x`, sets `textContent` and its kin as
 * properties, and calls `ref` with the element.
 */
const WITHHELD = new Set(["ref", "children", "innerHTML", "outerHTML", "textContent", "innerText"])

/** What a component is given: markup's props without the ones in `WITHHELD`. */
function componentProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (WITHHELD.has(name) || name.includes(":")) continue
    // Set as an attribute, text under an `on` name would be an inline handler.
    if (/^on/i.test(name) && typeof value !== "function") continue
    if (name === "style" && value !== null && typeof value === "object") {
      // Solid sets a style map with `setProperty`, which takes CSS's own names.
      const style: Record<string, unknown> = {}
      for (const [property, text] of Object.entries(value)) style[cssName(property)] = text
      out.style = style
      continue
    }
    out[name] = value
  }
  return out
}

/** The children of a component, in one of the places it put them. */
class Slot {
  children: Children | null = null
  gone = false

  constructor(
    private readonly place: Place,
    private readonly nodes: () => Node[]
  ) {}

  /** Mounts on the first read, so a component that only asks whether it has children mounts nothing. */
  readonly read = (): unknown[] => {
    if (this.gone) return []
    if (!this.children) {
      this.children = new Children(this.place)
      this.children.patch(this.nodes())
    }
    return this.children.read()
  }

  patch(nodes: Node[]): void {
    this.children?.patch(nodes)
  }

  dispose(): void {
    this.gone = true
    this.children?.dispose()
  }
}

class ComponentMount implements Mounted {
  private node: ComponentNode
  private readonly bag: Bag
  private readonly slots = new Set<Slot>()
  private readonly filled = createSignal(false, WRITABLE)
  private readonly drawn = createSignal(0, WRITABLE)
  private output: unknown
  private stop: (() => void) | undefined

  constructor(
    node: ComponentNode,
    private readonly place: Place
  ) {
    this.node = node
    this.filled[1](this.hasChildren(node))
    this.bag = createBag(componentProps(node.props), { children: () => this.readChildren() })
    runWithOwner(place.owner, () =>
      createRoot((dispose) => {
        this.stop = dispose
        this.output = createComponent(node.type, this.bag.props)
      })
    )
  }

  private hasChildren(node: ComponentNode): boolean {
    return node.scoped !== undefined || node.children.length > 0
  }

  /**
   * What the component reads as `children`. Whoever reads it owns what is
   * mounted there, as with children written in JSX: read again by a new
   * owner, they are mounted again.
   */
  private readChildren(): unknown {
    if (!this.filled[0]()) return undefined
    if (this.node.scoped) return this.scopedChildren
    const slot = new Slot({ owner: getOwner(), space: this.place.space }, () => this.node.children)
    this.slots.add(slot)
    if (getOwner()) {
      onCleanup(() => {
        this.slots.delete(slot)
        slot.dispose()
      })
    }
    return slot.read
  }

  /** Children that read what the component hands them, which is how `let:` works. */
  private readonly scopedChildren = (first: unknown, ...rest: unknown[]): unknown => {
    const given = [first, ...rest].map(readable)
    const children = new Children({ owner: getOwner(), space: this.place.space })
    if (getOwner()) onCleanup(() => children.dispose())
    createRenderEffect(
      () => {
        this.drawn[0]()
        const scoped = this.node.scoped
        const nodes: Node[] = scoped
          ? scoped.render(scoped.lets.map((_, index) => given[index]))
          : []
        return nodes
      },
      (nodes) => children.patch(nodes)
    )
    return children.read
  }

  fits(next: Item): boolean {
    return (
      typeof next !== "string" &&
      next.kind === "component" &&
      next.type === this.node.type &&
      (next.scoped === undefined) === (this.node.scoped === undefined)
    )
  }

  patch(next: Item): void {
    const node = next as ComponentNode
    this.node = node
    this.bag.update(componentProps(node.props))
    this.filled[1](this.hasChildren(node))
    if (node.scoped) this.drawn[1]((count) => count + 1)
    else for (const slot of this.slots) slot.patch(node.children)
  }

  collect(into: unknown[]): void {
    into.push(this.output)
  }

  dispose(): void {
    for (const slot of this.slots) slot.dispose()
    this.slots.clear()
    this.stop?.()
  }
}

/** Keeps its child on screen while the exit animation plays. */
class PresenceMount implements Mounted {
  private wrapper: ElementMount | null = null
  private exiting = false
  private run = 0
  private readonly changed = createSignal(0, WRITABLE)

  constructor(
    node: PresenceNode,
    private readonly place: Place
  ) {
    if (node.show) this.wrapper = new ElementMount(this.wrap(node), place)
  }

  private wrap(node: PresenceNode): ElementNode {
    return element(
      "span",
      { class: "iui-presence", "data-iui-exit": this.exiting ? "" : undefined },
      [node.child]
    )
  }

  fits(next: Item): boolean {
    return typeof next !== "string" && next.kind === "presence"
  }

  patch(next: Item): void {
    const node = next as PresenceNode
    if (node.show) {
      this.run++
      this.exiting = false
      if (this.wrapper) this.wrapper.patch(this.wrap(node))
      else {
        this.wrapper = new ElementMount(this.wrap(node), this.place)
        this.changed[1]((count) => count + 1)
      }
      return
    }
    if (!this.wrapper) return
    const leaving = !this.exiting
    this.exiting = true
    this.wrapper.patch(this.wrap(node))
    if (!leaving) return
    const mine = ++this.run
    const done = () => {
      if (this.run !== mine) return
      this.wrapper?.dispose()
      this.wrapper = null
      this.exiting = false
      this.changed[1]((count) => count + 1)
    }
    // The exit styles have to be applied before their animations exist.
    queueMicrotask(() => {
      if (this.run !== mine) return
      const exit = exitAnimations(this.wrapper?.element ?? null)
      if (exit) void exit.then(done)
      else done()
    })
  }

  collect(into: unknown[]): void {
    this.changed[0]()
    if (this.wrapper) into.push(this.wrapper.element)
  }

  dispose(): void {
    this.run++
    this.wrapper?.dispose()
    this.wrapper = null
  }
}

function failure(error: unknown, quiet: boolean): Element {
  if (quiet) {
    const pending = document.createElement("span")
    pending.className = "iui-pending"
    pending.setAttribute("aria-hidden", "true")
    return pending
  }
  const note = document.createElement("div")
  note.className = "iui-error"
  note.setAttribute("role", "note")
  const title = note.appendChild(document.createElement("strong"))
  title.textContent = "This part couldn't be shown."
  const message = note.appendChild(document.createElement("span"))
  message.textContent = error instanceof Error ? error.message : String(error)
  return note
}

/**
 * Catches a block that fails to render, so one bad component doesn't take
 * down the rest of the surface. What fails while the renderer mounts or
 * changes the block is caught here; what fails later, inside a component's
 * own effects, is caught by Solid's boundary.
 */
class BoundaryMount implements Mounted {
  private node: BoundaryNode
  private inner: ComponentMount | null = null
  private failed: { error: unknown } | null = null
  private caught = false
  private shown: { quiet: boolean; element: Element } | undefined
  private readonly changed = createSignal(0, WRITABLE)
  private readonly quiet = createSignal(false, WRITABLE)

  constructor(
    node: BoundaryNode,
    private readonly place: Place
  ) {
    this.node = node
    this.quiet[1](node.quiet)
    this.start()
  }

  private start(): void {
    this.caught = false
    this.failed = null
    this.shown = undefined
    try {
      this.inner = new ComponentMount(this.guarded(this.node), this.place)
    } catch (error) {
      this.fail(error)
    }
  }

  /** One function for the block's lifetime: Solid asks for it again whenever it changes. */
  private readonly fallback = (error: () => unknown) => {
    this.caught = true
    const problem = untrack(error)
    this.node.onError(problem)
    return () => failure(problem, this.quiet[0]())
  }

  private guarded(node: BoundaryNode): ComponentNode {
    return {
      kind: "component",
      type: Errored,
      key: undefined,
      props: { fallback: this.fallback },
      children: [node.child],
    }
  }

  private fail(error: unknown): void {
    this.inner?.dispose()
    this.inner = null
    this.failed = { error }
    this.shown = undefined
    this.node.onError(error)
    this.changed[1]((count) => count + 1)
  }

  fits(next: Item): boolean {
    return typeof next !== "string" && next.kind === "boundary"
  }

  patch(next: Item): void {
    const node = next as BoundaryNode
    const retry = node.resetKey !== this.node.resetKey && (this.failed !== null || this.caught)
    this.node = node
    this.quiet[1](node.quiet)
    if (retry) {
      this.inner?.dispose()
      this.inner = null
      this.start()
      this.changed[1]((count) => count + 1)
      return
    }
    if (!this.inner) return
    try {
      this.inner.patch(this.guarded(node))
    } catch (error) {
      this.fail(error)
    }
  }

  collect(into: unknown[]): void {
    this.changed[0]()
    if (this.inner) {
      this.inner.collect(into)
      return
    }
    if (!this.failed) return
    const quiet = this.quiet[0]()
    if (this.shown?.quiet !== quiet) {
      this.shown = { quiet, element: failure(this.failed.error, quiet) }
    }
    into.push(this.shown.element)
  }

  dispose(): void {
    this.inner?.dispose()
    this.inner = null
  }
}

function mount(item: Item, place: Place): Mounted {
  if (typeof item === "string") return new TextMount(item)
  switch (item.kind) {
    case "element":
      return new ElementMount(item, place)
    case "fragment":
      return new FragmentMount(item, place)
    case "component":
      return new ComponentMount(item, place)
    case "widget":
      return new WidgetMount(item, place)
    case "presence":
      return new PresenceMount(item, place)
    case "boundary":
      return new BoundaryMount(item, place)
    case "foreign":
      return new ForeignMount(item)
  }
}
