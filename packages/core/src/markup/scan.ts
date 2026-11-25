import {
  type Expr,
  ExprSyntaxError,
  findClosingBrace,
  parseEachHeader,
  parseExpression,
  parseProgram,
} from "../expr"
import type {
  Attr,
  AttrValue,
  ConstNode,
  Diagnostic,
  DiagnosticCode,
  Document,
  EachNode,
  ElementNode,
  IfNode,
  Node,
} from "./ast"
import {
  BLOCKED_TAGS,
  isComponentName,
  isKnownTag,
  RAW_TEXT_TAGS,
  SVG_TAGS,
  VOID_TAGS,
} from "./elements"
import {
  type ContentMode,
  decodeEntities,
  finishChildren,
  type RawChild,
} from "./markdown"

export interface ParseOptions {
  /**
   * Set while the source is still arriving. The end of the input is then
   * treated as "not written yet" rather than as a mistake: open elements
   * stay open and a half-written tag or expression is held back.
   */
  streaming?: boolean
}

interface Frame {
  kind: "root" | "element" | "if" | "each"
  name: string
  mode: ContentMode
}

type ContentEnd =
  | { type: "eof" }
  | { type: "close" }
  /** Something that belongs to an enclosing frame; left for it to read. */
  | { type: "outer" }
  | { type: "else"; header: string; pos: number }

