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
} from "@open-intelligent-ui/core"
import {
  type ComponentType,
  createElement,
  Fragment,
  type ReactNode,
} from "react"
import { PRESETS } from "../presets/presets"
import { PRIMITIVES } from "../primitives/primitives"
import { lookupUiSdk } from "../registry/ui-sdk"
import { Presence } from "./Presence"
import {
  buildProps,
  type ElementKind,
  evalAttr,
  plainArg,
  type PropsContext,
} from "./props"

export interface RenderOptions {
  /** Components supplied by the host application, by tag name. */
  components: Record<string, ComponentType<never>>
  /** True while the source is still arriving. */
  streaming: boolean
  report: (message: string) => void
  invoke: (work: () => unknown) => unknown
  allowUrl?: ((url: string, kind: "link" | "media") => boolean) | undefined
}

interface Slot {
  nodes: Node[]
  ctx: RenderContext
}

export interface RenderContext {
  surface: Surface
  scope: Scope
  options: RenderOptions
  /** Children passed to the `<define>` template being rendered. */
  slot: Slot | null
  templateDepth: number
}

const DECLARATIONS = new Set(["state", "derive", "query", "define", "style"])
const SVG_NAMES = new Set(["text", "title", "image", "a", "style", "switch"])
const MAX_TEMPLATE_DEPTH = 24
const MAX_LIST_ITEMS = 2000

function propsContext(ctx: RenderContext): PropsContext {
  return {
    surface: ctx.surface,
    scope: ctx.scope,
    invoke: ctx.options.invoke,
    report: ctx.options.report,
    allowUrl: ctx.options.allowUrl,
  }
}

function safeEvaluate(expr: Expr, ctx: RenderContext): unknown {
  try {
    return evaluate(expr, ctx.scope, ctx.surface.host)
  } catch (error) {
    ctx.options.report(error instanceof Error ? error.message : String(error))
    return undefined
  }
}

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

