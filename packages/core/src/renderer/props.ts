import {
  type AttrValue,
  type ElementNode,
  type Expr,
  evaluate,
  parseInlineStyle,
  run,
  type Scope,
  type Surface,
  safeStyleValue,
  safeUrl,
  styleKey,
} from "../index"

export type ElementKind = "html" | "svg" | "primitive" | "component" | "ui-sdk"

export interface PropsContext {
  surface: Surface
  scope: Scope
  /** Runs an event handler, reporting errors instead of throwing. */
  invoke: (work: () => unknown) => unknown
  /** Runs a `bind:` write. Like `invoke`, without view transitions. */
  write: (work: () => unknown) => unknown
  report: (message: string) => void
  allowUrl?: ((url: string, kind: "link" | "media") => boolean) | undefined
}

/**
 * How one framework names things. Everything else about turning attributes
 * into props, including what is refused, is the same for every renderer.
 */
export interface PropsDialect {
  /** The prop that carries class names: `className` in React, `class` elsewhere. */
  className: string
  /** Names an HTML attribute. `lower` is the attribute in lower case, `written` as the markup has it. */
  html(lower: string, written: string): string
  /** Names an SVG attribute. */
  svg(lower: string, written: string): string
  /** Names a prop handed to a component or a primitive. */
  prop(name: string): string
  /** The prop for `on:name`. `dom` is false for the host's own components. */
  event(name: string, dom: boolean, tag: string): string
  /** The prop for a handler written as `onName={...}`. `native` is true on HTML and SVG elements. */
  handler(name: string, native: boolean): string
  /** The event prop through which a native element reports a `bind:` change. */
  bindEvent(tag: string, argument: string): string
}

export interface ElementProps {
  props: Record<string, unknown>
  key: string | undefined
  /** `show={cond}`: false hides the element, with its exit animation. */
  show: boolean | undefined
}

const HTML_ATTRIBUTES = new Set([
  "id",
  "title",
  "role",
  "lang",
  "dir",
  "hidden",
  "tabindex",
  "name",
  "type",
  "value",
  "placeholder",
  "disabled",
  "checked",
  "selected",
  "readonly",
  "required",
  "multiple",
  "min",
  "max",
  "step",
  "minlength",
  "maxlength",
  "pattern",
  "rows",
  "cols",
  "wrap",
  "inputmode",
  "autocomplete",
  "spellcheck",
  "alt",
  "width",
  "height",
  "loading",
  "href",
  "src",
  "target",
  "open",
  "datetime",
  "cite",
  "start",
  "reversed",
  "colspan",
  "rowspan",
  "scope",
  "span",
  "headers",
  "align",
  "for",
  "low",
  "high",
  "optimum",
  "label",
  "defaultvalue",
  "defaultchecked",
])

export const BLOCKED_PROPS = new Set([
  "dangerouslySetInnerHTML",
  "ref",
  "render",
  "children",
  "innerHTML",
  "srcdoc",
  "srcDoc",
  "formaction",
  "formAction",
  "action",
  "is",
])

const DATA_PROPS = new Set(["variant", "size", "tone"])
const MOTION_ATTRIBUTE = /^[a-z]+(?:-[a-z]+)*$/
const PROP_NAME = /^[A-Za-z_][\w:-]*$/

export function camel(name: string): string {
  return name.replace(/[-:]([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

export function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1)
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Turns what a component hands to a callback into plain data an expression
 * can read: events become `{ type, value, checked, key }`, and anything that
 * isn't data is dropped.
 */
export function plainArg(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  const type = typeof value
  if (type === "string" || type === "number" || type === "boolean") return value
  if (type !== "object" || depth > 6) return undefined
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => plainArg(item, depth + 1))
  const record = value as Record<string, unknown>
  if ("nativeEvent" in record || (typeof Event !== "undefined" && value instanceof Event)) {
    const target = (record.currentTarget ?? record.target) as
      | (Partial<HTMLInputElement> & { type?: string })
      | null
    const out: Record<string, unknown> = { type: record.type }
    if (target && typeof target === "object") {
      if ("value" in target) out.value = inputValue(target)
      if ("checked" in target) out.checked = Boolean(target.checked)
      if (typeof target.name === "string" && target.name) out.name = target.name
    }
    if (typeof record.key === "string") out.key = record.key
    for (const modifier of ["shiftKey", "metaKey", "ctrlKey", "altKey"]) {
      if (record[modifier] === true) out[modifier] = true
    }
    return out
  }
  if (!isPlain(value)) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "function") continue
    const plain = plainArg(item, depth + 1)
    if (plain !== undefined) out[key] = plain
  }
  return out
}

function inputValue(target: Partial<HTMLInputElement>): unknown {
  if (target.type === "number" || target.type === "range") {
    const number = Number(target.value)
    return target.value === "" || Number.isNaN(number) ? null : number
  }
  return target.value
}

