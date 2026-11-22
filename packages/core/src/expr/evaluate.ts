import { type Expr, ExprRuntimeError, type Pattern, type Spread } from "./ast"

type AnyFn = (...args: unknown[]) => unknown

const MAX_STEPS = 200_000
const MAX_DEPTH = 96
const MAX_STRING = 200_000
const MAX_ARRAY = 100_000
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

/**
 * Functions the interpreter may call. Arrow functions it creates and the
 * built-ins a host registers are in here; nothing else is ever invoked.
 */
const callables = new WeakSet<object>()

/** Marks functions as safe to call from expressions. */
export function registerCallable<T extends AnyFn>(fn: T): T {
  callables.add(fn)
  return fn
}

/**
 * Builds a namespace such as `Math`: an object with no prototype whose
 * functions are callable from expressions.
 */
export function createNamespace(
  members: Record<string, unknown>
): Record<string, unknown> {
  const namespace = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(members)) {
    namespace[key] =
      typeof value === "function" ? registerCallable(value as AnyFn) : value
  }
  return Object.freeze(namespace)
}

export interface EvalHost {
  /** Looks a name up outside local scopes: state, derived values and queries. */
  lookup(name: string): { found: boolean; value?: unknown }
  /** Writes a state variable. Called only while an action runs. */
  assign(name: string, value: unknown): void
  /**
   * Swaps an object or list held somewhere in state for an edited copy,
   * finding it by identity. Returns whether it was found.
   */
  replace?(previous: object, next: unknown): boolean
  /** Pure functions and namespaces, available everywhere. */
  functions: Record<string, unknown>
  /** Functions with side effects, available only while an action runs. */
  actions?: Record<string, AnyFn>
  /** Reports a problem that didn't stop evaluation, like an unknown name. */
  warn?(message: string): void
}

interface Alias {
  expr: Expr
  scope: Scope
}

/** A chain of local variables: loop items, arrow parameters and `const`s. */
export class Scope {
  readonly parent: Scope | undefined
  private readonly vars = new Map<string, unknown>()
  private aliases: Map<string, Alias> | undefined

  constructor(parent?: Scope) {
    this.parent = parent
  }

  /**
   * Declares a variable. An alias says which expression in the parent scope
   * the variable stands for, so `todo.done = true` inside a loop can write
   * through to `todos[2].done`.
   */
  declare(name: string, value: unknown, alias?: Alias): this {
    this.vars.set(name, value)
    if (alias) {
      this.aliases ??= new Map()
      this.aliases.set(name, alias)
    }
    return this
  }

  owner(name: string): Scope | undefined {
    let scope: Scope | undefined = this
    while (scope) {
      if (scope.vars.has(name)) return scope
      scope = scope.parent
    }
    return undefined
  }

  read(name: string): unknown {
    return this.vars.get(name)
  }

  write(name: string, value: unknown): void {
    this.vars.set(name, value)
  }

  aliasOf(name: string): Alias | undefined {
    return this.aliases?.get(name)
  }

  child(): Scope {
    return new Scope(this)
  }
}

interface Env {
  host: EvalHost
  mode: "render" | "action"
  steps: number
  depth: number
  active: number
}

const RETURN = Symbol("return")
interface ReturnBox {
  [RETURN]: true
  value: unknown
}

function isReturn(value: unknown): value is ReturnBox {
  return typeof value === "object" && value !== null && RETURN in value
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function isCallable(value: unknown): value is AnyFn {
  return typeof value === "function" && callables.has(value)
}

function requireCallback(value: unknown, method: string): AnyFn {
  if (!isCallable(value)) {
    throw new ExprRuntimeError(`${method} needs a function`)
  }
  return value
}

function checkSize(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_STRING) {
    throw new ExprRuntimeError("Text is too long")
  }
  if (Array.isArray(value) && value.length > MAX_ARRAY) {
    throw new ExprRuntimeError("List is too long")
  }
  return value
}

function defaultCompare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b
  if (a == null) return b == null ? 0 : 1
  if (b == null) return -1
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

type Method<T> = (self: T, ...args: unknown[]) => unknown

