import type { Design, Library, SurfaceAction, Tool, ToolEvent } from "@open-intelligent-ui/core"

/** What the site gives a surface, whichever renderer draws it. */
export interface SurfaceProps {
  source: string
  streaming: boolean
  design: string | Design
  scheme: "light" | "dark"
  tools: Record<string, Tool>
  /** The product's components and the engines chosen for charts and motion. */
  // biome-ignore lint/suspicious/noExplicitAny: one library is handed to whichever renderer draws
  library?: Library<any> | undefined
  onAction: (action: SurfaceAction) => undefined
  onTool: (event: ToolEvent) => void
  onWarning: (message: string) => void
  onStateChange?: ((state: Record<string, unknown>) => void) | undefined
}

export interface SurfaceHandle {
  reset(): void
}

/** A surface drawn by a renderer React doesn't know, inside an element React owns. */
export interface Mounted extends SurfaceHandle {
  update(props: SurfaceProps): void
  unmount(): void
}

export type Mount = (target: HTMLElement, props: SurfaceProps) => Mounted

export type RendererId = "react" | "vue" | "svelte" | "solid" | "web"

export const RENDERERS: { id: RendererId; label: string }[] = [
  { id: "react", label: "React" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
  { id: "solid", label: "Solid" },
  { id: "web", label: "Web Components" },
]
