import {
  createBuiltins,
  type EvalHost,
  type Expr,
  evaluate,
  registerCallable,
  Scope,
} from "../expr"
import type { AttrValue, Document, ElementNode, Node } from "../markup"

/** What a generated surface asks its host application to do. */
export type SurfaceAction =
  | {
      type: "send"
      /** A message for the agent, written as if the user had typed it. */
      text: string
      data?: unknown
      /** The surface's state when the message was sent. */
      state: Record<string, unknown>
    }
  | { type: "open"; url: string }
  | { type: "copy"; text: string }
  | { type: "toast"; message: string; tone?: string }

export interface ToolEvent {
  tool: string
  input: unknown
  status: "start" | "done" | "error"
  /** `read` for `<query>`, `write` for `call()` from an event handler. */
  kind: "read" | "write"
  result?: unknown
  error?: string
}

export type Tool = (input: unknown) => unknown

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface SurfaceOptions {
  /** Functions the surface can read from with `<query>` and write to with `call()`. */
  tools?: Record<string, Tool>
  /** Called for tools not found in `tools`, e.g. to forward them to a server. */
  callTool?: (name: string, input: unknown) => unknown
  onAction?: (action: SurfaceAction) => void
  onTool?: (event: ToolEvent) => void
  /** Problems found while evaluating, like an unknown name. */
  onWarning?: (message: string) => void
  /** Extra pure functions for expressions. */
  functions?: Record<string, (...args: never[]) => unknown>
  /** Extra actions for event handlers. */
  actions?: Record<string, (...args: never[]) => unknown>
  initialState?: Record<string, unknown>
  locale?: string
  currency?: string
  /** Where `<state persist>` values are kept between visits. */
  storage?: StorageLike
  storageKey?: string
}

export interface QueryState {
  data: unknown
  loading: boolean
  error: string | null
  updatedAt: number | null
}

interface DerivedEntry {
  expr: Expr
  value: unknown
  version: number
  computing: boolean
}

interface QueryEntry {
  id: string
  tool: AttrValue | undefined
  input: AttrValue | undefined
  enabled: AttrValue | undefined
  every: AttrValue | undefined
  key: string | null
  seq: number
  state: QueryState
  timer: ReturnType<typeof setInterval> | null
  interval: number
}

const IDLE_QUERY: QueryState = Object.freeze({
  data: undefined,
  loading: false,
  error: null,
  updatedAt: null,
})