const ARRAY_METHODS: Record<string, Method<unknown[]>> = {
  map: (self, fn) => self.map(requireCallback(fn, "map")),
  filter: (self, fn) => self.filter(requireCallback(fn, "filter")),
  find: (self, fn) => self.find(requireCallback(fn, "find")),
  findIndex: (self, fn) => self.findIndex(requireCallback(fn, "findIndex")),
  findLast: (self, fn) => self.findLast(requireCallback(fn, "findLast")),
  findLastIndex: (self, fn) =>
    self.findLastIndex(requireCallback(fn, "findLastIndex")),
  some: (self, fn) => self.some(requireCallback(fn, "some")),
  every: (self, fn) => self.every(requireCallback(fn, "every")),
  forEach: (self, fn) => self.forEach(requireCallback(fn, "forEach")),
  flatMap: (self, fn) =>
    self.flatMap(requireCallback(fn, "flatMap") as () => unknown),
  reduce: (self, fn, ...rest) => {
    const reducer = requireCallback(fn, "reduce")
    return rest.length > 0
      ? self.reduce((acc, item, i) => reducer(acc, item, i), rest[0])
      : self.reduce((acc, item, i) => reducer(acc, item, i))
  },
  includes: (self, item) => self.includes(item),
  indexOf: (self, item) => self.indexOf(item),
  lastIndexOf: (self, item) => self.lastIndexOf(item),
  slice: (self, start, end) =>
    self.slice(start as number | undefined, end as number | undefined),
  concat: (self, ...rest) => self.concat(...rest),
  join: (self, separator) =>
    self.join(separator === undefined ? "," : String(separator)),
  flat: (self, depth) => self.flat(Math.min(Number(depth ?? 1), 8)),
  at: (self, index) => self.at(Number(index)),
  with: (self, index, value) => {
    const copy = self.slice()
    const i = Number(index)
    copy[i < 0 ? copy.length + i : i] = value
    return copy
  },
  sort: (self, fn) =>
    self
      .slice()
      .sort(
        fn === undefined
          ? defaultCompare
          : (requireCallback(fn, "sort") as (a: unknown, b: unknown) => number)
      ),
  toSorted: (self, fn) => ARRAY_METHODS.sort!(self, fn),
  reverse: (self) => self.slice().reverse(),
  toReversed: (self) => self.slice().reverse(),
}

const MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice"])

const STRING_METHODS: Record<string, Method<string>> = {
  toUpperCase: (self) => self.toUpperCase(),
  toLowerCase: (self) => self.toLowerCase(),
  trim: (self) => self.trim(),
  trimStart: (self) => self.trimStart(),
  trimEnd: (self) => self.trimEnd(),
  split: (self, separator, limit) =>
    self.split(
      separator === undefined ? (undefined as never) : String(separator),
      limit as number | undefined
    ),
  includes: (self, search) => self.includes(String(search)),
  startsWith: (self, search) => self.startsWith(String(search)),
  endsWith: (self, search) => self.endsWith(String(search)),
  indexOf: (self, search) => self.indexOf(String(search)),
  lastIndexOf: (self, search) => self.lastIndexOf(String(search)),
  slice: (self, start, end) =>
    self.slice(start as number | undefined, end as number | undefined),
  substring: (self, start, end) =>
    self.substring(start as number, end as number | undefined),
  replace: (self, search, replacement) =>
    self.replace(String(search), () => String(replacement ?? "")),
  replaceAll: (self, search, replacement) =>
    self.replaceAll(String(search), () => String(replacement ?? "")),
  padStart: (self, length, fill) =>
    self.padStart(
      Math.min(Number(length), 1000),
      fill === undefined ? " " : String(fill)
    ),
  padEnd: (self, length, fill) =>
    self.padEnd(
      Math.min(Number(length), 1000),
      fill === undefined ? " " : String(fill)
    ),
  repeat: (self, count) => {
    const times = Math.max(0, Math.floor(Number(count)))
    if (times * self.length > MAX_STRING) {
      throw new ExprRuntimeError("Text is too long")
    }
    return self.repeat(times)
  },
  charAt: (self, index) => self.charAt(Number(index)),
  at: (self, index) => self.at(Number(index)),
  concat: (self, ...rest) => self.concat(...rest.map(String)),
  localeCompare: (self, other) => self.localeCompare(String(other)),
}

