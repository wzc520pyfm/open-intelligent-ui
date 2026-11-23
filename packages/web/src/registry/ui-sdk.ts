import { createRegistry, type Lookup } from "@open-intelligent-ui/core/renderer"
import { adapt, registerRoots, type UiSdkComponent } from "../ui-sdk/adapter"
import { SPECIAL_LOADERS, SPECIALS } from "../ui-sdk/special"
import { UI_SDK_COMPONENTS, UI_SDK_ELEMENTS, UI_SDK_LOADERS } from "./ui-sdk.generated"

registerRoots(UI_SDK_ELEMENTS)

const names = new Map<string, string[]>()
for (const [name, slug] of Object.entries(UI_SDK_COMPONENTS)) {
  const list = names.get(slug)
  if (list) list.push(name)
  else names.set(slug, [name])
}

/**
 * An entry point is ready once its custom elements are defined. What the
 * renderer looks up by name is not the element but how to draw it.
 */
const loaders = Object.fromEntries(
  Object.entries(UI_SDK_LOADERS).map(([slug, load]) => [
    slug,
    async () => {
      const special = Object.hasOwn(SPECIAL_LOADERS, slug) ? SPECIAL_LOADERS[slug] : undefined
      const [, later] = await Promise.all([load(), special?.()])
      const module: Record<string, UiSdkComponent> = {}
      for (const name of names.get(slug) ?? []) {
        const spec = Object.hasOwn(UI_SDK_ELEMENTS, name) ? UI_SDK_ELEMENTS[name] : undefined
        const own = Object.hasOwn(SPECIALS, name) ? SPECIALS[name] : later?.[name]
        module[name] = adapt(name, spec ?? null, own)
      }
      return module
    },
  ])
)

const registry = createRegistry<UiSdkComponent>(loaders, UI_SDK_COMPONENTS)

export type UiSdkLookup = Lookup<UiSdkComponent>

/** Whether `name` is a UI SDK component, like `Tabs` or `SelectItem`. */
export const isUiSdkComponent = registry.has

/**
 * Finds a UI SDK component by name. The first lookup of an entry point starts
 * loading it; subscribe with `subscribeUiSdk` to render again when it arrives.
 */
export const lookupUiSdk = registry.lookup

export const subscribeUiSdk = registry.subscribe

export const getUiSdkVersion = registry.version

/**
 * Loads UI SDK entry points ahead of time, so the first render doesn't wait.
 * Pass component names (`"Tabs"`) or entry names (`"tabs"`); with no
 * arguments it loads everything.
 */
export const preloadUiSdk = registry.preload

/** Every UI SDK component name the renderer understands. */
export const uiSdkComponentNames = registry.names
