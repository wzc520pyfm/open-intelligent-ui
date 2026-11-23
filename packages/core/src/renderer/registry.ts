type Loader = () => Promise<Record<string, unknown>>

type EntryState =
  | { status: "loading"; promise: Promise<void> }
  | { status: "ready"; module: Record<string, unknown> }
  | { status: "error"; error: unknown }

export type Lookup<C> =
  | { status: "ready"; component: C }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "unknown" }

export interface Registry<C> {
  /** Whether `name` is a component of this library, like `Tabs` or `SelectItem`. */
  has(name: string): boolean
  /**
   * Finds a component by name. The first lookup of an entry point starts
   * loading it; subscribe to render again when it arrives.
   */
  lookup(name: string): Lookup<C>
  subscribe(listener: () => void): () => void
  /** Changes whenever an entry point finishes loading. */
  version(): number
  /**
   * Loads entry points ahead of time, so the first render doesn't wait. Pass
   * component names (`"Tabs"`) or entry names (`"tabs"`); with no arguments it
   * loads everything.
   */
  preload(...names: string[]): Promise<void>
  names(): string[]
}

/**
 * A lazily loaded component library: `loaders` imports an entry point by
 * slug, `components` says which entry point each component name lives in.
 */
export function createRegistry<C>(
  loaders: Record<string, Loader>,
  components: Record<string, string>
): Registry<C> {
  const entries = new Map<string, EntryState>()
  const listeners = new Set<() => void>()
  let version = 0

  function notify(): void {
    version++
    for (const listener of [...listeners]) listener()
  }

  function load(slug: string): EntryState {
    const existing = entries.get(slug)
    if (existing) return existing
    const loader = Object.hasOwn(loaders, slug) ? loaders[slug] : undefined
    if (!loader) {
      const missing: EntryState = {
        status: "error",
        error: new Error(`Unknown UI SDK entry "${slug}"`),
      }
      entries.set(slug, missing)
      return missing
    }
    const promise = loader().then(
      (module) => {
        entries.set(slug, { status: "ready", module })
        notify()
      },
      (error: unknown) => {
        entries.set(slug, { status: "error", error })
        notify()
      }
    )
    const state: EntryState = { status: "loading", promise }
    entries.set(slug, state)
    return state
  }

  const has = (name: string) => Object.hasOwn(components, name)

  return {
    has,
    lookup(name) {
      if (!has(name)) return { status: "unknown" }
      const state = load(components[name] as string)
      if (state.status === "loading") return { status: "loading" }
      if (state.status === "error") return state
      const component = state.module[name]
      if (!component) return { status: "unknown" }
      return { status: "ready", component: component as C }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    version: () => version,
    async preload(...names) {
      const slugs = names.length
        ? names.map((name) => (has(name) ? (components[name] as string) : name))
        : Object.keys(loaders)
      await Promise.all(
        [...new Set(slugs)].map((slug) => {
          const state = load(slug)
          return state.status === "loading" ? state.promise : undefined
        })
      )
    },
    names: () => Object.keys(components),
  }
}
