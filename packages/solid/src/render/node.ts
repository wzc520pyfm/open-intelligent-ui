import type { LetBinding } from "@open-intelligent-ui/core/renderer"
import type { Component } from "solid-js"
import type { Widget } from "./widget"

// biome-ignore lint/suspicious/noExplicitAny: components are looked up by name and take whatever markup passes
export type AnyComponent = Component<any>

/** A DOM element. `own` marks one the renderer drew itself, not one markup asked for. */
export interface ElementNode {
  kind: "element"
  tag: string
  props: Record<string, unknown>
  key: string | number | undefined
  children: Node[] | null
  own: boolean
}

export interface FragmentNode {
  kind: "fragment"
  key: string | number | undefined
  children: Node[]
}

/** A Solid component: a UI SDK part or one of the host's. */
export interface ComponentNode {
  kind: "component"
  type: AnyComponent
  props: Record<string, unknown>
  key: string | number | undefined
  children: Node[]
  /** Set when the children read values the component hands them (`let:`). */
  scoped?: { lets: LetBinding[]; render: (values: unknown[]) => Node[] }
}

/** One of the renderer's own primitives or presets. */
export interface WidgetNode {
  kind: "widget"
  widget: Widget
  props: Record<string, unknown>
  key: string | number | undefined
  children: Node[]
}

export interface PresenceNode {
  kind: "presence"
  child: Node
  show: boolean
  key: string | number | undefined
}

/** A top-level block, kept from taking the surface down with it. */
export interface BoundaryNode {
  kind: "boundary"
  child: Node
  /** When this changes, a failed block is tried again. */
  resetKey: string
  /** While streaming, a broken block stays hidden instead of showing an error. */
  quiet: boolean
  onError: (error: unknown) => void
  key: string | number | undefined
}

/** Something Solid already knows how to insert, handed through untouched. */
export interface ForeignNode {
  kind: "foreign"
  value: unknown
  key: string | number | undefined
}

export type Described =
  | ElementNode
  | FragmentNode
  | ComponentNode
  | WidgetNode
  | PresenceNode
  | BoundaryNode
  | ForeignNode

/**
 * What the renderer is asked to draw, described as plain data. Solid has no
 * virtual DOM to hand such a description to, so the renderer keeps what it
 * mounted and changes it to fit the next description.
 */
export type Node = Described | string | number | boolean | null | undefined | Node[]

export const element = (
  tag: string,
  props: Record<string, unknown>,
  children: Node[] | null = [],
  key?: string | number
): ElementNode => ({ kind: "element", tag, props, key, children, own: true })
