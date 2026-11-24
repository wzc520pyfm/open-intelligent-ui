import type {
  Design,
  Diagnostic,
  Library,
  StorageLike,
  Surface as SurfaceType,
  SurfaceAction,
  Tool,
  ToolEvent,
} from "@open-intelligent-ui/core"
import type { AnyComponent } from "./render/node.js"

/** What `bind:this` on `<IntelligentUI>` gives you. */
export interface IntelligentUIHandle {
  /** The surface's current state, as plain data. */
  getState(): Record<string, unknown>
  /** Writes state, as if the user had changed it. */
  setState(values: Record<string, unknown>): void
  /** Puts state back to its declared starting values. */
  reset(...names: string[]): void
  /** Reloads the named queries, or all of them. */
  refetch(...ids: string[]): void
  readonly surface: SurfaceType
}

/** The props `<IntelligentUI>` takes. */
export interface IntelligentUIProps {
  /** IUI markup written by the model. May be incomplete while `streaming`. */
  source: string
  /** True while `source` is still arriving. */
  streaming?: boolean
  /** A DESIGN.md document, or one already read with `parseDesign`. */
  design?: string | Design
  /** Which colors to use when the design has both. Defaults to `auto`. */
  scheme?: "light" | "dark" | "auto"
  /** Your own components, usable in markup by their PascalCase name. */
  components?: Record<string, AnyComponent>
  /**
   * What your product adds, made with `defineLibrary`: components with
   * their descriptions, the engines that draw charts and play motion, and
   * the design. Give the same library to `buildSystemPrompt`.
   */
  library?: Library<AnyComponent>
  /** Functions the surface reads with `<query>` and writes with `call()`. */
  tools?: Record<string, Tool>
  /** Called for tools not found in `tools`. */
  callTool?: (name: string, input: unknown) => unknown
  /**
   * Called when the surface sends a message, opens a link, copies text or
   * shows a toast. Return `true` to replace the built-in handling.
   */
  onAction?: (action: SurfaceAction) => boolean | undefined
  onTool?: (event: ToolEvent) => void
  /** Problems in the markup: unknown components, bad expressions, failed actions. */
  onWarning?: (message: string) => void
  /** Parse problems for the current source. */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void
  onStateChange?: (state: Record<string, unknown>) => void
  initialState?: Record<string, unknown>
  /** Extra pure functions for expressions. */
  functions?: Record<string, (...args: never[]) => unknown>
  /** Extra actions for event handlers. */
  actions?: Record<string, (...args: never[]) => unknown>
  locale?: string
  currency?: string
  /** Where `<state persist>` values are kept. Needs `storageKey`. */
  storage?: StorageLike
  storageKey?: string
  /** Return false to refuse a link or media URL. */
  allowUrl?: (url: string, kind: "link" | "media") => boolean
  class?: string
  style?: string
}
