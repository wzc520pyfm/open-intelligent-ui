import type { View } from "@open-intelligent-ui/core/renderer"
import type { Component, Snippet } from "svelte"

// biome-ignore lint/suspicious/noExplicitAny: components are looked up by name and take whatever markup passes
export type AnyComponent = Component<any>

/** Draws one of the renderer's own stateless parts from what it was given. */
export type Draw = (props: Record<string, unknown>, children: RenderNode[]) => unknown

export interface ElementNode {
  kind: "element"
  tag: string
  props: Record<string | symbol, unknown>
  key: string
  /** Null for elements that can't have children. */
  children: unknown[] | null
}

export interface ComponentNode {
  kind: "component"
  type: AnyComponent
  props: Record<string, unknown>
  key: string
  children: RenderNode[]
  /** Draws the children from what the component hands its snippet (`let:`). */
  render?: (given: unknown) => RenderNode[]
}

export interface FragmentNode {
  kind: "fragment"
  key: string
  children: RenderNode[]
}

export interface PresenceNode {
  kind: "presence"
  key: string
  show: boolean
  child: RenderNode
}

/** A stateless primitive or preset, drawn into elements when its parent is. */
export interface ViewNode {
  kind: "view"
  key: string
  draw: Draw
  props: Record<string, unknown>
  children: RenderNode[]
}

/** Content a Svelte parent gave one of the renderer's parts, used outside a surface. */
export interface SnippetNode {
  kind: "snippet"
  key: string
  snippet: Snippet
}

/**
 * What the shared renderer builds for Svelte: plain descriptions, made again
 * from scratch on every change. `Nodes.svelte` draws them, and tells by
 * their keys which of the elements and components on screen to keep.
 */
export type RenderNode =
  | string
  | ElementNode
  | ComponentNode
  | FragmentNode
  | PresenceNode
  | ViewNode
  | SnippetNode

export interface TextItem {
  kind: "text"
  key: string
  text: string
}

/** One thing `Nodes.svelte` puts in the DOM, with a key no sibling shares. */
export type Item = TextItem | ElementNode | ComponentNode | PresenceNode | SnippetNode

export type { View }
