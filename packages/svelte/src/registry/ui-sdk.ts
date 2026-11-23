import { createRegistry, type Lookup } from "@open-intelligent-ui/core/renderer"
import {
  UI_SDK_COMPONENTS,
  UI_SDK_LOADERS,
  type UiSdkComponent,
} from "./ui-sdk.generated.js"

const registry = createRegistry<UiSdkComponent>(UI_SDK_LOADERS, UI_SDK_COMPONENTS)

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