const NUMBER_METHODS: Record<string, Method<number>> = {
  toFixed: (self, digits) =>
    self.toFixed(Math.min(Math.max(Number(digits ?? 0), 0), 20)),
  toPrecision: (self, digits) =>
    digits === undefined
      ? self.toPrecision()
      : self.toPrecision(Math.min(Math.max(Number(digits), 1), 21)),
  toString: (self: number, radix: unknown) =>
    self.toString(radix === undefined ? 10 : Number(radix)),
  toLocaleString: (self: number, locale: unknown, options: unknown) =>
    self.toLocaleString(
      typeof locale === "string" ? locale : undefined,
      isPlainObject(options) ? (options as Intl.NumberFormatOptions) : undefined
    ),
}

function methodOf(target: unknown, key: string): Method<never> | undefined {
  const table = Array.isArray(target)
    ? ARRAY_METHODS
    : typeof target === "string"
      ? STRING_METHODS
      : typeof target === "number"
        ? NUMBER_METHODS
        : undefined
  if (table && Object.hasOwn(table, key)) return table[key] as Method<never>
  return undefined
}

function getMember(target: unknown, key: unknown): unknown {
  if (target == null) return undefined
  if (typeof key === "symbol") return undefined
  const name = String(key)
  if (FORBIDDEN_KEYS.has(name)) return undefined
  if (Array.isArray(target)) {
    if (name === "length") return target.length
    const index = typeof key === "number" ? key : Number(name)
    return Number.isInteger(index) ? target[index] : undefined
  }
  if (typeof target === "string") {
    if (name === "length") return target.length
    const index = typeof key === "number" ? key : Number(name)
    return Number.isInteger(index) ? target[index] : undefined
  }
  if (isPlainObject(target)) {
    return Object.hasOwn(target, name) ? target[name] : undefined
  }
  return undefined
}

function bindPattern(
  pattern: Pattern,
  value: unknown,
  scope: Scope,
  alias?: Alias
): void {
  if (pattern.type === "Ident") {
    scope.declare(pattern.name, value, alias)
    return
  }
  pattern.names.forEach((name, index) => {
    const key = pattern.type === "ObjectPattern" ? name : index
    scope.declare(
      name,
      getMember(value, key),
      alias && {
        scope: alias.scope,
        expr: {
          type: "Member",
          object: alias.expr,
          property:
            typeof key === "number" ? { type: "Literal", value: key } : key,
          computed: typeof key === "number",
          optional: false,
        },
      }
    )
  })
}

/**
 * Declares a loop variable (or a destructured one) in `scope`. `source` is the
 * expression the value came from, evaluated in `sourceScope`, when writes to
 * the variable should reach it.
 */
export function declarePattern(
  scope: Scope,
  pattern: Pattern,
  value: unknown,
  source?: { expr: Expr; scope: Scope }
): void {
  bindPattern(pattern, value, scope, source)
}

function evalArgs(
  args: (Expr | Spread)[],
  scope: Scope,
  env: Env
): unknown[] {
  const out: unknown[] = []
  for (const arg of args) {
    if (arg.type === "Spread") {
      const value = evalNode(arg.arg, scope, env)
      if (Array.isArray(value)) out.push(...value)
    } else {
      out.push(evalNode(arg, scope, env))
    }
  }
  return out
}

function toText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return ""
    }
  }
  return String(value)
}

function binary(op: string, a: unknown, b: unknown): unknown {
  switch (op) {
    case "+":
      if (typeof a === "string" || typeof b === "string") {
        return checkSize(toText(a) + toText(b))
      }
      return (a as number) + (b as number)
    case "-":
      return (a as number) - (b as number)
    case "*":
      return (a as number) * (b as number)
    case "/":
      return (a as number) / (b as number)
    case "%":
      return (a as number) % (b as number)
    case "**":
      return (a as number) ** (b as number)
    case "==":
      return a == b
    case "!=":
      return a != b
    case "===":
      return a === b
    case "!==":
      return a !== b
    case "<":
      return (a as number) < (b as number)
    case ">":
      return (a as number) > (b as number)
    case "<=":
      return (a as number) <= (b as number)
    case ">=":
      return (a as number) >= (b as number)
    default:
      throw new ExprRuntimeError(`Unknown operator ${op}`)
  }
}

