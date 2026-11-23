import { afterEach } from "vitest"
import { config, enableAutoUnmount } from "@vue/test-utils"

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia

Element.prototype.scrollIntoView ??= () => {}
Element.prototype.getAnimations ??= () => []

// Errors a surface catches are part of what is being tested.
config.global.config.warnHandler = () => {}

enableAutoUnmount(afterEach)
