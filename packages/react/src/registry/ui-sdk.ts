import {
  UI_SDK_COMPONENTS,
  UI_SDK_LOADERS,
  type UiSdkComponent,
} from "./ui-sdk.generated"

type EntryState =
  | { status: "loading"; promise: Promise<void> }
  | { status: "ready"; module: Record<string, unknown> }
  | { status: "error"; error: unknown }

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
  const loader = UI_SDK_LOADERS[slug]
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

export type UiSdkLookup =
  | { status: "ready"; component: UiSdkComponent }
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "unknown" }

/** Whether `name` is a UI SDK component, like `Tabs` or `SelectItem`. */
export function isUiSdkComponent(name: string): boolean {
  return Object.hasOwn(UI_SDK_COMPONENTS, name)
}

/**
 * Finds a UI SDK component by name. The first lookup of an entry point starts
 * loading it; subscribe with `subscribeUiSdk` to render again when it arrives.
 */
export function lookupUiSdk(name: string): UiSdkLookup {
  if (!Object.hasOwn(UI_SDK_COMPONENTS, name)) return { status: "unknown" }
  const state = load(UI_SDK_COMPONENTS[name] as string)
  if (state.status === "loading") return { status: "loading" }
  if (state.status === "error") return state
  const component = state.module[name]
  if (!component) return { status: "unknown" }
  return { status: "ready", component: component as UiSdkComponent }
}

export function subscribeUiSdk(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getUiSdkVersion(): number {
  return version
}

/**
 * Loads UI SDK entry points ahead of time, so the first render doesn't wait.
 * Pass component names (`"Tabs"`) or entry names (`"tabs"`); with no
 * arguments it loads everything.
 */
export async function preloadUiSdk(...names: string[]): Promise<void> {
  const slugs = names.length
    ? names.map((name) => UI_SDK_COMPONENTS[name] ?? name)
    : Object.keys(UI_SDK_LOADERS)
  await Promise.all(
    [...new Set(slugs)].map((slug) => {
      const state = load(slug)
      return state.status === "loading" ? state.promise : undefined
    })
  )
}

/** Every UI SDK component name the renderer understands. */
export function uiSdkComponentNames(): string[] {
  return Object.keys(UI_SDK_COMPONENTS)
}
