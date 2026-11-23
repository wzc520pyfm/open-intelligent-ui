import type { Surface } from "@open-intelligent-ui/core"
import {
  type IntelligentUIHandle,
  type IntelligentUIOptions,
  type MountedUI,
  mount,
  type Scheme,
} from "./mount"

/** Options that can be written as an attribute, and the attribute each one is. */
const ATTRIBUTES = {
  source: "source",
  streaming: "streaming",
  design: "design",
  scheme: "scheme",
  locale: "locale",
  currency: "currency",
  storageKey: "storage-key",
} as const

/** Options that only a property can hold. */
const PROPERTIES = [
  "components",
  "tools",
  "callTool",
  "onAction",
  "onTool",
  "onWarning",
  "onDiagnostics",
  "onStateChange",
  "initialState",
  "functions",
  "actions",
  "storage",
  "allowUrl",
] as const

type Option = keyof IntelligentUIOptions

// Importing this module on a server must not fail for want of a DOM.
const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement

/**
 * `<intelligent-ui>`: a surface as a custom element. It draws into its own
 * light DOM, so the page's stylesheet reaches it.
 *
 * `source`, `streaming`, `design`, `scheme`, `locale`, `currency` and
 * `storage-key` are attributes as well as properties; everything else that
 * `mount()` takes is a property. What the surface reports is both a callback
 * property and an event: `action` (cancel it to replace the built-in
 * handling), `tool`, `warning`, `diagnostics` and `statechange`, each with
 * the value in `event.detail`.
 */
export class IntelligentUIElement extends Base implements IntelligentUIHandle {
  static observedAttributes: string[] = Object.values(ATTRIBUTES)

  #options: Partial<IntelligentUIOptions> = {}
  #mounted: MountedUI | null = null
  #queued = false

  connectedCallback(): void {
    // A property set before the element was defined sits on the element itself.
    for (const name of [...Object.keys(ATTRIBUTES), ...PROPERTIES]) {
      if (!Object.hasOwn(this, name)) continue
      const self = this as unknown as Record<string, unknown>
      const value = self[name]
      delete self[name]
      self[name] = value
    }
    if (this.#mounted) return
    this.#mounted = mount(this, this.#resolved())
  }

  disconnectedCallback(): void {
    // Moving the element takes it off the page and puts it back in one go.
    queueMicrotask(() => {
      if (this.isConnected) return
      this.#mounted?.unmount()
      this.#mounted = null
    })
  }

  attributeChangedCallback(): void {
    this.#changed()
  }

  #attribute(name: keyof typeof ATTRIBUTES): string | undefined {
    return this.getAttribute(ATTRIBUTES[name]) ?? undefined
  }

