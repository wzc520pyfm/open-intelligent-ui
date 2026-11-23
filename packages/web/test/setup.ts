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

// jsdom has ElementInternals without the form half. UI SDK's form-associated
// elements (checkbox, switch, slider...) report their value through it.
if (typeof ElementInternals !== "undefined") {
  const internals = ElementInternals.prototype as unknown as Record<string, unknown>
  const validity = { valid: true } as ValidityState
  const missing: Record<string, PropertyDescriptor> = {
    setFormValue: { value() {} },
    setValidity: { value() {} },
    checkValidity: { value: () => true },
    reportValidity: { value: () => true },
    form: { get: () => null },
    labels: { get: () => [] },
    validity: { get: () => validity },
    validationMessage: { get: () => "" },
    willValidate: { get: () => true },
  }
  for (const [name, descriptor] of Object.entries(missing)) {
    if (!(name in internals)) Object.defineProperty(internals, name, { configurable: true, ...descriptor })
  }
}

afterEach(async () => {
  const { unmountAll } = await import("./helpers")
  unmountAll()
})