function toPlain(value: unknown): unknown {
  if (value === undefined || value === null) return value
  if (typeof value !== "object") {
    return typeof value === "function" ? undefined : value
  }
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return undefined
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined"
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The live data behind one generated surface: its state, derived values and
 * queries, plus the actions its event handlers can call.
 *
 * State survives re-parsing, so a surface that is still streaming in keeps
 * what the user has already typed or toggled.
 */
export class Surface {
  readonly scope = new Scope()
  readonly host: EvalHost
  /** Components declared with `<define>`, by name. */
  templates = new Map<string, ElementNode>()
  /** CSS from `<style>` blocks, in document order. */
  styles: string[] = []

  private readonly options: SurfaceOptions
  private readonly state = new Map<string, unknown>()
  private readonly defaults = new Map<string, unknown>()
  private readonly persisted = new Set<string>()
  private derived = new Map<string, DerivedEntry>()
  private readonly queries = new Map<string, QueryEntry>()
  private readonly listeners = new Set<() => void>()
  private readonly warned = new Set<string>()
  private stored: Record<string, unknown> = {}
  private version = 0
  private active = false
  private syncQueued = false
  private disposed = false

  constructor(options: SurfaceOptions = {}) {
    this.options = options
    for (const [name, value] of Object.entries(options.initialState ?? {})) {
      this.state.set(name, value)
    }
    this.stored = this.readStorage()

    const functions: Record<string, unknown> = createBuiltins({
      locale: options.locale,
      currency: options.currency,
    })
    for (const [name, fn] of Object.entries(options.functions ?? {})) {
      functions[name] = registerCallable(fn as (...args: unknown[]) => unknown)
    }

    const actions: Record<string, (...args: unknown[]) => unknown> = {
      send: (text, data) => {
        this.emit({
          type: "send",
          text: String(text ?? ""),
          data: toPlain(data),
          state: this.snapshot(),
        })
      },
      call: (tool, input, settings) => {
        const refetch =
          (settings as { refetch?: unknown } | undefined)?.refetch !== false
        return this.runTool(String(tool), input, "write").then((result) => {
          if (refetch) this.refetch()
          return result
        })
      },
      refetch: (...ids) => {
        this.refetch(...ids.map(String))
      },
      reset: (...names) => {
        this.reset(...names.map(String))
      },
      open: (url) => {
        this.emit({ type: "open", url: String(url ?? "") })
      },
      copy: (text) => {
        this.emit({ type: "copy", text: String(text ?? "") })
      },
      toast: (message, tone) => {
        const action: SurfaceAction = {
          type: "toast",
          message: String(message ?? ""),
        }
        if (typeof tone === "string") action.tone = tone
        this.emit(action)
      },
    }
    for (const [name, fn] of Object.entries(options.actions ?? {})) {
      actions[name] = fn as (...args: unknown[]) => unknown
    }
    for (const fn of Object.values(actions)) registerCallable(fn)

    this.host = {
      lookup: (name) => this.lookup(name),
      assign: (name, value) => this.set(name, value),
      functions,
      actions,
      warn: (message) => this.warn(message),
    }
  }

  // --- subscriptions -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getVersion = (): number => this.version

  private changed(): void {
    this.version++
    for (const listener of [...this.listeners]) listener()
    this.queueSync()
  }

  private warn(message: string): void {
    if (this.warned.has(message)) return
    this.warned.add(message)
    this.options.onWarning?.(message)
  }

  private emit(action: SurfaceAction): void {
    this.options.onAction?.(action)
  }

  // --- state ---------------------------------------------------------------

  private lookup(name: string): { found: boolean; value?: unknown } {
    if (this.state.has(name)) return { found: true, value: this.state.get(name) }
    const derived = this.derived.get(name)
    if (derived) return { found: true, value: this.compute(name, derived) }
    const query = this.queries.get(name)
    if (query) return { found: true, value: query.state }
    return { found: false }
  }

  has(name: string): boolean {
    return this.state.has(name)
  }

  get(name: string): unknown {
    return this.lookup(name).value
  }

  set(name: string, value: unknown): void {
    if (this.derived.has(name) || this.queries.has(name)) {
      this.warn(`"${name}" is computed and can't be assigned`)
      return
    }
    if (this.state.has(name) && Object.is(this.state.get(name), value)) return
    this.state.set(name, value)
    if (this.persisted.has(name)) this.writeStorage()
    this.changed()
  }

  /** Sets several state values and notifies once. */
  patch(values: Record<string, unknown>): void {
    let dirty = false
    for (const [name, value] of Object.entries(values)) {
      if (this.derived.has(name) || this.queries.has(name)) continue
      if (this.state.has(name) && Object.is(this.state.get(name), value)) continue
      this.state.set(name, value)
      dirty = true
    }
    if (!dirty) return
    this.writeStorage()
    this.changed()
  }

  /** Puts state back to the values it was declared with. */
  reset(...names: string[]): void {
    const targets = names.length ? names : [...this.defaults.keys()]
    const values: Record<string, unknown> = {}
    for (const name of targets) {
      if (this.defaults.has(name)) values[name] = this.defaults.get(name)
    }
    this.patch(values)
  }

  /** The current state as plain data, ready to store or send to the agent. */
  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.state)
  }

  private compute(name: string, entry: DerivedEntry): unknown {
    if (entry.version === this.version) return entry.value
    if (entry.computing) {
      this.warn(`"${name}" depends on itself`)
      return undefined
    }
    entry.computing = true
    try {
      entry.value = evaluate(entry.expr, this.scope, this.host)
    } catch (error) {
      entry.value = undefined
      this.warn(`${name}: ${errorMessage(error)}`)
    } finally {
      entry.computing = false
    }
    entry.version = this.version
    return entry.value
  }

  private readStorage(): Record<string, unknown> {
    const { storage, storageKey } = this.options
    if (!storage || !storageKey) return {}
    try {
      const raw = storage.getItem(`iui:${storageKey}`)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }

  private writeStorage(): void {
    const { storage, storageKey } = this.options
    if (!storage || !storageKey || this.persisted.size === 0) return
    const values: Record<string, unknown> = {}
    for (const name of this.persisted) values[name] = this.state.get(name)
    try {
      storage.setItem(`iui:${storageKey}`, JSON.stringify(values))
    } catch {
      // Storage may be full or unavailable; the surface still works.
    }
  }

  // --- document ------------------------------------------------------------

  private value(attr: AttrValue | undefined): unknown {
    if (!attr) return undefined
    if (attr.kind === "static") return attr.value
    if (attr.kind === "expr") return evaluate(attr.expr, this.scope, this.host)
    return attr.parts
      .map((part) =>
        typeof part === "string"
          ? part
          : String(evaluate(part, this.scope, this.host) ?? "")
      )
      .join("")
  }

  /**
   * Reads the declarations of a parsed document: `<state>`, `<derive>`,
   * `<query>`, `<define>` and `<style>`. Safe to call on every re-parse while
   * streaming; state that already exists keeps its current value.
   */
  update(doc: Document): void {
    const derived = new Map<string, DerivedEntry>()
    const templates = new Map<string, ElementNode>()
    const styles: string[] = []
    const seenQueries = new Set<string>()

    const visit = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.type === "if") {
          for (const branch of node.branches) visit(branch.children)
          continue
        }
        if (node.type !== "element") continue
        if (node.origin !== "tag" || node.svg) {
          if (!node.svg) visit(node.children)
          continue
        }
        switch (node.name) {
          case "state": {
            const persist = node.attrs.some((attr) => attr.name === "persist")
            for (const attr of node.attrs) {
              if (attr.name === "persist" || attr.name === "...") continue
              this.declare(attr.name, attr.value, persist)
            }
            break
          }
          case "derive":
            for (const attr of node.attrs) {
              if (attr.value.kind !== "expr") continue
              derived.set(attr.name, {
                expr: attr.value.expr,
                value: undefined,
                version: -1,
                computing: false,
              })
            }
            break
          case "query":
            this.declareQuery(node, seenQueries)
            break
          case "define": {
            const name = node.attrs.find((attr) => attr.name === "name")?.value
            if (name?.kind === "static" && typeof name.value === "string") {
              if (node.closed) templates.set(name.value, node)
            }
            break
          }
          case "style": {
            const child = node.children[0]
            if (node.closed && child?.type === "text") styles.push(child.value)
            break
          }
          default:
            visit(node.children)
        }
      }
    }
    visit(doc.children)

    this.derived = derived
    this.templates = templates
    this.styles = styles
    for (const [id, entry] of this.queries) {
      if (seenQueries.has(id)) continue
      if (entry.timer) clearInterval(entry.timer)
      this.queries.delete(id)
    }
  }

  private declare(name: string, attr: AttrValue, persist: boolean): void {
    if (this.defaults.has(name)) return
    let value: unknown
    try {
      value = this.value(attr)
    } catch (error) {
      this.warn(`${name}: ${errorMessage(error)}`)
    }
    this.defaults.set(name, value)
    if (persist) {
      this.persisted.add(name)
      if (Object.hasOwn(this.stored, name)) {
        this.state.set(name, this.stored[name])
        return
      }
    }
    if (!this.state.has(name)) this.state.set(name, value)
  }

  private declareQuery(node: ElementNode, seen: Set<string>): void {
    const attr = (name: string) =>
      node.attrs.find((item) => item.name === name)?.value
    const idAttr = attr("id") ?? attr("name")
    if (idAttr?.kind !== "static" || typeof idAttr.value !== "string") {
      this.warn('<query> needs an id, like <query id="orders" tool="orders.list" />')
      return
    }
    const id = idAttr.value
    seen.add(id)
    const existing = this.queries.get(id)
    const entry: QueryEntry = existing ?? {
      id,
      tool: undefined,
      input: undefined,
      enabled: undefined,
      every: undefined,
      key: null,
      seq: 0,
      state: IDLE_QUERY,
      timer: null,
      interval: 0,
    }
    entry.tool = attr("tool")
    entry.input = attr("input")
    entry.enabled = attr("enabled")
    entry.every = attr("every")
    if (!existing) {
      entry.state = { ...IDLE_QUERY, loading: true }
      this.queries.set(id, entry)
    }
  }

  // --- queries and tools ---------------------------------------------------

  /**
   * Starts loading queries. Call it once the surface is on screen, and again
   * after each `update`; until then nothing is fetched.
   */
  start(): void {
    if (this.disposed) return
    this.active = true
    this.syncQueries()
  }

  /** Stops timers. The surface can be started again later. */
  stop(): void {
    this.active = false
    for (const entry of this.queries.values()) {
      if (entry.timer) clearInterval(entry.timer)
      entry.timer = null
      entry.interval = 0
    }
  }

  dispose(): void {
    this.stop()
    this.disposed = true
    this.listeners.clear()
  }

  private queueSync(): void {
    if (!this.active || this.syncQueued) return
    this.syncQueued = true
    queueMicrotask(() => {
      this.syncQueued = false
      if (this.active) this.syncQueries()
    })
  }

  private syncQueries(): void {
    for (const entry of this.queries.values()) {
      let tool: unknown
      let input: unknown
      let enabled = true
      let every = 0
      try {
        tool = this.value(entry.tool)
        input = this.value(entry.input)
        if (entry.enabled) enabled = Boolean(this.value(entry.enabled))
        if (entry.every) every = Number(this.value(entry.every)) || 0
      } catch (error) {
        this.warn(`${entry.id}: ${errorMessage(error)}`)
        continue
      }
      const interval = enabled && every > 0 ? Math.max(every, 1) * 1000 : 0
      if (interval !== entry.interval) {
        if (entry.timer) clearInterval(entry.timer)
        entry.interval = interval
        entry.timer = interval
          ? setInterval(() => this.refetch(entry.id), interval)
          : null
      }
      if (!enabled) {
        if (entry.state.loading && entry.key === null) {
          entry.state = { ...entry.state, loading: false }
          this.changed()
        }
        continue
      }
      if (typeof tool !== "string" || !tool) {
        this.setQueryError(entry, "<query> needs a tool name")
        continue
      }
      const key = `${tool}:${stableStringify(input)}`
      if (key === entry.key) continue
      entry.key = key
      void this.load(entry, tool, input)
    }
  }

  private setQueryError(entry: QueryEntry, message: string): void {
    if (entry.state.error === message && !entry.state.loading) return
    entry.state = { ...entry.state, loading: false, error: message }
    this.changed()
  }

  private async load(
    entry: QueryEntry,
    tool: string,
    input: unknown
  ): Promise<void> {
    const seq = ++entry.seq
    if (!entry.state.loading || entry.state.error) {
      entry.state = { ...entry.state, loading: true, error: null }
      this.changed()
    }
    try {
      const data = await this.runTool(tool, input, "read")
      if (seq !== entry.seq) return
      entry.state = { data, loading: false, error: null, updatedAt: Date.now() }
    } catch (error) {
      if (seq !== entry.seq) return
      entry.state = {
        data: entry.state.data,
        loading: false,
        error: errorMessage(error),
        updatedAt: entry.state.updatedAt,
      }
    }
    this.changed()
  }

  /** Reloads the named queries, or all of them. Current data stays visible. */
  refetch(...ids: string[]): void {
    for (const entry of this.queries.values()) {
      if (ids.length && !ids.includes(entry.id)) continue
      entry.key = null
    }
    if (this.active) this.syncQueries()
  }

  private async runTool(
    name: string,
    input: unknown,
    kind: ToolEvent["kind"]
  ): Promise<unknown> {
    const { tools, callTool, onTool } = this.options
    const plainInput = toPlain(input)
    onTool?.({ tool: name, input: plainInput, status: "start", kind })
    try {
      let result: unknown
      if (tools && Object.hasOwn(tools, name)) {
        result = await (tools[name] as Tool)(plainInput)
      } else if (callTool) {
        result = await callTool(name, plainInput)
      } else {
        throw new Error(`No tool named "${name}" is available`)
      }
      const plain = toPlain(result)
      onTool?.({
        tool: name,
        input: plainInput,
        status: "done",
        kind,
        result: plain,
      })
      return plain
    } catch (error) {
      onTool?.({
        tool: name,
        input: plainInput,
        status: "error",
        kind,
        error: errorMessage(error),
      })
      throw error
    }
  }
}
