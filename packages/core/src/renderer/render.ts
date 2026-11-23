import {
  declarePattern,
  type EachNode,
  type ElementNode,
  type Expr,
  evaluate,
  HTML_TAGS,
  isComponentName,
  type Node,
  PRIMITIVE_TAGS,
  type Scope,
  type Surface,
  SVG_TAGS,
} from "../index"
import {
  buildProps,
  type ElementKind,
  evalAttr,
  plainArg,
  type PropsContext,
  type PropsDialect,
} from "./props"
import type { Lookup } from "./registry"

/** One `let:` on an element: the name the component passes and the name markup reads it by. */
export interface LetBinding {
  name: string
  as: string
}

/**
 * What a framework supplies so the shared renderer can build its nodes.
 * `N` is the framework's node type, `C` its component type.
 */
export interface RenderHost<N, C> {
  dialect: PropsDialect
  primitives: Record<string, C>
  presets: Record<string, C>
  /** Finds a UI SDK component, starting to load it if needed. */
  lookup(name: string): Lookup<C>
  /** Nodes with nothing around them. */
  fragment(children: N[], key: string): N
  /** An HTML or SVG element. `children` is null for void elements. */
  element(tag: string, props: Record<string, unknown>, key: string, children: N[] | null): N
  /**
   * `open` is true while the source is still arriving and the component's
   * closing tag hasn't: more children can follow. A host whose components
   * take children at any time has no use for it.
   */
  component(
    type: C,
    props: Record<string, unknown>,
    key: string,
    children: N[],
    open: boolean
  ): N
  /** A component whose children are drawn from what it passes them (`let:`). */
  scoped(
    type: C,
    props: Record<string, unknown>,
    key: string,
    lets: LetBinding[],
    render: (values: unknown[]) => N[],
    open: boolean
  ): N
  /** Keeps `child` on screen while its exit animation plays. */
  presence(child: N, show: boolean, key: string): N
  /** Stands in for a component that is still loading. */
  pending(key: string): N
}

export interface RenderOptions<C = unknown> {
  /** Components supplied by the host application, by tag name. */
  components: Record<string, C>
  /** True while the source is still arriving. */
  streaming: boolean
  report: (message: string) => void
  invoke: (work: () => unknown) => unknown
  write: (work: () => unknown) => unknown
  allowUrl?: ((url: string, kind: "link" | "media") => boolean) | undefined
}

interface Slot<C> {
  nodes: Node[]
  ctx: RenderContext<C>
  /** True while the element the children were written in is still open. */
  open?: boolean
}

export interface RenderContext<C = unknown> {
  surface: Surface
  scope: Scope
  options: RenderOptions<C>
  /** Children passed to the `<define>` template being rendered. */
  slot: Slot<C> | null
  templateDepth: number
}

const DECLARATIONS = new Set(["state", "derive", "query", "define", "style"])
const SVG_NAMES = new Set(["text", "title", "image", "a", "style", "switch"])
const MAX_TEMPLATE_DEPTH = 24
const MAX_LIST_ITEMS = 2000

const VOID_HTML = new Set(["br", "hr", "img", "input", "col", "wbr"])
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])
const BLOCKS = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "tr",
  "pre",
  "hr",
  "figure",
  "details",
  "section",
  "article",
])

/** How a value shows up when written into text with `{value}`. */
function display(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === "boolean") return null
  if (typeof value === "string") return value
  if (typeof value === "number") return Number.isNaN(value) ? null : String(value)
  if (Array.isArray(value)) {
    return value.map((item) => display(item) ?? "").join(", ")
  }
  if (typeof value === "function") return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function letBindings(node: ElementNode): LetBinding[] {
  const lets: LetBinding[] = []
  for (const attr of node.attrs) {
    if (!attr.name.startsWith("let:")) continue
    const value = attr.value
    const alias =
      value.kind === "expr" && value.expr.type === "Ident" ? value.expr.name : null
    const name = attr.name.slice(4)
    lets.push({ name, as: alias ?? name })
  }
  return lets
}

/** Whether an element holds one icon and nothing else, so it can be drawn square. */
function isOnlyIcon(node: ElementNode): boolean {
  const content = node.children.filter(
    (child) => !(child.type === "text" && child.value.trim() === "")
  )
  const only = content[0]
  return content.length === 1 && only?.type === "element" && only.name === "icon"
}

/**
 * Builds the function that turns parsed markup into one framework's nodes.
 * What the language means lives here, once; a framework only says how to
 * make an element, a component and a fragment.
 */
