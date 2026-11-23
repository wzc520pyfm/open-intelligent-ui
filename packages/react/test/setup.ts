import { cleanup, configure } from "@testing-library/react"
import { afterEach } from "vitest"

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

// Number animations run on the clock; one second is too tight on a busy machine.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