export function renderNodes(nodes: Node[], ctx: RenderContext): ReactNode[] {
  const out: ReactNode[] = []
  let current = ctx
  nodes.forEach((node, index) => {
    switch (node.type) {
      case "text":
        out.push(node.value)
        break
      case "expr": {
        const text = display(safeEvaluate(node.expr, current))
        if (text !== null) out.push(text)
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
            <Fragment key={`${index}:${position}`}>
              {renderNodes(branch.children, current)}
            </Fragment>
          )
        }
        break
      }
      case "each":
        out.push(<Fragment key={index}>{renderEach(node, current)}</Fragment>)
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

function renderEach(node: EachNode, ctx: RenderContext): ReactNode {
  const value = safeEvaluate(node.list, ctx)
  const list = Array.isArray(value)
    ? value
    : typeof value === "number" && Number.isInteger(value) && value > 0
      ? Array.from({ length: Math.min(value, MAX_LIST_ITEMS) }, (_, index) => index)
      : []
  if (list.length === 0) {
    return node.empty ? renderNodes(node.empty, ctx) : null
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
    return <Fragment key={key}>{renderNodes(node.children, inner)}</Fragment>
  })
}

function letNames(node: ElementNode): string[] {
  const names: string[] = []
  for (const attr of node.attrs) {
    if (!attr.name.startsWith("let:")) continue
    const value = attr.value
    const alias =
      value.kind === "expr" && value.expr.type === "Ident" ? value.expr.name : null
    names.push(alias ?? attr.name.slice(4))
  }
  return names
}

function pending(key: string): ReactNode {
  return <span key={key} className="iui-pending" aria-hidden="true" />
}

function renderTemplate(
  template: ElementNode,
  node: ElementNode,
  ctx: RenderContext,
  key: string
): ReactNode {
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
  return (
    <Fragment key={key}>
      {renderNodes(template.children, {
        ...ctx,
        scope,
        slot: { nodes: node.children, ctx },
        templateDepth: ctx.templateDepth + 1,
      })}
    </Fragment>
  )
}

function wrap(
  element: ReactNode,
  show: boolean | undefined,
  key: string
): ReactNode {
  if (show === undefined) return element
  return (
    <Presence key={key} show={show}>
      {element}
    </Presence>
  )
}

export function renderElement(
  node: ElementNode,
  ctx: RenderContext,
  index: string
): ReactNode {
  const { name } = node
  const tagged = node.origin === "tag"

  if (tagged && !node.svg && DECLARATIONS.has(name)) return null

  if (tagged && name === "slot" && !node.svg) {
    if (!ctx.slot) return null
    return <Fragment key={index}>{renderNodes(ctx.slot.nodes, ctx.slot.ctx)}</Fragment>
  }

  let kind: ElementKind
  let type: string | ComponentType<never>

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
    } else if (Object.hasOwn(PRESETS, name)) {
      kind = "component"
      type = PRESETS[name] as ComponentType<never>
    } else {
      const found = lookupUiSdk(name)
      if (found.status === "loading") return pending(index)
      if (found.status !== "ready") {
        ctx.options.report(
          found.status === "error"
            ? `<${name}> failed to load`
            : `<${name}> is not a known component`
        )
        return <Fragment key={index}>{renderNodes(node.children, ctx)}</Fragment>
      }
      kind = "ui-sdk"
      type = found.component as ComponentType<never>
    }
  } else if (node.svg && (SVG_TAGS.has(name) || SVG_NAMES.has(name))) {
    if (name === "style") return null
    kind = "svg"
    type = name
  } else if (tagged && PRIMITIVE_TAGS.has(name)) {
    kind = "primitive"
    type = PRIMITIVES[name] as ComponentType<never>
  } else if (HTML_TAGS.has(name) || SVG_TAGS.has(name)) {
    kind = SVG_TAGS.has(name) ? "svg" : "html"
    type = name
  } else {
    return <Fragment key={index}>{renderNodes(node.children, ctx)}</Fragment>
  }

  const { props, key, show } = buildProps(node, kind, propsContext(ctx))
  const reactKey = key === undefined ? index : `${index}:${key}`

  if (kind === "html") {
    return wrap(renderHtml(node, name, props, ctx, reactKey), show, reactKey)
  }

  const component = type as ComponentType<Record<string, unknown>>
  const names = letNames(node)
  if (names.length && kind !== "svg" && kind !== "primitive") {
    // `let:cell` makes the children a function of what the component passes,
    // for parts that render once per item or from their own state.
    const template = (...args: unknown[]) => {
      const scope = ctx.scope.child()
      names.forEach((local, position) => {
        scope.declare(local, plainArg(args[position]))
      })
      return <>{renderNodes(node.children, { ...ctx, scope })}</>
    }
    return wrap(
      createElement(component, { ...props, key: reactKey, children: template }),
      show,
      reactKey
    )
  }

  const children = renderNodes(node.children, ctx)
  if (kind === "component" && name === "CodeBlock" && children.length) {
    props.code ??= children.filter((child) => typeof child === "string").join("")
  }
  const element = createElement(component, { ...props, key: reactKey }, ...children)
  return wrap(element, show, reactKey)
}

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

function renderHtml(
  node: ElementNode,
  name: string,
  props: Record<string, unknown>,
  ctx: RenderContext,
  key: string
): ReactNode {
  const fromMarkdown = node.origin === "markdown"
  if (name === "pre" && fromMarkdown) {
    const text = node.children[0]
    const lang = node.attrs.find((attr) => attr.name === "lang")?.value
    const CodeBlock = PRESETS.CodeBlock as ComponentType<Record<string, unknown>>
    return (
      <CodeBlock
        key={key}
        code={text?.type === "text" ? text.value : ""}
        lang={lang?.kind === "static" ? lang.value : undefined}
        onCopy={(code: string) =>
          ctx.options.invoke(() => ctx.surface.host.actions?.copy?.(code))
        }
      />
    )
  }
  if (name === "img") {
    if (typeof props.src !== "string") return null
    props.loading ??= "lazy"
    props.referrerPolicy = "no-referrer"
    props.alt ??= ""
  }
  if (name === "button") props.type ??= "button"
  if (name === "form") {
    const submit = props.onSubmit as ((event: unknown) => unknown) | undefined
    props.onSubmit = (event: { preventDefault(): void }) => {
      event.preventDefault()
      return submit?.(event)
    }
  }
  if (name === "input" && props.type === "checkbox" && fromMarkdown) {
    props.readOnly = true
  }
  const classes = [
    BLOCKS.has(name) || HEADINGS.has(name) ? "iui-el" : "",
    fromMarkdown ? "iui-md" : "",
    props.className,
  ]
    .filter(Boolean)
    .join(" ")
  if (classes) props.className = classes
  if (VOID_HTML.has(name)) return createElement(name, { ...props, key })
  return createElement(name, { ...props, key }, ...renderNodes(node.children, ctx))
}