export function createRenderer<N, C>(
  host: RenderHost<N, C>
): (nodes: Node[], ctx: RenderContext<C>) => N[] {
  type Ctx = RenderContext<C>
  const { dialect } = host

  function propsContext(ctx: Ctx): PropsContext {
    return {
      surface: ctx.surface,
      scope: ctx.scope,
      invoke: ctx.options.invoke,
      write: ctx.options.write,
      report: ctx.options.report,
      allowUrl: ctx.options.allowUrl,
    }
  }

  function safeEvaluate(expr: Expr, ctx: Ctx): unknown {
    try {
      return evaluate(expr, ctx.scope, ctx.surface.host)
    } catch (error) {
      ctx.options.report(error instanceof Error ? error.message : String(error))
      return undefined
    }
  }

  /** Whether more can still arrive inside `node`, or inside the template it is part of. */
  function isOpen(node: ElementNode, ctx: Ctx): boolean {
    return ctx.options.streaming && (!node.closed || ctx.slot?.open === true)
  }

  function renderNodes(nodes: Node[], ctx: Ctx): N[] {
    const out: N[] = []
    let current = ctx
    nodes.forEach((node, index) => {
      switch (node.type) {
        case "text":
          out.push(node.value as N)
          break
        case "expr": {
          const text = display(safeEvaluate(node.expr, current))
          if (text !== null) out.push(text as N)
          break
        }
        case "const": {
          // A `{@const}` is visible to the siblings that follow it.
          if (current === ctx) current = { ...ctx, scope: ctx.scope.child() }
          declarePattern(current.scope, node.pattern, safeEvaluate(node.expr, current))
          break
        }
        case "if": {
          const branch = node.branches.find(
            (item) => item.test === null || Boolean(safeEvaluate(item.test, current))
          )
          if (branch) {
            const position = node.branches.indexOf(branch)
            out.push(
              host.fragment(renderNodes(branch.children, current), `${index}:${position}`)
            )
          }
          break
        }
        case "each":
          out.push(host.fragment(renderEach(node, current), String(index)))
          break
        case "element": {
          const element = renderElement(node, current, String(index))
          if (element !== null) out.push(element)
          break
        }
      }
    })
    return out
  }

  function renderEach(node: EachNode, ctx: Ctx): N[] {
    const value = safeEvaluate(node.list, ctx)
    const list = Array.isArray(value)
      ? value
      : typeof value === "number" && Number.isInteger(value) && value > 0
        ? Array.from({ length: Math.min(value, MAX_LIST_ITEMS) }, (_, index) => index)
        : []
    if (list.length === 0) {
      return node.empty ? renderNodes(node.empty, ctx) : []
    }
    const seen = new Set<string>()
    return list.slice(0, MAX_LIST_ITEMS).map((item, index) => {
      const scope = ctx.scope.child()
      // The alias lets `item.done = true` in a handler write to `list[index]`.
      declarePattern(scope, node.pattern, item, {
        scope: ctx.scope,
        expr: {
          type: "Member",
          object: node.list,
          property: { type: "Literal", value: index },
          computed: true,
          optional: false,
        },
      })
      if (node.index) scope.declare(node.index, index)
      const inner = { ...ctx, scope }
      let key = String(index)
      if (node.key) {
        const custom = safeEvaluate(node.key, inner)
        if (typeof custom === "string" || typeof custom === "number") {
          const candidate = `k:${custom}`
          if (!seen.has(candidate)) key = candidate
        }
      }
      seen.add(key)
      return host.fragment(renderNodes(node.children, inner), key)
    })
  }

  function renderTemplate(
    template: ElementNode,
    node: ElementNode,
    ctx: Ctx,
    key: string
  ): N | null {
    if (ctx.templateDepth >= MAX_TEMPLATE_DEPTH) {
      ctx.options.report(`<${node.name}> is nested inside itself too deeply`)
      return null
    }
    const scope = ctx.surface.scope.child()
    const declared = template.attrs.find((attr) => attr.name === "props")?.value
    if (declared?.kind === "static" && typeof declared.value === "string") {
      for (const name of declared.value.split(/[\s,]+/).filter(Boolean)) {
        scope.declare(name.replace(/\?$/, ""), undefined)
      }
    }
    const props = propsContext(ctx)
    for (const attr of node.attrs) {
      if (attr.name === "..." || attr.name.includes(":")) continue
      scope.declare(attr.name, evalAttr(attr.value, props))
    }
    return host.fragment(
      renderNodes(template.children, {
        ...ctx,
        scope,
        slot: { nodes: node.children, ctx, open: isOpen(node, ctx) },
        templateDepth: ctx.templateDepth + 1,
      }),
      key
    )
  }

  function wrap(element: N | null, show: boolean | undefined, key: string): N | null {
    if (show === undefined || element === null) return element
    return host.presence(element, show, key)
  }

  function renderElement(node: ElementNode, ctx: Ctx, index: string): N | null {
    const { name } = node
    const tagged = node.origin === "tag"

    if (tagged && !node.svg && DECLARATIONS.has(name)) return null

    if (tagged && name === "slot" && !node.svg) {
      if (!ctx.slot) return null
      return host.fragment(renderNodes(ctx.slot.nodes, ctx.slot.ctx), index)
    }

    let kind: ElementKind
    let type: string | C

    if (isComponentName(name)) {
      const hosted = Object.hasOwn(ctx.options.components, name)
        ? ctx.options.components[name]
        : undefined
      const template = ctx.surface.templates.get(name)
      if (hosted) {
        kind = "component"
        type = hosted
      } else if (template) {
        return renderTemplate(template, node, ctx, index)
      } else if (Object.hasOwn(host.presets, name)) {
        kind = "component"
        type = host.presets[name] as C
      } else {
        const found = host.lookup(name)
        if (found.status === "loading") return host.pending(index)
        if (found.status !== "ready") {
          ctx.options.report(
            found.status === "error"
              ? `<${name}> failed to load`
              : `<${name}> is not a known component`
          )
          return host.fragment(renderNodes(node.children, ctx), index)
        }
        kind = "ui-sdk"
        type = found.component
      }
    } else if (node.svg && (SVG_TAGS.has(name) || SVG_NAMES.has(name))) {
      if (name === "style") return null
      kind = "svg"
      type = name
    } else if (tagged && PRIMITIVE_TAGS.has(name)) {
      kind = "primitive"
      type = host.primitives[name] as C
    } else if (HTML_TAGS.has(name) || SVG_TAGS.has(name)) {
      kind = SVG_TAGS.has(name) ? "svg" : "html"
      type = name
    } else {
      return host.fragment(renderNodes(node.children, ctx), index)
    }

    const { props, key, show } = buildProps(node, kind, propsContext(ctx), dialect)
    const nodeKey = key === undefined ? index : `${index}:${key}`

    if (kind === "html") {
      return wrap(renderHtml(node, name, props, ctx, nodeKey), show, nodeKey)
    }
    if (kind === "svg") {
      const children = renderNodes(node.children, ctx)
      return wrap(host.element(type as string, props, nodeKey, children), show, nodeKey)
    }

    const component = type as C
    const lets = letBindings(node)
    if (lets.length && kind !== "primitive") {
      // `let:cell` makes the children a function of what the component passes,
      // for parts that render once per item or from their own state.
      const render = (values: unknown[]) => {
        const scope = ctx.scope.child()
        lets.forEach((binding, position) => {
          scope.declare(binding.as, plainArg(values[position]))
        })
        return renderNodes(node.children, { ...ctx, scope })
      }
      return wrap(
        host.scoped(component, props, nodeKey, lets, render, isOpen(node, ctx)),
        show,
        nodeKey
      )
    }

    const children = renderNodes(node.children, ctx)
    if (kind === "ui-sdk" && isOnlyIcon(node)) props["data-iui-icon-only"] = ""
    if (kind === "component" && name === "CodeBlock" && children.length) {
      props.code ??= children.filter((child) => typeof child === "string").join("")
    }
    return wrap(
      host.component(component, props, nodeKey, children, isOpen(node, ctx)),
      show,
      nodeKey
    )
  }

  function renderHtml(
    node: ElementNode,
    name: string,
    props: Record<string, unknown>,
    ctx: Ctx,
    key: string
  ): N | null {
    const fromMarkdown = node.origin === "markdown"
    if (name === "pre" && fromMarkdown) {
      const text = node.children[0]
      const lang = node.attrs.find((attr) => attr.name === "lang")?.value
      return host.component(
        host.presets.CodeBlock as C,
        {
          code: text?.type === "text" ? text.value : "",
          lang: lang?.kind === "static" ? lang.value : undefined,
          onCopy: (code: string) =>
            ctx.options.invoke(() => ctx.surface.host.actions?.copy?.(code)),
        },
        key,
        [],
        false
      )
    }
    if (name === "img") {
      if (typeof props.src !== "string") return null
      props.loading ??= "lazy"
      props[dialect.html("referrerpolicy", "referrerpolicy")] = "no-referrer"
      props.alt ??= ""
    }
    if (name === "button") props.type ??= "button"
    if (name === "form") {
      const event = dialect.event("submit", "html", name)
      const submit = props[event] as ((submitted: unknown) => unknown) | undefined
      props[event] = (submitted: { preventDefault(): void }) => {
        submitted.preventDefault()
        return submit?.(submitted)
      }
    }
    if (name === "input" && props.type === "checkbox" && fromMarkdown) {
      props[dialect.html("readonly", "readonly")] = true
    }
    const classes = [
      BLOCKS.has(name) || HEADINGS.has(name) ? "iui-el" : "",
      fromMarkdown ? "iui-md" : "",
      props[dialect.className],
    ]
      .filter(Boolean)
      .join(" ")
    if (classes) props[dialect.className] = classes
    if (VOID_HTML.has(name)) return host.element(name, props, key, null)
    return host.element(name, props, key, renderNodes(node.children, ctx))
  }

  return renderNodes
}