/** Whether writing to this expression can follow its path back to state. */
function isPath(target: Expr, scope: Scope): boolean {
  if (target.type === "Member") return isPath(target.object, scope)
  if (target.type !== "Ident") return false
  const owner = scope.owner(target.name)
  if (!owner) return true
  const alias = owner.aliasOf(target.name)
  return alias ? isPath(alias.expr, alias.scope) : false
}

function isContainer(value: unknown): value is object {
  return Array.isArray(value) || isPlainObject(value)
}

/**
 * Writes `value` where `target` points. `previous` is the object or list the
 * target held, when the write replaces one with an edited copy: a target
 * without a path back to state (a component prop, an item of a filtered
 * list) is then found in state by identity.
 */
function assignTo(
  target: Expr,
  value: unknown,
  scope: Scope,
  env: Env,
  previous?: unknown
): void {
  if (env.mode !== "action") {
    throw new ExprRuntimeError("State can only change from an event handler")
  }
  const replace = (): boolean =>
    isContainer(previous) && (env.host.replace?.(previous, value) ?? false)
  if (target.type === "Ident") {
    const owner = scope.owner(target.name)
    if (owner) {
      const alias = owner.aliasOf(target.name)
      if (alias && isPath(alias.expr, alias.scope)) {
        assignTo(alias.expr, value, alias.scope, env)
      } else if (!replace() && alias) {
        throw new ExprRuntimeError(
          `Can't write to "${target.name}": it comes from a computed list`
        )
      }
      owner.write(target.name, value)
      return
    }
    env.host.assign(target.name, value)
    return
  }
  if (target.type === "Member") {
    if (!isPath(target, scope) && replace()) return
    const container = evalNode(target.object, scope, env)
    const key =
      typeof target.property === "string"
        ? target.property
        : evalNode(target.property, scope, env)
    if (typeof key !== "string" && typeof key !== "number") {
      throw new ExprRuntimeError("Invalid property name")
    }
    if (FORBIDDEN_KEYS.has(String(key))) {
      throw new ExprRuntimeError("Invalid property name")
    }
    let next: unknown
    if (Array.isArray(container)) {
      const index = Number(key)
      if (!Number.isInteger(index) || index < 0 || index > MAX_ARRAY) {
        throw new ExprRuntimeError("Invalid list index")
      }
      const copy = container.slice()
      copy[index] = value
      next = copy
    } else if (isPlainObject(container)) {
      next = { ...container, [key]: value }
    } else if (container == null) {
      next = typeof key === "number" ? [] : {}
      ;(next as Record<string | number, unknown>)[key] = value
    } else {
      throw new ExprRuntimeError("Cannot set a property on this value")
    }
    assignTo(target.object, next, scope, env, container)
    return
  }
  if (replace()) return
  throw new ExprRuntimeError("Invalid assignment target")
}

function lookupIdent(name: string, scope: Scope, env: Env): unknown {
  const owner = scope.owner(name)
  if (owner) return owner.read(name)
  const hit = env.host.lookup(name)
  if (hit.found) return hit.value
  if (Object.hasOwn(env.host.functions, name)) return env.host.functions[name]
  if (env.host.actions && Object.hasOwn(env.host.actions, name)) {
    return env.host.actions[name]
  }
  env.host.warn?.(`"${name}" is not defined`)
  return undefined
}

function callFunction(
  fn: unknown,
  args: unknown[],
  label: string,
  env: Env
): unknown {
  if (!isCallable(fn)) {
    throw new ExprRuntimeError(`${label} is not a function`)
  }
  if (
    env.mode !== "action" &&
    env.host.actions &&
    Object.values(env.host.actions).includes(fn)
  ) {
    throw new ExprRuntimeError(
      `${label}() can only run from an event handler`
    )
  }
  return checkSize(fn(...args))
}