const SPECIAL = /[\\`~<{]/g
const TAG_NAME = /[A-Za-z][A-Za-z0-9-]*/y
const CLOSE_TAG = /<\/([A-Za-z][A-Za-z0-9-]*)\s*>/y
const PARTIAL_CLOSE_TAG = /<\/[A-Za-z0-9-]*\s*$/y
const ATTR_NAME = /[^\s=/>{}"'<]+/y
const UNQUOTED_VALUE = /[^\s>"'{}=]+/y
const SVG_ONLY_NAMES = new Set(["text", "title", "image", "a", "style", "switch"])

/** A tag inside braces, as JSX writes `{open && <Panel />}`. */
const TAG_IN_EXPRESSION = /<[A-Za-z][\w-]*[\s/>]/
/** What braces hold when code was meant rather than prose: a call, a path, an operator. */
const CODE_IN_BRACES = /=>|&&|\|\||\?\?|\bnew\s+[A-Z]|[A-Za-z_$][\w$]*\s*\(|[A-Za-z_$][\w$]*\.[A-Za-z_$]/

/** A piece of source short enough to quote in a message. */
function clip(text: string): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > 80 ? `${line.slice(0, 77)}…` : line
}

/** Text held back at most this long while waiting for a closing `}`. */
const MAX_HELD_EXPRESSION = 1200

class Scanner {
  private pos = 0
  private end: number
  private complete = true
  private svgDepth = 0
  private readonly frames: Frame[] = []
  readonly diagnostics: Diagnostic[] = []

  constructor(
    private readonly src: string,
    private readonly streaming: boolean
  ) {
    this.end = src.length
  }

  parse(): Document {
    const root: Frame = { kind: "root", name: "#root", mode: "root" }
    this.frames.push(root)
    const { items } = this.parseContent(root)
    return {
      type: "root",
      children: finishChildren(items, "root", this.streaming),
      diagnostics: this.diagnostics,
      complete: this.complete,
      streaming: this.streaming,
    }
  }

  private report(
    severity: Diagnostic["severity"],
    code: DiagnosticCode,
    message: string,
    pos: number
  ): void {
    this.diagnostics.push({ severity, code, message, pos })
  }

  /** Stops reading at `pos`; the rest is still being written. */
  private hold(pos: number): void {
    this.end = pos
    this.pos = pos
    this.complete = false
  }

  private hasOuter(kind: Frame["kind"], name?: string): boolean {
    for (let i = this.frames.length - 2; i >= 0; i--) {
      const frame = this.frames[i] as Frame
      if (frame.kind === kind && (name === undefined || frame.name === name)) {
        return true
      }
    }
    return false
  }

  private isTagName(name: string): boolean {
    if (this.svgDepth > 0) {
      return (
        SVG_TAGS.has(name) ||
        SVG_ONLY_NAMES.has(name) ||
        isComponentName(name) ||
        BLOCKED_TAGS.has(name)
      )
    }
    return isKnownTag(name)
  }

  /**
   * Whether `<name` was meant as a tag rather than as "less than": a
   * lowercase name closed at once, as in `<stack>`, or followed by an
   * attribute with a value, as in `<stack gap={2}>`. `after` is where the
   * name ends.
   */
  private looksLikeTag(name: string, after: number): boolean {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) return false
    const rest = this.src.slice(after, Math.min(this.end, after + 400))
    return /^\s*\/?>|^\s+[A-Za-z_:][\w:.-]*=[^<\n]*>/.test(rest)
  }

  private atLineStart(pos: number): boolean {
    for (let i = pos - 1; i >= 0; i--) {
      const ch = this.src[i]
      if (ch === "\n") return true
      if (ch !== " " && ch !== "\t") return false
    }
    return true
  }

  private parseContent(frame: Frame): { items: RawChild[]; end: ContentEnd } {
    const items: RawChild[] = []
    let text = ""
    const flush = () => {
      if (text) items.push(text)
      text = ""
    }
    const src = this.src

    while (this.pos < this.end) {
      SPECIAL.lastIndex = this.pos
      const match = SPECIAL.exec(src)
      if (!match || match.index >= this.end) {
        text += src.slice(this.pos, this.end)
        this.pos = this.end
        break
      }
      const at = match.index
      text += src.slice(this.pos, at)
      this.pos = at
      const ch = src[at]

      if (ch === "\\") {
        const next = src[at + 1]
        if (next === "{" || next === "}" || next === "<") {
          text += next
          this.pos = at + 2
        } else {
          text += src.slice(at, at + 2)
          this.pos = Math.min(at + 2, this.end)
        }
        continue
      }

      if (ch === "`" || ch === "~") {
        text += this.readCode(ch)
        continue
      }

      if (ch === "<") {
        if (src.startsWith("<!--", at)) {
          const close = src.indexOf("-->", at + 4)
          if (close === -1 || close >= this.end) {
            if (this.streaming) this.hold(at)
            else this.pos = this.end
          } else {
            this.pos = close + 3
          }
          continue
        }

        if (src[at + 1] === "/") {
          CLOSE_TAG.lastIndex = at
          const closing = CLOSE_TAG.exec(src)
          if (closing && closing.index + closing[0].length <= this.end) {
            const name = closing[1] as string
            if (!this.isTagName(name) && !isKnownTag(name)) {
              text += "<"
              this.pos = at + 1
              continue
            }
            if (frame.kind === "element" && frame.name === name) {
              this.pos = at + closing[0].length
              flush()
              return { items, end: { type: "close" } }
            }
            if (this.hasOuter("element", name)) {
              flush()
              return { items, end: { type: "outer" } }
            }
            if (!VOID_TAGS.has(name)) {
              this.report("warning", "stray-close", `</${name}> has no matching opening tag`, at)
            }
            this.pos = at + closing[0].length
            continue
          }
          PARTIAL_CLOSE_TAG.lastIndex = at
          if (this.streaming && PARTIAL_CLOSE_TAG.test(src)) {
            this.hold(at)
            continue
          }
          text += "<"
          this.pos = at + 1
          continue
        }

        TAG_NAME.lastIndex = at + 1
        const named = TAG_NAME.exec(src)
        if (!named) {
          if (this.streaming && at === this.end - 1) {
            this.hold(at)
          } else {
            text += "<"
            this.pos = at + 1
          }
          continue
        }
        const name = named[0]
        const after = at + 1 + name.length
        if (after >= this.end) {
          if (this.streaming) {
            this.hold(at)
          } else {
            text += "<"
            this.pos = at + 1
          }
          continue
        }
        const next = src[after] as string
        if (!this.isTagName(name) || !/[\s/>]/.test(next)) {
          if (/[\s/>]/.test(next) && this.looksLikeTag(name, after)) {
            this.report(
              "warning",
              "unknown-tag",
              `<${name}> is not a tag the language has, so it is shown as text`,
              at
            )
          }
          text += "<"
          this.pos = at + 1
          continue
        }
        this.pos = after
        const node = this.parseElement(name, at)
        if (node) {
          flush()
          items.push(node)
        }
        continue
      }

      // ch === "{"
      const close = findClosingBrace(src, at)
      if (close === -1) {
        const rest = src.slice(at, this.end)
        if (
          this.streaming &&
          rest.length < MAX_HELD_EXPRESSION &&
          !rest.includes("\n\n")
        ) {
          this.hold(at)
        } else {
          text += "{"
          this.pos = at + 1
        }
        continue
      }
      const inner = src.slice(at + 1, close).trim()
      const head = /^[#:/@][a-z]*/.exec(inner)?.[0]

      if (head === "#if" || head === "#each") {
        this.pos = close + 1
        const node =
          head === "#if"
            ? this.parseIf(inner.slice(3), at)
            : this.parseEach(inner.slice(5), at)
        if (node) {
          flush()
          items.push(node)
        }
        continue
      }
      if (head === ":else") {
        if (frame.kind === "if" || frame.kind === "each") {
          this.pos = close + 1
          flush()
          return {
            items,
            end: { type: "else", header: inner.slice(5).trim(), pos: at },
          }
        }
        if (this.hasOuter("if") || this.hasOuter("each")) {
          flush()
          return { items, end: { type: "outer" } }
        }
        this.report("warning", "stray-close", "{:else} outside of {#if} or {#each}", at)
        this.pos = close + 1
        continue
      }
      if (head === "/if" || head === "/each") {
        const kind = head === "/if" ? "if" : "each"
        if (frame.kind === kind) {
          this.pos = close + 1
          flush()
          return { items, end: { type: "close" } }
        }
        if (this.hasOuter(kind)) {
          flush()
          return { items, end: { type: "outer" } }
        }
        this.report("warning", "stray-close", `{${head}} has no matching {#${kind}}`, at)
        this.pos = close + 1
        continue
      }
      if (head === "@const") {
        this.pos = close + 1
        const node = this.parseConst(inner.slice(6), at)
        if (node) {
          flush()
          items.push(node)
        }
        continue
      }
      if (head?.startsWith("@") || head?.startsWith("#")) {
        this.report("error", "unknown-block", `{${head}} is not supported`, at)
        this.pos = close + 1
        continue
      }

      // A comment as JSX writes it. Nothing is shown for it.
      if (/^\/\*[\s\S]*\*\/$/.test(inner)) {
        this.pos = close + 1
        continue
      }

      try {
        const expr = parseExpression(inner)
        flush()
        items.push({ type: "expr", expr, src: inner, pos: at })
        this.pos = close + 1
      } catch (error) {
        if (!(error instanceof ExprSyntaxError)) throw error
        // Braces in prose are text. Braces around code that can't be read are a mistake.
        if (TAG_IN_EXPRESSION.test(inner)) {
          this.report(
            "error",
            "tags-in-expression",
            `Tags can't be written inside {…}: write {#if test}…{/if} to show something when a test holds, and {#each list as item}…{/each} to repeat it, in {${clip(inner)}}`,
            at
          )
        } else if (CODE_IN_BRACES.test(inner)) {
          this.report("error", "bad-expression", `${error.message} in {${clip(inner)}}`, at)
        }
        text += "{"
        this.pos = at + 1
      }
    }

    flush()
    return { items, end: { type: "eof" } }
  }

  /** Code spans and fences are copied as written; nothing inside is parsed. */
  private readCode(ch: string): string {
    const src = this.src
    const start = this.pos
    let run = start
    while (run < this.end && src[run] === ch) run++
    const length = run - start

    if (length >= 3 && this.atLineStart(start)) {
      const fence = new RegExp(`\\n[ \\t]*${ch === "`" ? "`" : "~"}{${length},}[ \\t]*(?=\\n|$)`, "g")
      fence.lastIndex = run
      const closing = fence.exec(src)
      if (closing && closing.index + closing[0].length <= this.end) {
        this.pos = closing.index + closing[0].length
      } else {
        this.pos = this.end
      }
      return src.slice(start, this.pos)
    }

    if (ch === "`") {
      let i = run
      while (i < this.end) {
        const next = src.indexOf("`", i)
        if (next === -1 || next >= this.end) break
        let close = next
        while (close < this.end && src[close] === "`") close++
        const between = src.slice(run, next)
        if (/\n[ \t]*\n/.test(between)) break
        if (close - next === length) {
          this.pos = close
          return src.slice(start, close)
        }
        i = close
      }
    }
    this.pos = run
    return src.slice(start, run)
  }

  private childMode(): ContentMode {
    if (this.svgDepth > 0) return "plain"
    return "flow"
  }

  private parseElement(name: string, start: number): ElementNode | null {
    const parsed = this.parseAttrs(start)
    if (!parsed) {
      if (this.streaming) {
        this.hold(start)
      } else {
        this.report("error", "unclosed-tag", `<${name}> is never closed with ">"`, start)
        this.pos = this.end
      }
      return null
    }
    const { attrs, selfClosing } = parsed
    const src = this.src

    if (BLOCKED_TAGS.has(name)) {
      this.report("warning", "blocked-tag", `<${name}> is not allowed and was removed`, start)
      if (!selfClosing) {
        const close = src.indexOf(`</${name}`, this.pos)
        const finish = close === -1 ? -1 : src.indexOf(">", close)
        if (finish === -1 || finish >= this.end) {
          if (this.streaming) this.complete = false
          this.pos = this.end
        } else {
          this.pos = finish + 1
        }
      }
      return null
    }

    const svg = name === "svg" || this.svgDepth > 0
    const node: ElementNode = {
      type: "element",
      name,
      attrs,
      children: [],
      origin: "tag",
      svg,
      pos: start,
      closed: true,
    }
    if (selfClosing || (VOID_TAGS.has(name) && !svg)) return node

    if (RAW_TEXT_TAGS.has(name) && (name === "style" || !svg)) {
      const close = src.indexOf(`</${name}`, this.pos)
      const finish = close === -1 ? -1 : src.indexOf(">", close)
      if (finish === -1 || finish >= this.end) {
        node.children = [{ type: "text", value: src.slice(this.pos, this.end) }]
        node.closed = false
        this.pos = this.end
        if (!this.streaming) {
          this.report("warning", "unclosed-element", `<${name}> is never closed`, start)
        }
      } else {
        node.children = [{ type: "text", value: src.slice(this.pos, close) }]
        this.pos = finish + 1
      }
      return node
    }

    if (name === "svg") this.svgDepth++
    const frame: Frame = { kind: "element", name, mode: this.childMode() }
    this.frames.push(frame)
    const { items, end } = this.parseContent(frame)
    this.frames.pop()
    node.closed = end.type === "close"
    node.children = finishChildren(
      items,
      frame.mode,
      this.streaming && end.type === "eof"
    )
    if (name === "svg") this.svgDepth--
    if (!node.closed && !this.streaming) {
      this.report("warning", "unclosed-element", `<${name}> is never closed`, start)
    }
    return node
  }

  private parseAttrs(
    tagStart: number
  ): { attrs: Attr[]; selfClosing: boolean } | null {
    const src = this.src
    const attrs: Attr[] = []
    while (true) {
      while (this.pos < this.end && /\s/.test(src[this.pos] as string)) this.pos++
      if (this.pos >= this.end) return null
      const ch = src[this.pos] as string
      if (ch === ">") {
        this.pos++
        return { attrs, selfClosing: false }
      }
      if (ch === "/") {
        if (src[this.pos + 1] === ">") {
          this.pos += 2
          return { attrs, selfClosing: true }
        }
        if (this.pos + 1 >= this.end) return null
        this.pos++
        continue
      }
      if (ch === "{") {
        const close = findClosingBrace(src, this.pos)
        if (close === -1) return null
        const inner = src.slice(this.pos + 1, close).trim()
        const at = this.pos
        this.pos = close + 1
        const spread = inner.startsWith("...")
        const expr = this.attrExpr(spread ? inner.slice(3) : inner, at)
        if (!expr) continue
        if (spread) {
          attrs.push({ name: "...", value: { kind: "expr", expr, src: inner } })
        } else if (expr.type === "Ident") {
          attrs.push({ name: expr.name, value: { kind: "expr", expr, src: inner } })
        } else {
          this.report("error", "bad-expression", `{${inner}} needs an attribute name`, at)
        }
        continue
      }

      ATTR_NAME.lastIndex = this.pos
      const named = ATTR_NAME.exec(src)
      if (!named || named.index + named[0].length > this.end) {
        if (ch === "<") {
          // A new tag started before this one was closed.
          this.report("error", "unclosed-tag", "Tag is missing its closing \">\"", tagStart)
          return { attrs, selfClosing: false }
        }
        this.pos++
        continue
      }
      const name = named[0]
      this.pos += name.length
      if (this.pos >= this.end) return null
      if (src[this.pos] !== "=") {
        attrs.push({ name, value: { kind: "static", value: true } })
        continue
      }
      this.pos++
      if (this.pos >= this.end) return null
      const first = src[this.pos] as string

      if (first === '"' || first === "'") {
        const value = this.parseQuoted(first)
        if (!value) return null
        attrs.push({ name, value })
        continue
      }
      if (first === "{") {
        const close = findClosingBrace(src, this.pos)
        if (close === -1) return null
        const inner = src.slice(this.pos + 1, close)
        const at = this.pos
        this.pos = close + 1
        const expr = this.attrExpr(inner, at)
        if (expr) attrs.push({ name, value: { kind: "expr", expr, src: inner.trim() } })
        continue
      }
      UNQUOTED_VALUE.lastIndex = this.pos
      const bare = UNQUOTED_VALUE.exec(src)
      if (!bare || bare.index + bare[0].length >= this.end) {
        if (!bare) continue
        return null
      }
      let value = bare[0]
      this.pos += value.length
      if (value.endsWith("/") && src[this.pos] === ">") {
        value = value.slice(0, -1)
        this.pos--
      }
      attrs.push({ name, value: { kind: "static", value: decodeEntities(value) } })
    }
  }

  private attrExpr(inner: string, at: number): Expr | null {
    try {
      return parseProgram(inner)
    } catch (error) {
      if (!(error instanceof ExprSyntaxError)) throw error
      this.report("error", "bad-expression", `${error.message} in {${inner.trim()}}`, at)
      return null
    }
  }

  /** A quoted value; `{expr}` inside it is filled in when rendering. */
  private parseQuoted(quote: string): AttrValue | null {
    const src = this.src
    const parts: (string | Expr)[] = []
    let text = ""
    let i = this.pos + 1
    while (i < this.end) {
      const ch = src[i] as string
      if (ch === quote) {
        this.pos = i + 1
        if (parts.length === 0) {
          return { kind: "static", value: decodeEntities(text) }
        }
        if (text) parts.push(decodeEntities(text))
        return { kind: "template", parts }
      }
      if (ch === "\\" && (src[i + 1] === "{" || src[i + 1] === quote)) {
        text += src[i + 1]
        i += 2
        continue
      }
      if (ch === "{") {
        const close = findClosingBrace(src, i)
        if (close !== -1) {
          try {
            const expr = parseExpression(src.slice(i + 1, close))
            if (text) parts.push(decodeEntities(text))
            text = ""
            parts.push(expr)
            i = close + 1
            continue
          } catch (error) {
            if (!(error instanceof ExprSyntaxError)) throw error
          }
        }
      }
      text += ch
      i++
    }
    return null
  }

  private branchMode(): ContentMode {
    if (this.svgDepth > 0) return "plain"
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const frame = this.frames[i] as Frame
      if (frame.kind === "element") return "flow"
      if (frame.kind === "root") return "branch"
    }
    return "branch"
  }

  private parseIf(header: string, start: number): IfNode | null {
    const node: IfNode = { type: "if", branches: [], pos: start }
    const mode = this.branchMode()
    let test = this.condition(header, start)
    let valid = test !== null
    while (true) {
      const frame: Frame = { kind: "if", name: "#if", mode }
      this.frames.push(frame)
      const { items, end } = this.parseContent(frame)
      this.frames.pop()
      const children = finishChildren(
        items,
        mode,
        this.streaming && end.type === "eof"
      )
      if (valid) node.branches.push({ test, children })
      if (end.type !== "else") {
        if (end.type !== "close" && !this.streaming) {
          this.report("warning", "unclosed-element", "{#if} is never closed with {/if}", start)
        }
        break
      }
      if (end.header === "") {
        test = null
        valid = true
      } else if (end.header.startsWith("if")) {
        test = this.condition(end.header.slice(2), end.pos)
        valid = test !== null
      } else {
        this.report("error", "unknown-block", `Unknown block {:else ${end.header}}`, end.pos)
        valid = false
      }
    }
    return node.branches.length > 0 ? node : null
  }

  private condition(src: string, at: number): Expr | null {
    try {
      return parseExpression(src)
    } catch (error) {
      if (!(error instanceof ExprSyntaxError)) throw error
      this.report("error", "bad-expression", `${error.message} in {#if ${src.trim()}}`, at)
      return null
    }
  }

  private parseEach(header: string, start: number): EachNode | null {
    let node: EachNode | null = null
    try {
      const parsed = parseEachHeader(header)
      node = {
        type: "each",
        list: parsed.list,
        pattern: parsed.pattern,
        children: [],
        pos: start,
      }
      if (parsed.index) node.index = parsed.index
      if (parsed.key) node.key = parsed.key
    } catch (error) {
      if (!(error instanceof ExprSyntaxError)) throw error
      this.report("error", "bad-expression", `${error.message} in {#each ${header.trim()}}`, start)
    }
    const mode = this.branchMode()
    let first = true
    while (true) {
      const frame: Frame = { kind: "each", name: "#each", mode }
      this.frames.push(frame)
      const { items, end } = this.parseContent(frame)
      this.frames.pop()
      const children = finishChildren(
        items,
        mode,
        this.streaming && end.type === "eof"
      )
      if (node) {
        if (first) node.children = children
        else node.empty = children
      }
      if (end.type !== "else") {
        if (end.type !== "close" && !this.streaming) {
          this.report("warning", "unclosed-element", "{#each} is never closed with {/each}", start)
        }
        break
      }
      first = false
    }
    return node
  }

  private parseConst(body: string, start: number): ConstNode | null {
    try {
      const parsed = parseProgram(`const ${body}`)
      if (parsed.type === "Let" && parsed.init) {
        return {
          type: "const",
          pattern: parsed.pattern,
          expr: parsed.init,
          pos: start,
        }
      }
      this.report("error", "bad-expression", "{@const} needs a name and a value", start)
    } catch (error) {
      if (!(error instanceof ExprSyntaxError)) throw error
      this.report("error", "bad-expression", `${error.message} in {@const ${body.trim()}}`, start)
    }
    return null
  }
}

