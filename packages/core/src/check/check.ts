import { safeUrl } from "../design"
import {
  createBuiltins,
  type Expr,
  findClosingBrace,
  METHOD_NAMES,
  MUTATOR_NAMES,
  type Pattern,
} from "../expr"
import {
  acceptsAttribute,
  type ComponentSpec,
  checkProp,
  type Library,
  type LibrarySpec,
} from "../library"
import {
  type Attr,
  type AttrValue,
  type DiagnosticCode,
  type ElementNode,
  HTML_TAGS,
  isComponentName,
  type Node,
  PRIMITIVE_TAGS,
  parse,
  prepare,
  SVG_TAGS,
} from "../markup"
import { UNSUPPORTED } from "../prompt/recipes"
import { UI_SDK_CATALOG } from "../prompt/ui-sdk-catalog.generated"
import { MOTION_PRESET_NAMES } from "../renderer/motion"
import { iconName } from "../renderer/primitives"
import { BLOCKED_PROPS, isHtmlAttribute } from "../renderer/props"
import { ICON_NAMES } from "./icons.generated"
import {
  CHART_TYPES,
  DOM_EVENTS,
  EXTRA_MOTIONS,
  OTHER_GLOBALS,
  OTHER_METHODS,
  OTHER_NAMES,
  OTHER_PROPS,
  OTHER_PROPS_OF,
  PRESET_PROPS,
  PRIMITIVE_PROPS,
  UNIVERSAL,
} from "./specs"

/** What kind of problem an issue is. The first group comes from reading the markup, the rest from checking it. */
export type IssueCode =
  | DiagnosticCode
  /** A component nothing draws: not in the library, not a preset, not a UI SDK part, not defined in the reply. */
  | "unknown-component"
  /** A UI SDK part outside the component it belongs to. */
  | "misplaced-part"
  /** A prop, an event or a binding the component doesn't have. */
  | "unknown-prop"
  /** A prop the component can't do without. */
  | "missing-prop"
  /** A value of the wrong kind for a prop. */
  | "wrong-type"
  /** Children given to a component that takes none. */
  | "no-children"
  /** A name no `<state>`, `<derive>`, `<query>` or block declares. */
  | "unknown-name"
  /** A call to a function or a method the language doesn't have. */
  | "unknown-function"
  /** A write to something computed, or a write outside a handler. */
  | "bad-write"
  /** A handler or a binding that isn't written in braces, or binds something that can't be written to. */
  | "bad-handler"
  /** An address the renderer refuses, like `javascript:`. */
  | "blocked-url"
  /** A tool the host doesn't have, or a `<query>` that can't run. */
  | "unknown-tool"
  /** A name declared twice. The first one wins. */
  | "duplicate-name"
  /** An icon, a motion or a chart type that doesn't exist. */
  | "unknown-value"
  /** The interface is inside a code fence, so it is shown as code. */
  | "fenced"
  /** Nothing to draw. */
  | "empty"

export interface Issue {
  code: IssueCode
  /**
   * An `error` means the reader gets something other than what was written:
   * a part missing, a control that does nothing, text where an interface
   * should be. A `warning` means something written is ignored.
   */
  severity: "error" | "warning"
  /** What is wrong, as a sentence. */
  message: string
  /** What to write instead, when that can be said. */
  hint?: string
  /** Line and column in the source as it was given, from 1. */
  line: number
  column: number
  /** The line of source the issue is on, without its indentation. */
  excerpt: string
}

export interface CheckOptions {
  /** What the product adds, as given to the renderer and to `buildSystemPrompt`. */
  library?: Library | LibrarySpec | undefined
  /**
   * The tools the host answers, as given to `buildSystemPrompt`, or their
   * names. Given, a tool the reply names and the host lacks is an error.
   */
  tools?: readonly (string | { name: string })[] | undefined
  /** Components handed to the renderer's `components`, or their names. */
  components?: readonly string[] | Record<string, unknown> | undefined
  /** State the host starts the surface with (`initialState`), or its names. */
  state?: readonly string[] | Record<string, unknown> | undefined
  /** Functions the host adds (`functions`), or their names. */
  functions?: readonly string[] | Record<string, unknown> | undefined
  /** Actions the host adds (`actions`), or their names. */
  actions?: readonly string[] | Record<string, unknown> | undefined
}

export interface CheckResult {
  /** True when nothing is an error. Warnings don't count. */
  ok: boolean
  issues: Issue[]
  errors: number
  warnings: number
}