function runBlock(
  body: Expr[],
  scope: Scope,
  env: Env,
  start: number
): unknown {
  let last: unknown
  for (let i = start; i < body.length; i++) {
    const statement = body[i]!
    if (statement.type === "Let") {
      const value = statement.init
        ? evalNode(statement.init, scope, env)
        : undefined
      if (env.mode === "action" && isThenable(value)) {
        return value.then((resolved) => {
          bindPattern(statement.pattern, resolved, scope)
          return runBlock(body, scope, env, i + 1)
        })
      }
      bindPattern(statement.pattern, value, scope)
      last = undefined
      continue
    }
    const value = evalNode(statement, scope, env)
    if (isReturn(value)) return value
    if (env.mode === "action" && isThenable(value)) {
      return value.then((resolved) => {
        if (isReturn(resolved)) return resolved
        return i + 1 < body.length
          ? runBlock(body, scope, env, i + 1)
          : resolved
      })
    }
    last = value
  }
  return last
}

function unwrapReturn(value: unknown): unknown {
  if (isReturn(value)) return value.value
  if (isThenable(value)) {
    return value.then((resolved) =>
      isReturn(resolved) ? resolved.value : resolved
    )
  }
  return value
}

function evalNode(node: Expr, scope: Scope, env: Env): unknown {
  if (++env.steps > MAX_STEPS) {
    throw new ExprRuntimeError("Expression took too long")
  }
  switch (node.type) {
    case "Literal":
      return node.value
    case "Ident":
      return lookupIdent(node.name, scope, env)
    case "Template": {
      let out = node.quasis[0] ?? ""
      node.exprs.forEach((expr, index) => {
        out += toText(evalNode(expr, scope, env))
        out += node.quasis[index + 1] ?? ""
      })
      return checkSize(out)
    }
    case "Array": {
      const out: unknown[] = []
      for (const item of node.items) {
        if (item.type === "Spread") {
          const value = evalNode(item.arg, scope, env)
          if (Array.isArray(value)) out.push(...value)
          else if (typeof value === "string") out.push(...value)
        } else {
          out.push(evalNode(item, scope, env))
        }
      }
      return checkSize(out)
    }
    case "Object": {
      const out: Record<string, unknown> = {}
      for (const prop of node.props) {
        if (prop.type === "Spread") {
          const value = evalNode(prop.arg, scope, env)
          if (isPlainObject(value)) Object.assign(out, value)
          continue
        }
        const key =
          typeof prop.key === "string"
            ? prop.key
            : String(evalNode(prop.key, scope, env))
        if (FORBIDDEN_KEYS.has(key)) continue
        out[key] = evalNode(prop.value, scope, env)
      }
      return out
    }
    case "Member": {
      const target = evalNode(node.object, scope, env)
      if (target == null) return undefined
      const key =
        typeof node.property === "string"
          ? node.property
          : evalNode(node.property, scope, env)
      return getMember(target, key)
    }
    case "Call": {
      const callee = node.callee
      if (callee.type === "Member") {
        const target = evalNode(callee.object, scope, env)
        if (target == null) return undefined
        const key = String(
          typeof callee.property === "string"
            ? callee.property
            : evalNode(callee.property, scope, env)
        )
        const args = evalArgs(node.args, scope, env)
        if (Array.isArray(target) && MUTATORS.has(key)) {
          if (env.mode !== "action") {
            throw new ExprRuntimeError(
              `${key}() can only run from an event handler`
            )
          }
          const copy = target.slice()
          const result = (
            Array.prototype[key as "push"] as (...a: unknown[]) => unknown
          ).apply(copy, args)
          checkSize(copy)
          assignTo(callee.object, copy, scope, env, target)
          return result
        }
        const method = methodOf(target, key)
        if (method) {
          return checkSize(
            (method as Method<unknown>)(target, ...args)
          )
        }
        const member = getMember(target, key)
        if (member === undefined && (node.optional || callee.optional)) {
          return undefined
        }
        return callFunction(member, args, key, env)
      }
      const fn = evalNode(callee, scope, env)
      if (fn == null && node.optional) return undefined
      const label = callee.type === "Ident" ? callee.name : "value"
      return callFunction(fn, evalArgs(node.args, scope, env), label, env)
    }
    case "Unary": {
      const value = evalNode(node.arg, scope, env)
      switch (node.op) {
        case "!":
          return !value
        case "-":
          return -(value as number)
        case "+":
          return +(value as number)
        case "typeof":
          return typeof value
        case "await":
          return value
      }
      return undefined
    }
    case "Binary":
      return binary(
        node.op,
        evalNode(node.left, scope, env),
        evalNode(node.right, scope, env)
      )
    case "Logical": {
      const left = evalNode(node.left, scope, env)
      if (node.op === "&&") return left ? evalNode(node.right, scope, env) : left
      if (node.op === "||") return left ? left : evalNode(node.right, scope, env)
      return left ?? evalNode(node.right, scope, env)
    }
    case "Cond":
      return evalNode(node.test, scope, env)
        ? evalNode(node.then, scope, env)
        : evalNode(node.else, scope, env)
    case "Arrow": {
      const { params, body } = node
      const fn = (...args: unknown[]): unknown => {
        const fresh = env.active === 0
        if (fresh) env.steps = 0
        if (env.depth >= MAX_DEPTH) {
          throw new ExprRuntimeError("Too much recursion")
        }
        env.depth++
        env.active++
        try {
          const inner = scope.child()
          params.forEach((param, index) => {
            bindPattern(param, args[index], inner)
          })
          return unwrapReturn(evalNode(body, inner, env))
        } finally {
          env.depth--
          env.active--
        }
      }
      return registerCallable(fn)
    }
    case "Assign": {
      let value = evalNode(node.value, scope, env)
      if (node.op !== "=") {
        const current = evalNode(node.target, scope, env)
        value = binary(node.op.slice(0, -1), current, value)
      }
      if (env.mode === "action" && isThenable(value)) {
        return value.then((resolved) => {
          assignTo(node.target, resolved, scope, env)
          return resolved
        })
      }
      assignTo(node.target, value, scope, env)
      return value
    }
    case "Update": {
      const current = Number(evalNode(node.target, scope, env) ?? 0)
      const next = node.op === "++" ? current + 1 : current - 1
      assignTo(node.target, next, scope, env)
      return node.prefix ? next : current
    }
    case "Block":
      return runBlock(node.body, scope.child(), env, 0)
    case "If": {
      if (evalNode(node.test, scope, env)) {
        return evalNode(node.then, scope, env)
      }
      return node.else ? evalNode(node.else, scope, env) : undefined
    }
    case "Return": {
      const value = node.arg ? evalNode(node.arg, scope, env) : undefined
      if (isThenable(value)) {
        return value.then(
          (resolved): ReturnBox => ({ [RETURN]: true, value: resolved })
        )
      }
      return { [RETURN]: true, value } satisfies ReturnBox
    }
    case "Let": {
      bindPattern(
        node.pattern,
        node.init ? evalNode(node.init, scope, env) : undefined,
        scope
      )
      return undefined
    }
  }
}

function start(
  expr: Expr,
  scope: Scope,
  host: EvalHost,
  mode: Env["mode"]
): unknown {
  const env: Env = { host, mode, steps: 0, depth: 0, active: 1 }
  try {
    // A top-level block shares the caller's scope, so `const` reaches later statements.
    const result =
      expr.type === "Block"
        ? runBlock(expr.body, scope, env, 0)
        : evalNode(expr, scope, env)
    return unwrapReturn(result)
  } finally {
    env.active = 0
  }
}

/**
 * Evaluates an expression for display. It can read everything but can't
 * change state or call actions.
 */
export function evaluate(expr: Expr, scope: Scope, host: EvalHost): unknown {
  return start(expr, scope, host, "render")
}

/**
 * Runs an expression as an action: it may assign state and call actions.
 * Statements run in order, and a statement that returns a promise is awaited
 * before the next one starts.
 */
export function run(expr: Expr, scope: Scope, host: EvalHost): unknown {
  return start(expr, scope, host, "action")
}