const WRAPPING_FENCE = /^\s*```([a-z]*)[ \t]*\n/
const WRAPPER_LANGUAGES = new Set(["mdx", "markdown", "md"])

/** Models sometimes wrap the whole answer in a code fence; this removes it. */
function unwrapFence(src: string): string {
  const fence = WRAPPING_FENCE.exec(src)
  if (!fence) return src
  const body = src.slice(fence[0].length)
  if (fence[1] === "iui") return body.replace(/\n```\s*$/, "\n")
  if (!WRAPPER_LANGUAGES.has(fence[1] as string)) return src
  const fences = body.match(/^[ \t]*```/gm)
  if (fences?.length === 1 && /\n```\s*$/.test(body)) {
    return body.replace(/\n```\s*$/, "\n")
  }
  return src
}

/**
 * Parses IUI markup into a tree. It never throws on bad input: whatever it
 * can't understand is kept as text or dropped, and noted in `diagnostics`.
 */
export function parse(source: string, options: ParseOptions = {}): Document {
  return new Scanner(prepare(source).text, options.streaming ?? false).parse()
}

/**
 * The text `parse` reads: line ends made the same, and a code fence around
 * the whole answer taken off. Positions in a document count from the start
 * of `text`, which is `lines` lines into the source as it was given.
 */
export function prepare(source: string): { text: string; lines: number } {
  const clean = source.replace(/\r\n?/g, "\n").replace(/[\uE000\uE001]/g, "")
  const text = unwrapFence(clean)
  const opening = text === clean ? "" : (WRAPPING_FENCE.exec(clean)?.[0] ?? "")
  return { text, lines: opening.split("\n").length - 1 }
}

/** Line and column for a position reported in a diagnostic. */
export function locate(
  source: string,
  pos: number
): { line: number; column: number } {
  let line = 1
  let column = 1
  const end = Math.min(pos, source.length)
  for (let i = 0; i < end; i++) {
    if (source[i] === "\n") {
      line++
      column = 1
    } else {
      column++
    }
  }
  return { line, column }
}