  #resolved(): IntelligentUIOptions {
    const set = this.#options
    const scheme = this.#attribute("scheme")
    return {
      ...set,
      source: set.source ?? this.#attribute("source") ?? "",
      streaming: set.streaming ?? this.hasAttribute(ATTRIBUTES.streaming),
      design: set.design ?? this.#attribute("design"),
      scheme:
        set.scheme ?? (scheme === "light" || scheme === "dark" || scheme === "auto" ? scheme : "auto"),
      locale: set.locale ?? this.#attribute("locale"),
      currency: set.currency ?? this.#attribute("currency"),
      storageKey: set.storageKey ?? this.#attribute("storageKey"),
      onAction: (action) => {
        if (set.onAction?.(action) === true) return true
        const event = new CustomEvent("action", { detail: action, cancelable: true })
        return !this.dispatchEvent(event)
      },
      onTool: (detail) => {
        set.onTool?.(detail)
        this.dispatchEvent(new CustomEvent("tool", { detail }))
      },
      onWarning: (detail) => {
        set.onWarning?.(detail)
        this.dispatchEvent(new CustomEvent("warning", { detail }))
      },
      onDiagnostics: (detail) => {
        set.onDiagnostics?.(detail)
        this.dispatchEvent(new CustomEvent("diagnostics", { detail }))
      },
      onStateChange: (detail) => {
        set.onStateChange?.(detail)
        this.dispatchEvent(new CustomEvent("statechange", { detail }))
      },
    }
  }

  /** Several attributes and properties set together are drawn once. */
  #changed(): void {
    if (!this.#mounted || this.#queued) return
    this.#queued = true
    queueMicrotask(() => {
      this.#queued = false
      this.#mounted?.update(this.#resolved())
    })
  }

  #set<Name extends Option>(name: Name, value: IntelligentUIOptions[Name] | undefined): void {
    if (value === undefined || value === null) delete this.#options[name]
    else this.#options[name] = value
    this.#changed()
  }

  get source(): string {
    return this.#options.source ?? this.#attribute("source") ?? ""
  }
  set source(value: string) {
    this.#set("source", value === null || value === undefined ? undefined : String(value))
  }

  get streaming(): boolean {
    return this.#options.streaming ?? this.hasAttribute(ATTRIBUTES.streaming)
  }
  set streaming(value: boolean) {
    this.#set("streaming", Boolean(value))
  }

  get design(): IntelligentUIOptions["design"] {
    return this.#options.design ?? this.#attribute("design")
  }
  set design(value: IntelligentUIOptions["design"]) {
    this.#set("design", value)
  }

  get scheme(): Scheme {
    return this.#resolved().scheme ?? "auto"
  }
  set scheme(value: Scheme) {
    this.#set("scheme", value)
  }

  get locale(): string | undefined {
    return this.#options.locale ?? this.#attribute("locale")
  }
  set locale(value: string | undefined) {
    this.#set("locale", value)
  }

  get currency(): string | undefined {
    return this.#options.currency ?? this.#attribute("currency")
  }
  set currency(value: string | undefined) {
    this.#set("currency", value)
  }

  get storageKey(): string | undefined {
    return this.#options.storageKey ?? this.#attribute("storageKey")
  }
  set storageKey(value: string | undefined) {
    this.#set("storageKey", value)
  }

  /** Applies options set since the last draw, so a method called right after sees them. */
  #sync(): MountedUI | null {
    if (this.#queued) {
      this.#queued = false
      this.#mounted?.update(this.#resolved())
    }
    return this.#mounted
  }

  getState(): Record<string, unknown> {
    return this.#sync()?.getState() ?? {}
  }

  setState(values: Record<string, unknown>): void {
    this.#sync()?.setState(values)
  }

  reset(...names: string[]): void {
    this.#sync()?.reset(...names)
  }

  refetch(...ids: string[]): void {
    this.#sync()?.refetch(...ids)
  }

  /** The surface behind the element. It exists while the element is on the page. */
  get surface(): Surface {
    const mounted = this.#sync()
    if (!mounted) throw new Error("<intelligent-ui> has no surface until it is on the page")
    return mounted.surface
  }

  /** Draws now whatever is waiting to be drawn. */
  flush(): void {
    this.#sync()?.flush()
  }

  /** Reads and writes a property-only option. */
  protected option<Name extends Option>(name: Name): IntelligentUIOptions[Name] | undefined {
    return this.#options[name]
  }

  protected setOption<Name extends Option>(
    name: Name,
    value: IntelligentUIOptions[Name] | undefined
  ): void {
    this.#set(name, value)
  }
}

type PropertyOptions = Pick<IntelligentUIOptions, (typeof PROPERTIES)[number]>

// The properties with nothing to say beyond holding a value are all alike.
export interface IntelligentUIElement extends PropertyOptions {}

for (const name of PROPERTIES) {
  Object.defineProperty(IntelligentUIElement.prototype, name, {
    configurable: true,
    enumerable: true,
    get(this: IntelligentUIElement) {
      return this.option(name)
    },
    set(this: IntelligentUIElement, value: never) {
      this.setOption(name, value)
    },
  })
}

/**
 * Registers `<intelligent-ui>`, or the element under another tag name.
 * Does nothing where there are no custom elements, and nothing the second
 * time round.
 */
export function defineIntelligentUI(tag = "intelligent-ui"): void {
  if (typeof customElements === "undefined" || customElements.get(tag)) return
  // A class can be registered once, so another tag gets a class of its own.
  const registered = customElements.getName?.(IntelligentUIElement)
  customElements.define(tag, registered ? class extends IntelligentUIElement {} : IntelligentUIElement)
}

declare global {
  interface HTMLElementTagNameMap {
    "intelligent-ui": IntelligentUIElement
  }
}