export function evalAttr(value: AttrValue, ctx: PropsContext): unknown {
  if (value.kind === "static") return value.value
  try {
    if (value.kind === "expr") return evaluate(value.expr, ctx.scope, ctx.surface.host)
    return value.parts
      .map((part) => {
        if (typeof part === "string") return part
        const result = evaluate(part, ctx.scope, ctx.surface.host)
        return result === null || result === undefined || result === false
          ? ""
          : String(result)
      })
      .join("")
  } catch (error) {
    ctx.report(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/** Builds the function React calls for an `on:` handler. */
function handler(expr: Expr, ctx: PropsContext): (...args: unknown[]) => unknown {
  const { scope, surface } = ctx
  if (expr.type === "Arrow") {
    return (...args) =>
      ctx.invoke(() => {
        const fn = run(expr, scope, surface.host) as (...values: unknown[]) => unknown
        return fn(...args.map((arg) => plainArg(arg)))
      })
  }
  return (...args) =>
    ctx.invoke(() => {
      const local = scope.child()
      const event = plainArg(args[0])
      local.declare("$event", event)
      local.declare(
        "$value",
        isPlain(event) && "type" in event && "value" in event ? event.value : event
      )
      return run(expr, local, surface.host)
    })
}

/** Builds the setter for `bind:name={path}`. */
function setter(expr: Expr, ctx: PropsContext): ((value: unknown) => void) | null {
  if (expr.type !== "Ident" && expr.type !== "Member") {
    ctx.report("bind: needs a state name or a path, like bind:value={form.email}")
    return null
  }
  const assign: Expr = {
    type: "Assign",
    op: "=",
    target: expr,
    value: { type: "Ident", name: "$next" },
  }
  return (value) => {
    ctx.write(() => {
      const local = ctx.scope.child()
      local.declare("$next", value)
      return run(assign, local, ctx.surface.host)
    })
  }
}

function chain(
  first: ((...args: unknown[]) => unknown) | undefined,
  second: (...args: unknown[]) => unknown
): (...args: unknown[]) => unknown {
  if (!first) return second
  return (...args) => {
    first(...args)
    return second(...args)
  }
}

function coerceStatic(value: unknown): unknown {
  if (value === "true") return true
  if (value === "false") return false
  return value
}

function checkUrl(
  value: unknown,
  kind: "link" | "media",
  ctx: PropsContext
): string | undefined {
  const url = safeUrl(value, kind)
  if (url === null) return undefined
  if (ctx.allowUrl && !ctx.allowUrl(url, kind)) return undefined
  return url
}

/**
 * Evaluates an element's attributes into props for the framework `dialect` names.
 *
 * - `bind:value={path}` reads and writes state.
 * - `on:click={...}` (or `onClick={...}`) runs an action.
 * - `class:name={cond}` and `style:prop={value}` set one class or one style.
 * - `motion`, `delay`, `stagger` and `morph` become animation hooks for CSS.
 * - `let:name` is left to the renderer, which turns children into a function.
 * - Anything that could run script or load a hidden resource is dropped.
 */
export function buildProps(
  node: ElementNode,
  kind: ElementKind,
  ctx: PropsContext,
  dialect: PropsDialect
): ElementProps {
  const props: Record<string, unknown> = {}
  const classes: string[] = []
  const style: Record<string, string | number> = {}
  const handlers: Record<string, (...args: unknown[]) => unknown> = {}
  let key: string | undefined
  let show: boolean | undefined
  const native = kind === "html" || kind === "svg"
  const tag = node.name

  const setStyle = (name: string, value: unknown) => {
    if (value === null || value === undefined || value === false) return
    const safe = safeStyleValue(name, String(value))
    if (safe !== null) style[styleKey(name)] = safe
  }

  const assign = (name: string, value: unknown, fromStatic: boolean) => {
    if (BLOCKED_PROPS.has(name) || !PROP_NAME.test(name)) return
    if (name === "key") {
      if (value !== undefined && value !== null) key = String(value)
      return
    }
    if (name === "show") {
      show = Boolean(value)
      return
    }
    if (name === "class" || name === "className") {
      if (typeof value === "string") classes.push(value)
      return
    }
    if (name === "style") {
      if (typeof value === "string") Object.assign(style, parseInlineStyle(value))
      else if (isPlain(value)) {
        for (const [property, item] of Object.entries(value)) {
          setStyle(property.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`), item)
        }
      }
      return
    }
    if (name === "motion") {
      if (typeof value === "string" && MOTION_ATTRIBUTE.test(value)) {
        props["data-iui-motion"] = value
        // `draw` animates the dash offset, which needs a known path length.
        if (value === "draw" && kind === "svg") props.pathLength = 1
      }
      return
    }
    if (name === "delay") {
      const ms = Number(value)
      if (Number.isFinite(ms) && ms >= 0) style["--iui-delay"] = `${Math.min(ms, 5000)}ms`
      return
    }
    if (name === "stagger") {
      if (value !== false && value !== "false") {
        props["data-iui-stagger"] = ""
        const ms = Number(value)
        if (Number.isFinite(ms) && ms > 0) style["--iui-stagger"] = `${Math.min(ms, 1000)}ms`
      }
      return
    }
    if (name === "morph") {
      if (typeof value === "string" && /^[A-Za-z][\w-]*$/.test(value)) {
        props["data-iui-morph"] = value
      }
      return
    }
    if (/^on/i.test(name) && (typeof value !== "function" || !/^on[A-Z]/.test(name))) return
    if (name.startsWith("aria-") || name.startsWith("data-")) {
      if (name.startsWith("data-iui-")) return
      props[name] = value
      return
    }

    if (kind === "html") {
      const lower = name.toLowerCase()
      if (!HTML_ATTRIBUTES.has(lower)) return
      if (lower === "href") {
        const url = checkUrl(value, "link", ctx)
        if (url === undefined) return
        props.href = url
        if (/^https?:/i.test(url)) {
          props.target = "_blank"
          props.rel = "noopener noreferrer"
        }
        return
      }
      if (lower === "src") {
        const url = checkUrl(value, "media", ctx)
        if (url !== undefined) props.src = url
        return
      }
      if (lower === "target") return
      if (lower === "align") {
        if (typeof value === "string" && /^(left|center|right)$/.test(value)) {
          style.textAlign = value
        }
        return
      }
      if (lower === "type" && tag === "input" && value === "file") return
      props[dialect.html(lower, name)] = fromStatic ? coerceStatic(value) : value
      return
    }

    if (kind === "svg") {
      const lower = name.toLowerCase()
      if (lower === "href" || lower === "xlink:href") {
        if (typeof value !== "string") return
        if (value.startsWith("#")) props.href = value
        else if (tag === "a") {
          const url = checkUrl(value, "link", ctx)
          if (url !== undefined) props.href = url
        } else if (tag === "image") {
          const url = checkUrl(value, "media", ctx)
          if (url !== undefined) props.href = url
        }
        return
      }
      if (lower === "xmlns" || lower.startsWith("xmlns:")) return
      if (typeof value === "string" && /url\s*\(\s*(?!["']?#)/i.test(value)) return
      props[dialect.svg(lower, name)] = value
      return
    }

    // Components and primitives take their props as written.
    if (name === "href") {
      const url = checkUrl(value, "link", ctx)
      if (url !== undefined) props.href = url
      return
    }
    if (name === "src") {
      const url = checkUrl(value, "media", ctx)
      if (url !== undefined) props.src = url
      return
    }
    if (kind === "ui-sdk" && DATA_PROPS.has(name)) {
      if (typeof value === "string") props[`data-${name}`] = value
      return
    }
    props[dialect.prop(name)] = fromStatic && kind !== "primitive" ? coerceStatic(value) : value
  }

  for (const attr of node.attrs) {
    const { name, value } = attr

    if (name === "...") {
      const spread = evalAttr(value, ctx)
      if (isPlain(spread)) {
        for (const [key, item] of Object.entries(spread)) {
          if (typeof item !== "function") assign(key, item, false)
        }
      }
      continue
    }

    const colon = name.indexOf(":")
    const directive = colon > 0 ? name.slice(0, colon) : ""
    const argument = colon > 0 ? name.slice(colon + 1) : ""

    if (directive === "on" || (/^on[A-Z]/.test(name) && value.kind === "expr")) {
      if (value.kind !== "expr") continue
      const event =
        directive === "on"
          ? dialect.event(argument, kind !== "component", tag)
          : dialect.handler(name, native)
      handlers[event] = chain(handlers[event], handler(value.expr, ctx))
      continue
    }

    if (directive === "bind") {
      if (value.kind !== "expr" || BLOCKED_PROPS.has(argument)) continue
      if (native && argument !== "value" && argument !== "checked" && argument !== "open") {
        continue
      }
      const set = setter(value.expr, ctx)
      const current = evalAttr(value, ctx)
      if (native) {
        props[argument] = current ?? (argument === "value" ? "" : false)
        if (set) {
          const event = dialect.bindEvent(tag, argument)
          handlers[event] = chain(handlers[event], (change) => {
            const target = (change as { target?: Partial<HTMLInputElement & HTMLDetailsElement> })
              ?.target
            if (!target) return
            if (argument === "checked") set(Boolean(target.checked))
            else if (argument === "open") set(Boolean(target.open))
            else set(inputValue(target))
          })
        }
      } else {
        props[argument] = current
        if (set) {
          const event = `on${capitalize(argument)}Change`
          handlers[event] = chain(handlers[event], (next) => set(plainArg(next)))
        }
      }
      continue
    }

    if (directive === "let") continue

    if (directive === "class") {
      if (evalAttr(value, ctx)) classes.push(argument)
      continue
    }

    if (directive === "style") {
      setStyle(argument, evalAttr(value, ctx))
      continue
    }

    assign(name, evalAttr(value, ctx), value.kind === "static")
  }

  for (const [name, fn] of Object.entries(handlers)) {
    const existing = props[name]
    props[name] =
      typeof existing === "function"
        ? chain(fn, existing as (...args: unknown[]) => unknown)
        : fn
  }
  if (classes.length) props[dialect.className] = classes.join(" ")
  if (Object.keys(style).length) props.style = style
  return { props, key, show }
}