const ACTIONS = ["send", "call", "refetch", "reset", "open", "copy", "toast"]
const DECLARATIONS = new Set(["state", "derive", "query", "define", "style"])
const PROP_NAME = /^[A-Za-z_][\w:-]*$/
const FENCE = /^[ \t]*```([\w-]*)[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*$/gm
const FENCED_MARKUP = new Set(["", "iui", "html", "xml", "jsx", "tsx", "svelte", "vue", "mdx", "markdown", "md"])

function names(input: readonly (string | { name: string })[] | Record<string, unknown> | undefined): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input.map((item: string | { name: string }) => (typeof item === "string" ? item : item.name))
  }
  return Object.keys(input)
}

/** How many single-character edits turn `a` into `b`, up to `limit`. */
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
        (previous[j - 1] as number) + cost
      )
      current.push(value)
      if (value < best) best = value
    }
    if (best > limit) return limit + 1
    previous = current
  }
  return previous[b.length] as number
}

/** The name in `candidates` closest to `name`, when one is close enough to be a slip. */
function nearest(name: string, candidates: Iterable<string>): string | undefined {
  // Any one-letter name is one edit from any other: too short to guess from.
  if (name.length < 3) return undefined
  const limit = name.length <= 4 ? 1 : name.length <= 8 ? 2 : 3
  const lower = name.toLowerCase()
  let best: string | undefined
  let bestDistance = limit + 1
  for (const candidate of candidates) {
    if (candidate === name) continue
    const other = candidate.toLowerCase()
    const d = other === lower ? 0 : distance(lower, other, limit)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return best
}

/** A column in a line as it was given, from one in the same line without the marks the parser drops. */
function columnIn(line: string | undefined, column: number): number {
  if (!line || !/[\uE000\uE001]/.test(line)) return column
  let kept = 0
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\uE000" || line[i] === "\uE001") continue
    kept++
    if (kept === column) return i + 1
  }
  return column
}

/** Methods and helpers that hand back a new list each time. */
const FRESH_METHODS = new Set(["filter", "map", "flatMap", "flat", "slice", "concat", "toSorted", "toReversed", "with", "split"])
const FRESH_HELPERS = new Set([
  "sortBy",
  "unique",
  "without",
  "toggle",
  "chunk",
  "range",
  "keys",
  "values",
  "entries",
  "groupBy",
  "countBy",
])

/** A value that isn't a function: what `<state>` usually holds. */
function isData(expr: Expr): boolean {
  return expr.type === "Literal" || expr.type === "Template" || expr.type === "Array" || expr.type === "Object"
}

/** Whether an expression makes a new list or object each time, rather than picking one out of state. */
function isFresh(expr: Expr): boolean {
  if (expr.type === "Array" || expr.type === "Object") return true
  if (expr.type !== "Call") return false
  const callee = expr.callee
  if (callee.type === "Ident") return FRESH_HELPERS.has(callee.name)
  return callee.type === "Member" && typeof callee.property === "string" && FRESH_METHODS.has(callee.property)
}

interface PartInfo {
  slug: string
  /** The component the entry is named for. */
  root: string
  parts: string[]
  props: Set<string>
  /** The components this part has to be inside, or null when it stands alone. */
  within: Set<string> | null
}

let catalog: Map<string, PartInfo> | undefined

/** Every UI SDK part, with its props and where it belongs, read once from the catalog. */
function uiSdk(): Map<string, PartInfo> {
  if (catalog) return catalog
  const index = new Map<string, PartInfo>()
  const alone = new Set<string>()
  const inside = new Map<string, Set<string>>()
  for (const entry of UI_SDK_CATALOG) {
    let top = ""
    for (const line of entry.composition.split("\n")) {
      const name = /[A-Z][A-Za-z0-9]*/.exec(line)?.[0]
      if (!name) continue
      if (/^[A-Z]/.test(line)) {
        top = name
        alone.add(name)
      } else if (top) {
        let roots = inside.get(name)
        if (!roots) inside.set(name, (roots = new Set()))
        roots.add(top)
      }
    }
    for (const part of entry.parts) {
      const known = index.get(part)
      const props = new Set((entry.props[part] ?? []).map((prop) => prop.name))
      if (known) {
        for (const prop of props) known.props.add(prop)
        continue
      }
      index.set(part, { slug: entry.slug, root: entry.parts[0] ?? part, parts: entry.parts, props, within: null })
    }
  }
  for (const [name, info] of index) {
    const roots = inside.get(name)
    if (roots && !alone.has(name)) info.within = roots
  }
  catalog = index
  return index
}

class Locals {
  private readonly names = new Set<string>()

  constructor(private readonly parent: Locals | null = null) {}

  add(...names: string[]): this {
    for (const name of names) this.names.add(name)
    return this
  }

  has(name: string): boolean {
    return this.names.has(name) || (this.parent?.has(name) ?? false)
  }

  child(): Locals {
    return new Locals(this)
  }
}

function patternNames(pattern: Pattern): string[] {
  return pattern.type === "Ident" ? [pattern.name] : pattern.names
}

function staticText(value: AttrValue | undefined): string | undefined {
  return value?.kind === "static" && typeof value.value === "string" ? value.value : undefined
}

/** The value an attribute holds when it can be known without running anything. */
function knownValue(value: AttrValue): { known: true; value: unknown } | { known: false } {
  if (value.kind === "static") {
    if (value.value === "true") return { known: true, value: true }
    if (value.value === "false") return { known: true, value: false }
    return { known: true, value: value.value }
  }
  if (value.kind !== "expr") return { known: false }
  return literal(value.expr)
}

function literal(expr: Expr): { known: true; value: unknown } | { known: false } {
  if (expr.type === "Literal") return { known: true, value: expr.value }
  if (expr.type === "Unary" && expr.op === "-" && expr.arg.type === "Literal" && typeof expr.arg.value === "number") {
    return { known: true, value: -expr.arg.value }
  }
  if (expr.type === "Array") {
    const out: unknown[] = []
    for (const item of expr.items) {
      if (item.type === "Spread") return { known: false }
      const value = literal(item)
      if (!value.known) return { known: false }
      out.push(value.value)
    }
    return { known: true, value: out }
  }
  if (expr.type === "Object") {
    const out: Record<string, unknown> = {}
    for (const prop of expr.props) {
      if (prop.type === "Spread" || typeof prop.key !== "string") return { known: false }
      const value = literal(prop.value)
      if (!value.known) return { known: false }
      out[prop.key] = value.value
    }
    return { known: true, value: out }
  }
  return { known: false }
}

function clip(text: string, length = 120): string {
  const line = text.trim()
  return line.length > length ? `${line.slice(0, length - 1)}…` : line
}

/**
 * Reads a reply the way the renderer would and says what is wrong with it,
 * without drawing anything. It needs no browser, so it runs on a server
 * before a reply is sent on, in a test, or when a stream ends.
 *
 * It finds what the renderer reports while drawing (an unknown component, a
 * name nobody declared, a prop a library component doesn't take), and what
 * the renderer can only stay silent about: a prop a primitive ignores, a
 * handler that would fail when pressed, an icon that doesn't exist, markup
 * written as JSX.
 *
 * ```ts
 * const result = checkMarkup(reply, { library, tools })
 * if (!result.ok) messages.push({ role: "user", content: repairMessage(result) })
 * ```
 *
 * Give it what the renderer and the prompt were given. Without `tools`, tool
 * names are not checked.
 */
export function checkMarkup(source: string, options: CheckOptions = {}): CheckResult {
  const { text, lines: skipped } = prepare(source)
  const doc = parse(source)
  const sourceLines = text.split("\n")
  /** The lines as they were given, with the private-use marks the parser drops still in them. */
  const givenLines = source.replace(/\r\n?/g, "\n").split("\n")
  const lineStarts: number[] = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1)

  // An expression that holds tags is shown as text, and so is read in pieces:
  // what those pieces say about names is noise next to the one real problem.
  const unread: [number, number][] = []
  for (const diagnostic of doc.diagnostics) {
    if (diagnostic.code !== "tags-in-expression" && diagnostic.code !== "bad-expression") continue
    const end = text[diagnostic.pos] === "{" ? findClosingBrace(text, diagnostic.pos) : -1
    if (end > diagnostic.pos) unread.push([diagnostic.pos, end])
  }

  const issues: Issue[] = []
  const seen = new Set<string>()
  const add = (
    code: IssueCode,
    severity: Issue["severity"],
    message: string,
    pos: number,
    hint?: string
  ): void => {
    const key = `${code}|${message}|${pos}`
    if (seen.has(key)) return
    if (
      (code === "unknown-name" || code === "unknown-function") &&
      unread.some(([from, to]) => pos > from && pos < to)
    ) {
      return
    }
    seen.add(key)
    let low = 0
    let high = lineStarts.length - 1
    while (low < high) {
      const middle = (low + high + 1) >> 1
      if ((lineStarts[middle] as number) <= pos) low = middle
      else high = middle - 1
    }
    const issue: Issue = {
      code,
      severity,
      message,
      line: low + 1 + skipped,
      column: columnIn(givenLines[low + skipped], pos - (lineStarts[low] as number) + 1),
      excerpt: clip(sourceLines[low] ?? ""),
    }
    if (hint) issue.hint = hint
    issues.push(issue)
  }

  // --- what the host has ---------------------------------------------------

  const library = options.library
  const libraryComponents = new Map<string, ComponentSpec>(
    (library?.components ?? []).map((component) => [component.name, component])
  )
  const hostComponents = new Set(names(options.components))
  const tools = options.tools ? new Set(names(options.tools)) : null
  const hostState = new Set(names(options.state))
  const functions = new Set<string>(names(options.functions))
  const namespaces = new Map<string, Set<string>>()
  for (const [name, value] of Object.entries(createBuiltins())) {
    if (value !== null && typeof value === "object") namespaces.set(name, new Set(Object.keys(value)))
    else functions.add(name)
  }
  const actions = new Set([...ACTIONS, ...names(options.actions)])
  const motions = new Set([
    ...MOTION_PRESET_NAMES,
    ...EXTRA_MOTIONS,
    ...Object.keys(library?.motion?.presets ?? {}),
  ])
  const chartTypes = new Set([
    ...CHART_TYPES,
    ...(library?.charts?.types ?? []),
    ...Object.keys(library?.charts?.extra ?? {}),
  ])

  // --- what the reply declares --------------------------------------------

  const state = new Map<string, number>()
  const derived = new Map<string, number>()
  /** State whose declared value can't be called: a number, a text, a list, an object. */
  const plainState = new Set<string>()
  /** Derived values that are new each time they are computed, so nothing in state is behind them. */
  const freshDerived = new Set<string>()
  const queries = new Map<string, number>()
  const templates = new Map<string, { node: ElementNode; props: Set<string> }>()
  /** Keys that hold a function somewhere in the reply, so `actions.save()` is a call to one. */
  const functionKeys = new Set<string>()

  const noteFunctions = (expr: Expr): void => {
    if (expr.type === "Object") {
      for (const prop of expr.props) {
        if (prop.type === "Spread") continue
        if (typeof prop.key === "string" && prop.value.type === "Arrow") functionKeys.add(prop.key)
        noteFunctions(prop.value)
      }
    } else if (expr.type === "Array") {
      for (const item of expr.items) if (item.type !== "Spread") noteFunctions(item)
    }
  }

  const declare = (nodes: Node[]): void => {
    for (const node of nodes) {
      if (node.type === "if") {
        for (const branch of node.branches) declare(branch.children)
        continue
      }
      if (node.type !== "element") continue
      if (node.origin !== "tag" || node.svg) {
        if (!node.svg) declare(node.children)
        continue
      }
      switch (node.name) {
        case "state":
          for (const attr of node.attrs) {
            if (attr.name === "persist" || attr.name === "...") continue
            if (attr.value.kind === "expr") noteFunctions(attr.value.expr)
            if (!state.has(attr.name) && !derived.has(attr.name) && (attr.value.kind !== "expr" || isData(attr.value.expr))) {
              plainState.add(attr.name)
            }
            if (state.has(attr.name) || derived.has(attr.name)) {
              add(
                "duplicate-name",
                "warning",
                `"${attr.name}" is declared twice; the first one is kept`,
                node.pos
              )
            } else state.set(attr.name, node.pos)
          }
          break
        case "derive":
          for (const attr of node.attrs) {
            if (attr.value.kind !== "expr") {
              add(
                "bad-expression",
                "error",
                `<derive> computes "${attr.name}" from an expression in braces`,
                node.pos,
                `Write ${attr.name}={…}.`
              )
              continue
            }
            if (state.has(attr.name)) {
              add(
                "duplicate-name",
                "warning",
                `"${attr.name}" is both state and derived; the derived value is used and can't be assigned`,
                node.pos
              )
            }
            derived.set(attr.name, node.pos)
            if (isFresh(attr.value.expr)) freshDerived.add(attr.name)
            else freshDerived.delete(attr.name)
          }
          break
        case "query": {
          const id =
            staticText(node.attrs.find((attr) => attr.name === "id")?.value) ??
            staticText(node.attrs.find((attr) => attr.name === "name")?.value)
          if (id === undefined) {
            add(
              "unknown-tool",
              "error",
              "<query> needs an id, so it loads nothing",
              node.pos,
              'Write <query id="orders" tool="orders.list" /> and read orders.data.'
            )
          } else queries.set(id, node.pos)
          break
        }
        case "define": {
          const name = staticText(node.attrs.find((attr) => attr.name === "name")?.value)
          if (name === undefined || !isComponentName(name)) {
            add(
              "unknown-component",
              "error",
              "<define> needs a name in PascalCase, so nothing can use it",
              node.pos,
              'Write <define name="PriceRow" props="label amount">…</define>.'
            )
            break
          }
          const props = new Set(
            (staticText(node.attrs.find((attr) => attr.name === "props")?.value) ?? "")
              .split(/[\s,]+/)
              .filter(Boolean)
              .map((prop) => prop.replace(/\?$/, ""))
          )
          if (node.closed) templates.set(name, { node, props })
          break
        }
        case "style":
          break
        default:
          declare(node.children)
      }
    }
  }
  declare(doc.children)

  // Whatever a use of a template passes is a name inside it, declared or not.
  const uses = (nodes: Node[]): void => {
    for (const node of nodes) {
      if (node.type === "if") for (const branch of node.branches) uses(branch.children)
      else if (node.type === "each") {
        uses(node.children)
        if (node.empty) uses(node.empty)
      } else if (node.type === "element") {
        const template = templates.get(node.name)
        if (template) {
          for (const attr of node.attrs) {
            if (attr.name !== "..." && !attr.name.includes(":")) template.props.add(attr.name)
          }
        }
        uses(node.children)
      }
    }
  }
  uses(doc.children)

  const global = (name: string): "state" | "computed" | "function" | "action" | null => {
    if (derived.has(name) || queries.has(name)) return "computed"
    if (state.has(name) || hostState.has(name)) return "state"
    if (functions.has(name) || namespaces.has(name)) return "function"
    if (actions.has(name)) return "action"
    return null
  }

  const declared = (): string[] => [...state.keys(), ...derived.keys(), ...queries.keys(), ...hostState]

  // --- expressions ---------------------------------------------------------

  type Mode = "render" | "action"

  const unknownName = (name: string, locals: Locals, pos: number, called: boolean): void => {
    const setter = /^set([A-Z]\w*)$/.exec(name)
    const target = setter ? `${(setter[1] as string).charAt(0).toLowerCase()}${(setter[1] as string).slice(1)}` : ""
    if (called && setter && (state.has(target) || locals.has(target))) {
      add(
        "unknown-function",
        "error",
        `"${name}" is not a function: state changes by assigning to it`,
        pos,
        `Write ${target} = … instead of ${name}(…).`
      )
      return
    }
    const other = OTHER_GLOBALS[name]
    // `formatCurrency` and `toPercent` name the function they are after.
    const lower = name.toLowerCase()
    let inside: string | undefined
    if (called) {
      for (const candidate of functions) {
        if (candidate.length < 4 || candidate.length <= (inside?.length ?? 0)) continue
        if (lower.includes(candidate.toLowerCase())) inside = candidate
      }
    }
    const close =
      // A name that is read is most often a declared one misspelt; a helper is only a guess for a call.
      inside ?? nearest(name, called ? [...functions, ...actions] : declared())
    const hint = other
      ? `Use what the language has: ${other}.`
      : close
        ? `Did you mean ${close}?`
        : called
          ? undefined
          : `Declare it first: <state ${name}={…} />.`
    add(
      called ? "unknown-function" : "unknown-name",
      "error",
      called ? `"${name}" is not a function the language has` : `"${name}" is not defined`,
      pos,
      hint
    )
  }

  const checkExpr = (expr: Expr, locals: Locals, mode: Mode, pos: number): void => {
    const write = (what: string): void => {
      if (mode !== "render") return
      add(
        "bad-write",
        "error",
        `${what} can only run from an event handler`,
        pos,
        "Move it into on:click={…} or another handler."
      )
    }
    const visit = (node: Expr, scope: Locals): void => {
      switch (node.type) {
        case "Literal":
          return
        case "Ident":
          if (!scope.has(node.name) && global(node.name) === null) unknownName(node.name, scope, pos, false)
          return
        case "Template":
          for (const item of node.exprs) visit(item, scope)
          return
        case "Array":
          for (const item of node.items) visit(item.type === "Spread" ? item.arg : item, scope)
          return
        case "Object":
          for (const prop of node.props) {
            if (prop.type === "Spread") visit(prop.arg, scope)
            else {
              if (typeof prop.key !== "string") visit(prop.key, scope)
              visit(prop.value, scope)
            }
          }
          return
        case "Member":
          visit(node.object, scope)
          if (typeof node.property !== "string") visit(node.property, scope)
          return
        case "Call": {
          const callee = node.callee
          if (callee.type === "Ident") {
            const name = callee.name
            if (scope.has(name)) {
              // A local that holds a function, such as an arrow kept in a `let`.
            } else {
              const kind = global(name)
              if (kind === null) unknownName(name, scope, pos, true)
              else if (kind === "action") {
                write(`${name}()`)
                checkActionCall(name, node.args, pos)
              } else if (kind === "state" && plainState.has(name)) {
                add(
                  "unknown-function",
                  "error",
                  `"${name}" holds a value, not a function, so it can't be called`,
                  pos,
                  `Read it as ${name}, and change it by assigning to it.`
                )
              }
            }
          } else if (callee.type === "Member") {
            visit(callee.object, scope)
            // `items["push"](x)` is the same call as `items.push(x)`.
            const method =
              typeof callee.property === "string"
                ? callee.property
                : callee.property.type === "Literal" && typeof callee.property.value === "string"
                  ? callee.property.value
                  : undefined
            if (method === undefined) visit(callee.property as Expr, scope)
            else checkMethod(callee.object, method, node.optional || callee.optional, scope, write, pos)
          } else visit(callee, scope)
          for (const arg of node.args) visit(arg.type === "Spread" ? arg.arg : arg, scope)
          return
        }
        case "Unary":
          visit(node.arg, scope)
          return
        case "Binary":
        case "Logical":
          visit(node.left, scope)
          visit(node.right, scope)
          return
        case "Cond":
          visit(node.test, scope)
          visit(node.then, scope)
          visit(node.else, scope)
          return
        case "Arrow": {
          const inner = scope.child()
          for (const param of node.params) inner.add(...patternNames(param))
          visit(node.body, inner)
          return
        }
        case "Assign":
        case "Update": {
          write("A change to state")
          checkTarget(node.target, scope, pos)
          if (node.type === "Assign") visit(node.value, scope)
          return
        }
        case "Block": {
          const inner = scope.child()
          for (const statement of node.body) visit(statement, inner)
          return
        }
        case "If":
          visit(node.test, scope)
          visit(node.then, scope)
          if (node.else) visit(node.else, scope)
          return
        case "Return":
          if (node.arg) visit(node.arg, scope)
          return
        case "Let":
          if (node.init) visit(node.init, scope)
          scope.add(...patternNames(node.pattern))
          return
      }
    }

    const checkTarget = (target: Expr, scope: Locals, at: number): void => {
      if (target.type === "Ident") {
        if (scope.has(target.name)) return
        const kind = global(target.name)
        if (kind === "state") return
        if (kind === "computed") {
          add(
            "bad-write",
            "error",
            `"${target.name}" is computed and can't be assigned`,
            at,
            queries.has(target.name)
              ? `Change what the tool returns with call(…), then refetch("${target.name}").`
              : "Assign the state it is computed from."
          )
        } else if (kind === null) {
          const close = nearest(target.name, declared())
          add(
            "unknown-name",
            "error",
            `"${target.name}" is assigned but never declared`,
            at,
            close ? `Did you mean ${close}?` : `Declare it first: <state ${target.name}={…} />.`
          )
        } else {
          add("bad-write", "error", `"${target.name}" is a function and can't be assigned`, at)
        }
        return
      }
      if (target.type === "Member") {
        let root: Expr = target
        while (root.type === "Member") root = root.object
        // What a derived value picked out of state can be edited there. What a tool returned can't.
        if (root.type === "Ident" && !scope.has(root.name) && queries.has(root.name)) {
          add(
            "bad-write",
            "error",
            `"${root.name}" is what a tool returned and can't be changed here`,
            at,
            `Change it with call(…): every <query> loads again afterwards.`
          )
        } else if (
          target.object.type === "Ident" &&
          !scope.has(target.object.name) &&
          freshDerived.has(target.object.name)
        ) {
          add(
            "bad-write",
            "error",
            `"${target.object.name}" is computed anew each time, so a change to it is lost`,
            at,
            `Keep it in <state ${target.object.name}={…} /> instead of <derive>.`
          )
        }
        visit(target.object, scope)
        if (typeof target.property !== "string") visit(target.property, scope)
        return
      }
      visit(target, scope)
    }

    visit(expr, locals)
  }

  const checkMethod = (
    object: Expr,
    name: string,
    optional: boolean,
    scope: Locals,
    write: (what: string) => void,
    pos: number
  ): void => {
    if (object.type === "Ident" && !scope.has(object.name)) {
      const members = namespaces.get(object.name)
      if (members) {
        if (!members.has(name)) {
          const close = nearest(name, members)
          add(
            "unknown-function",
            "error",
            `${object.name}.${name} is not a function the language has`,
            pos,
            close ? `Did you mean ${object.name}.${close}?` : `${object.name} has: ${[...members].join(", ")}.`
          )
        }
        return
      }
    }
    if (METHOD_NAMES.has(name)) {
      if (MUTATOR_NAMES.has(name)) {
        write(`${name}()`)
        if (object.type === "Ident" && !scope.has(object.name) && freshDerived.has(object.name)) {
          add(
            "bad-write",
            "error",
            `"${object.name}" is computed anew each time, so .${name}() changes nothing`,
            pos,
            `Keep the list in <state> and change it there.`
          )
        }
      }
      return
    }
    if (optional || functionKeys.has(name)) return
    const other = OTHER_METHODS[name]
    const close = nearest(name, METHOD_NAMES)
    add(
      "unknown-function",
      "error",
      `.${name}() is not a method the language has`,
      pos,
      other ? `Write ${other}.` : close ? `Did you mean .${close}()?` : undefined
    )
  }

  const checkActionCall = (name: string, args: (Expr | { type: "Spread"; arg: Expr })[], pos: number): void => {
    const first = args[0]
    const text = first && first.type === "Literal" && typeof first.value === "string" ? first.value : undefined
    if (name === "call" && text !== undefined && tools && !tools.has(text)) {
      add("unknown-tool", "error", `There is no tool named "${text}"`, pos, toolHint(text))
    }
    if (name === "refetch") {
      for (const arg of args) {
        if (arg.type === "Literal" && typeof arg.value === "string" && !queries.has(arg.value)) {
          const close = nearest(arg.value, queries.keys())
          add(
            "unknown-name",
            "error",
            `There is no <query id="${arg.value}"> to load again`,
            pos,
            close
              ? `Did you mean "${close}"?`
              : queries.size
                ? `The queries are: ${[...queries.keys()].join(", ")}.`
                : undefined
          )
        }
      }
    }
    if (name === "reset") {
      for (const arg of args) {
        if (arg.type !== "Literal" || typeof arg.value !== "string") continue
        if (!state.has(arg.value) && !hostState.has(arg.value)) {
          const close = nearest(arg.value, state.keys())
          add(
            "unknown-name",
            "error",
            `There is no state named "${arg.value}" to reset`,
            pos,
            close ? `Did you mean "${close}"?` : undefined
          )
        }
      }
    }
  }

  const toolHint = (name: string): string | undefined => {
    if (!tools) return undefined
    if (tools.size === 0) return "The host has no tools: keep the data in <state>."
    const close = nearest(name, tools)
    return close ? `Did you mean "${close}"?` : `The tools are: ${[...tools].join(", ")}.`
  }

  const checkValue = (value: AttrValue, locals: Locals, mode: Mode, pos: number): void => {
    if (value.kind === "expr") checkExpr(value.expr, locals, mode, pos)
    else if (value.kind === "template") {
      for (const part of value.parts) if (typeof part !== "string") checkExpr(part, locals, "render", pos)
    }
  }

  // --- elements ------------------------------------------------------------

  type Kind = "html" | "svg" | "primitive" | "preset" | "library" | "host" | "template" | "ui-sdk" | "unknown"

  const kindOf = (node: ElementNode): Kind => {
    const { name } = node
    if (isComponentName(name)) {
      if (libraryComponents.has(name)) return "library"
      if (hostComponents.has(name)) return "host"
      if (templates.has(name)) return "template"
      if (Object.hasOwn(PRESET_PROPS, name)) return "preset"
      const part = uiSdk().get(name)
      if (part && !Object.hasOwn(UNSUPPORTED, part.slug)) return "ui-sdk"
      return "unknown"
    }
    if (node.svg) return "svg"
    if (node.origin === "tag" && PRIMITIVE_TAGS.has(name)) return "primitive"
    if (HTML_TAGS.has(name) || SVG_TAGS.has(name)) return SVG_TAGS.has(name) ? "svg" : "html"
    return "unknown"
  }

  const componentHint = (name: string): string | undefined => {
    const part = uiSdk().get(name)
    if (part && Object.hasOwn(UNSUPPORTED, part.slug)) {
      return `It can't be written in markup: ${UNSUPPORTED[part.slug]}.`
    }
    const lower = name.toLowerCase()
    if (PRIMITIVE_TAGS.has(lower)) return `Write <${lower}>, in lower case.`
    if (Object.hasOwn(OTHER_NAMES, lower)) return `Write ${OTHER_NAMES[lower]}.`
    // `TabsContent` is not a part of Tabs, and the parts Tabs does have are the answer.
    let family: PartInfo | undefined
    for (const info of uiSdk().values()) {
      if (name.startsWith(info.root) && (!family || info.root.length > family.root.length)) family = info
    }
    if (family && family.parts.length > 1) {
      const close = nearest(name, family.parts)
      return close
        ? `Did you mean <${close}>? The parts of <${family.root}> are: ${family.parts.join(", ")}.`
        : `The parts of <${family.root}> are: ${family.parts.join(", ")}.`
    }
    const close = nearest(name, [
      ...libraryComponents.keys(),
      ...hostComponents,
      ...templates.keys(),
      ...Object.keys(PRESET_PROPS),
      ...uiSdk().keys(),
    ])
    return close ? `Did you mean <${close}>?` : undefined
  }

  const propHint = (tag: string, name: string, known: Iterable<string>): string | undefined => {
    const lower = name.toLowerCase().replace(/[-_]/g, "")
    const own = OTHER_PROPS_OF[tag]?.[lower]
    if (own) return `Write ${own}.`
    const all = [...known]
    const shared = OTHER_PROPS[lower]
    if (shared && (all.includes(shared) || /[^A-Za-z]/.test(shared))) return `Write ${shared}.`
    const close = nearest(name, all)
    return close ? `Did you mean ${close}?` : undefined
  }

  /** Attributes every kind of element shares. Returns true when `attr` was one of them. */
  const shared = (node: ElementNode, attr: Attr, locals: Locals, kind: Kind): boolean => {
    const { name, value } = attr
    const tag = node.name
    if (name === "...") {
      checkValue(value, locals, "render", node.pos)
      return true
    }
    if (!PROP_NAME.test(name) || name.startsWith("v-")) {
      const vue = name.startsWith("@")
        ? `Write on:${name.slice(1)}={…}.`
        : name.startsWith(":")
          ? `Write ${name.slice(1)}={…}.`
          : name === "v-if" || name === "v-show"
            ? "Wrap it in {#if …}…{/if}, or write show={…}."
            : name === "v-for"
              ? "Wrap it in {#each list as item}…{/each}."
              : name.startsWith("v-model")
                ? "Write bind:value={…}."
                : name.startsWith("#")
                  ? "Write let:name on the component to name what it passes to its children."
                  : undefined
      add("unknown-prop", "error", `<${tag}> can't take "${name}", which is not an attribute name here`, node.pos, vue)
      return true
    }
    const colon = name.indexOf(":")
    const directive = colon > 0 ? name.slice(0, colon) : ""
    const argument = colon > 0 ? name.slice(colon + 1) : ""

    // `onclick` is a handler on an element; on a product's component it may be a prop like any other.
    const ownComponent = kind === "library" || kind === "host"
    if (directive === "on" || /^on[A-Z]/.test(name) || (/^on[a-z]/.test(name) && !ownComponent)) {
      const event = directive === "on" ? argument : name.slice(2)
      if (value.kind !== "expr") {
        add(
          "bad-handler",
          "error",
          `<${tag}> has a handler that is not in braces, so it does nothing`,
          node.pos,
          `Write on:${event.charAt(0).toLowerCase()}${event.slice(1)}={…}.`
        )
        return true
      }
      const scope = locals.child()
      if (value.expr.type !== "Arrow") scope.add("$event", "$value")
      checkExpr(value.expr, scope, "action", node.pos)
      return true
    }
    if (directive === "bind") {
      if (value.kind !== "expr" || (value.expr.type !== "Ident" && value.expr.type !== "Member")) {
        add(
          "bad-handler",
          "error",
          `bind:${argument} on <${tag}> needs a state name or a path in braces`,
          node.pos,
          `Write bind:${argument}={name}, or bind:${argument}={form.email}.`
        )
        if (value.kind === "expr") checkExpr(value.expr, locals, "render", node.pos)
        return true
      }
      // A bound path is written to: it has to be state, or reach state through a loop item.
      const scope = locals.child().add("$next")
      checkExpr(
        { type: "Assign", op: "=", target: value.expr, value: { type: "Ident", name: "$next" } },
        scope,
        "action",
        node.pos
      )
      const element = kind === "html" || kind === "svg"
      if (element && argument !== "value" && argument !== "checked" && argument !== "open") {
        add(
          "unknown-prop",
          "error",
          `<${tag}> can only bind value, checked or open, so bind:${argument} does nothing`,
          node.pos
        )
      }
      return true
    }
    if (directive === "let") return true
    if (directive === "class" || directive === "style") {
      checkValue(value, locals, "render", node.pos)
      return true
    }
    if (UNIVERSAL.has(name) || name.startsWith("aria-") || name.startsWith("data-")) {
      checkValue(value, locals, "render", node.pos)
      if (name === "motion") {
        const motion = staticText(value)
        if (motion !== undefined && !motions.has(motion)) {
          const close = nearest(motion, motions)
          add(
            "unknown-value",
            "warning",
            `motion="${motion}" is not a motion the surface has, so nothing plays`,
            node.pos,
            close ? `Did you mean "${close}"?` : `Use one of: ${[...motions].join(", ")}.`
          )
        }
      }
      return true
    }
    if (BLOCKED_PROPS.has(name)) {
      add("unknown-prop", "warning", `"${name}" on <${tag}> is never passed on`, node.pos)
      return true
    }
    return false
  }

  const checkUrl = (node: ElementNode, attr: Attr): void => {
    const lower = attr.name.toLowerCase()
    if (lower !== "href" && lower !== "src" && lower !== "poster") return
    const text = staticText(attr.value)
    if (text === undefined || text === "") return
    if (safeUrl(text, lower === "href" ? "link" : "media") === null) {
      add(
        "blocked-url",
        "error",
        `${attr.name}="${clip(text, 60)}" on <${node.name}> is not an address a surface may use, so it is dropped`,
        node.pos,
        lower === "href"
          ? "Use an https:, mailto: or tel: address, or on:click={…} for something that happens here."
          : "Use an https: address."
      )
    }
  }

  const checkIcon = (node: ElementNode, attr: Attr | undefined): void => {
    const text = staticText(attr?.value)
    if (text === undefined) return
    const name = iconName(text)
    if (name === null || ICON_NAMES.has(name)) return
    // `rocket-launch` is another set's name for `rocket`: a word of it is often the icon.
    const words = name.split("-")
    const close =
      nearest(name, ICON_NAMES) ??
      words.find((word) => ICON_NAMES.has(word)) ??
      [...ICON_NAMES].find((icon) => icon.startsWith(`${words[0]}-`))
    add(
      "unknown-value",
      "warning",
      `There is no icon named "${text}", so nothing is drawn`,
      node.pos,
      close ? `Did you mean "${close}"?` : "Use a Lucide icon name, such as arrow-right, check or calendar."
    )
  }

  /** Whether a spread could bring the prop: yes when its keys aren't all written out. */
  const spreads = (expr: Expr, prop: string): boolean =>
    expr.type !== "Object" ||
    expr.props.some((item) => item.type === "Spread" || typeof item.key !== "string" || item.key === prop)

  const given = (node: ElementNode, prop: string): boolean =>
    node.attrs.some(
      (attr) =>
        attr.name === prop ||
        attr.name === `bind:${prop}` ||
        (attr.name === "..." && (attr.value.kind !== "expr" || spreads(attr.value.expr, prop)))
    )

  const checkElement = (node: ElementNode, locals: Locals, within: string[], inTemplate: boolean): void => {
    const tag = node.name
    const kind = kindOf(node)
    const at = node.pos

    if (kind === "unknown" && isComponentName(tag)) {
      add(
        "unknown-component",
        "error",
        `<${tag}> is not a known component, so only what is inside it is shown`,
        at,
        componentHint(tag)
      )
    }

    const info = kind === "ui-sdk" ? uiSdk().get(tag) : undefined
    if (info?.within && !inTemplate && !within.some((name) => info.within?.has(name))) {
      const roots = [...info.within]
      add(
        "misplaced-part",
        "error",
        `<${tag}> only works inside <${roots.join("> or <")}>`,
        at,
        `Put it inside <${roots[0]}>…</${roots[0]}>.`
      )
    }

    const spec = kind === "library" ? libraryComponents.get(tag) : undefined
    const ignored = (prop: string) => `<${tag}> doesn't have the prop "${prop}", so it is ignored`
    const preset = kind === "preset" ? PRESET_PROPS[tag] : undefined
    const primitive = kind === "primitive" ? PRIMITIVE_PROPS[tag] : undefined

    for (const attr of node.attrs) {
      const { name, value } = attr
      if (spec?.strict && name !== "..." && PROP_NAME.test(name) && !acceptsAttribute(spec, name)) {
        const what = name.startsWith("on:")
          ? `the event "${name.slice(3)}"`
          : name.startsWith("bind:")
            ? `a bindable prop "${name.slice(5)}"`
            : `the prop "${name}"`
        const candidates = name.startsWith("on:")
          ? spec.events.map((event) => `on:${event.name}`)
          : name.startsWith("bind:")
            ? spec.props.filter((prop) => prop.bindable).map((prop) => `bind:${prop.name}`)
            : spec.props.map((prop) => prop.name)
        const close = nearest(name, candidates)
        add(
          "unknown-prop",
          name.includes(":") ? "error" : "warning",
          `<${tag}> doesn't have ${what}, so it is dropped`,
          at,
          close ? `Did you mean ${close}?` : candidates.length ? `It has: ${candidates.join(", ")}.` : undefined
        )
      }
      if (shared(node, attr, locals, kind)) continue
      checkValue(value, locals, "render", at)
      checkUrl(node, attr)

      if (spec?.strict) {
        const prop = spec.props.find((item) => item.name === name)
        const known = knownValue(value)
        if (prop && known.known) {
          const checked = checkProp(prop, known.value)
          if (!checked.ok) {
            add("wrong-type", "error", `<${tag}> takes ${checked.expected} for "${name}", so it is dropped`, at)
          }
        }
      } else if (preset) {
        if (!preset.props.has(name) && !(tag === "Chart" && library?.charts)) {
          add("unknown-prop", "warning", ignored(name), at, propHint(tag, name, preset.props))
        }
      } else if (primitive) {
        if (tag === "card" && name === "title") {
          add(
            "unknown-prop",
            "warning",
            "title on <card> is a tooltip, not a heading",
            at,
            "Put a <title> inside the card."
          )
        } else if (!primitive.has(name)) {
          add("unknown-prop", "warning", ignored(name), at, propHint(tag, name, primitive))
        }
      } else if (kind === "html") {
        if (!isHtmlAttribute(name.toLowerCase())) {
          add("unknown-prop", "warning", `<${tag}> can't take "${name}", so it is dropped`, at)
        }
      }
    }

    // Events a preset or a UI SDK part doesn't report.
    for (const attr of node.attrs) {
      if (!attr.name.startsWith("on:")) continue
      const event = attr.name.slice(3)
      if (preset && !preset.events.includes(event) && !DOM_EVENTS.has(event.toLowerCase())) {
        add(
          "unknown-prop",
          "error",
          `<${tag}> doesn't have the event "${event}", so the handler never runs`,
          at,
          preset.events.length ? `It has: ${preset.events.map((item) => `on:${item}`).join(", ")}.` : undefined
        )
      }
    }

    if (spec?.strict) {
      for (const prop of spec.props) {
        if (prop.required && prop.default === undefined && !given(node, prop.name)) {
          add("missing-prop", "error", `<${tag}> needs "${prop.name}"`, at, `Write ${prop.name}={…}: ${prop.type}.`)
        }
      }
      if (!spec.children && node.children.some((child) => child.type !== "text" || child.value.trim() !== "")) {
        add("no-children", "warning", `<${tag}> takes nothing between its tags, so what is there is not shown`, at)
      }
    }
    if (preset) {
      for (const prop of preset.needs) {
        if (!given(node, prop)) {
          add("missing-prop", "warning", `<${tag}> has no "${prop}", so it has nothing to show`, at)
        }
      }
      if (tag === "Chart") {
        const type = staticText(node.attrs.find((attr) => attr.name === "type")?.value)
        if (type !== undefined && !chartTypes.has(type)) {
          const close = nearest(type, chartTypes)
          add(
            "unknown-value",
            "warning",
            `There is no chart of type "${type}", so a bar chart is drawn`,
            at,
            close ? `Did you mean "${close}"?` : `The types are: ${[...chartTypes].join(", ")}.`
          )
        }
      }
      if (tag === "Stat") checkIcon(node, node.attrs.find((attr) => attr.name === "icon"))
    }
    if (kind === "primitive") {
      if (tag === "icon") {
        if (!given(node, "name")) add("missing-prop", "warning", `<icon> has no "name", so nothing is drawn`, at)
        checkIcon(node, node.attrs.find((attr) => attr.name === "name"))
      }
      if (tag === "list-item") checkIcon(node, node.attrs.find((attr) => attr.name === "icon"))
    }
  }

  // --- the tree ------------------------------------------------------------

  let drawn = false

  const walk = (nodes: Node[], scope: Locals, within: string[], inTemplate: boolean): void => {
    let locals = scope
    for (const node of nodes) {
      switch (node.type) {
        case "text":
          if (node.value.trim()) drawn = true
          break
        case "expr":
          drawn = true
          checkExpr(node.expr, locals, "render", node.pos)
          break
        case "const":
          checkExpr(node.expr, locals, "render", node.pos)
          // A `{@const}` is visible to the siblings that follow it.
          if (locals === scope) locals = scope.child()
          locals.add(...patternNames(node.pattern))
          break
        case "if":
          for (const branch of node.branches) {
            if (branch.test) checkExpr(branch.test, locals, "render", node.pos)
            walk(branch.children, locals, within, inTemplate)
          }
          break
        case "each": {
          checkExpr(node.list, locals, "render", node.pos)
          const inner = locals.child().add(...patternNames(node.pattern))
          if (node.index) inner.add(node.index)
          if (node.key) checkExpr(node.key, inner, "render", node.pos)
          walk(node.children, inner, within, inTemplate)
          if (node.empty) walk(node.empty, locals, within, inTemplate)
          break
        }
        case "element": {
          const tagged = node.origin === "tag"
          if (tagged && !node.svg && DECLARATIONS.has(node.name)) {
            declaration(node)
            break
          }
          if (tagged && !node.svg && node.name === "slot") {
            if (!inTemplate) {
              add("unknown-component", "warning", "<slot> outside a <define> shows nothing", node.pos)
            }
            break
          }
          drawn = true
          checkElement(node, locals, within, inTemplate)
          const inner = locals.child()
          for (const attr of node.attrs) {
            if (!attr.name.startsWith("let:")) continue
            const alias = attr.value.kind === "expr" && attr.value.expr.type === "Ident" ? attr.value.expr.name : null
            inner.add(alias ?? attr.name.slice(4))
          }
          walk(node.children, inner, isComponentName(node.name) ? [...within, node.name] : within, inTemplate)
          break
        }
      }
    }
  }

  const root = new Locals()

  const declaration = (node: ElementNode): void => {
    switch (node.name) {
      case "state":
      case "derive":
        for (const attr of node.attrs) checkValue(attr.value, root, "render", node.pos)
        break
      case "query": {
        for (const attr of node.attrs) checkValue(attr.value, root, "render", node.pos)
        const tool = node.attrs.find((attr) => attr.name === "tool")
        const name = staticText(tool?.value)
        if (!tool) {
          add(
            "unknown-tool",
            "error",
            "<query> needs a tool, so it loads nothing",
            node.pos,
            'Write tool="orders.list".'
          )
        } else if (name !== undefined && tools && !tools.has(name)) {
          add("unknown-tool", "error", `There is no tool named "${name}"`, node.pos, toolHint(name))
        }
        break
      }
      case "define": {
        const name = staticText(node.attrs.find((attr) => attr.name === "name")?.value)
        const template = name === undefined ? undefined : templates.get(name)
        const locals = new Locals().add(...(template?.props ?? []))
        // A definition shows nothing until it is used.
        const before = drawn
        walk(node.children, locals, [], true)
        drawn = before
        break
      }
    }
  }

  walk(doc.children, root, [], false)

  // --- the reply as a whole ------------------------------------------------

  for (const diagnostic of doc.diagnostics) {
    const tag = /^<([A-Za-z][\w-]*)>/.exec(diagnostic.message)?.[1]
    const other = diagnostic.code === "unknown-tag" && tag ? OTHER_NAMES[tag.toLowerCase()] : undefined
    add(
      diagnostic.code,
      // What was never closed is closed for the reader, but it usually means the reply was cut short.
      diagnostic.code === "unclosed-element" ||
        diagnostic.code === "unknown-tag" ||
        diagnostic.code === "blocked-tag"
        ? "error"
        : diagnostic.severity,
      diagnostic.message,
      diagnostic.pos,
      other
        ? `Write ${other}.`
        : diagnostic.code === "unclosed-element"
          ? "Close it. If the reply was cut short, write it again, shorter."
          : diagnostic.code === "blocked-tag"
            ? "Leave it out: state, handlers and <query> do what a script would."
            : undefined
    )
  }

  FENCE.lastIndex = 0
  for (let fence = FENCE.exec(text); fence; fence = FENCE.exec(text)) {
    const [, language = "", body = ""] = fence
    if (!FENCED_MARKUP.has(language.toLowerCase())) continue
    const tags = [...body.matchAll(/<([A-Za-z][\w-]*)[\s/>]/g)].map((match) => match[1] as string)
    const ours = tags.filter(
      (tag) => PRIMITIVE_TAGS.has(tag) || DECLARATIONS.has(tag) || Object.hasOwn(PRESET_PROPS, tag) || uiSdk().has(tag)
    )
    // Two tags of ours, or a fence that is one element of ours from start to end. One tag in a sample of something else is not an interface.
    const whole = /^<([A-Za-z][\w-]*)[\s\S]*>$/.exec(body.trim())?.[1]
    if (ours.length < 2 && !(whole !== undefined && ours[0] === whole)) continue
    add(
      "fenced",
      "error",
      "The interface is inside a code fence, so the reader sees its source instead of the interface",
      fence.index,
      "Write the markup as it is, with no ``` around it."
    )
  }

  if (!drawn && !issues.some((issue) => issue.severity === "error")) {
    add("empty", "error", "The reply draws nothing", 0, "Write what the reader should see, after the declarations.")
  }

  issues.sort((a, b) => a.line - b.line || a.column - b.column)
  const errors = issues.filter((issue) => issue.severity === "error").length
  return { ok: errors === 0, issues, errors, warnings: issues.length - errors }
}
