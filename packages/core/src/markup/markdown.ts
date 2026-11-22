import { Marked, type Token } from "marked"
import type { Expr } from "../expr"
import type { Attr, AttrValue, ElementNode, Node } from "./ast"

/** Children as the scanner collects them: source text between nodes. */
export type RawChild = string | Node

/**
 * - `root`: the document itself, where a lone line is still a paragraph.
 * - `flow`: inside an element, where a lone paragraph becomes inline content.
 * - `branch`: inside `{#if}` / `{#each}` at the top level of the document.
 * - `plain`: no Markdown, as inside `<svg>`.
 */
export type ContentMode = "root" | "flow" | "branch" | "plain"

const OPEN = "\uE000"
const CLOSE = "\uE001"
const PLACEHOLDER = /\uE000(\d+)\uE001/g
const ONLY_PLACEHOLDERS = /^\s*(?:\uE000\d+\uE001\s*)+$/

const none = () => undefined
const markdown = new Marked({
  gfm: true,
  tokenizer: { code: none, html: none, tag: none, lheading: none },
})

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00A0",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  times: "×",
  rarr: "→",
  larr: "←",
  copy: "©",
  deg: "°",
}

export function decodeEntities(text: string): string {
  if (!text.includes("&")) return text
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match
      return String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })
}

function element(
  name: string,
  children: Node[],
  attrs: Attr[] = []
): ElementNode {
  return {
    type: "element",
    name,
    attrs,
    children,
    origin: "markdown",
    svg: false,
    pos: 0,
    closed: true,
  }
}

function staticAttr(name: string, value: string | true): Attr {
  return { name, value: { kind: "static", value } }
}

function pushText(out: Node[], value: string): void {
  if (!value) return
  const last = out[out.length - 1]
  if (last?.type === "text") last.value += value
  else out.push({ type: "text", value })
}

class Converter {
  constructor(private readonly nodes: Node[]) {}

  /** Splits text on the placeholders that stand in for nodes. */
  text(out: Node[], raw: string, decode = true): void {
    let last = 0
    for (const match of raw.matchAll(PLACEHOLDER)) {
      const before = raw.slice(last, match.index)
      pushText(out, decode ? decodeEntities(before) : before)
      const node = this.nodes[Number(match[1])]
      if (node) out.push(node)
      last = match.index + match[0].length
    }
    const rest = raw.slice(last)
    pushText(out, decode ? decodeEntities(rest) : rest)
  }

  /** A link target may hold `{expr}`, which becomes a computed attribute. */
  attrValue(raw: string): AttrValue {
    if (!raw.includes(OPEN)) return { kind: "static", value: raw }
    const parts: (string | Expr)[] = []
    let last = 0
    for (const match of raw.matchAll(PLACEHOLDER)) {
      if (match.index > last) parts.push(raw.slice(last, match.index))
      const node = this.nodes[Number(match[1])]
      if (node?.type === "expr") parts.push(node.expr)
      last = match.index + match[0].length
    }
    if (last < raw.length) parts.push(raw.slice(last))
    return { kind: "template", parts }
  }

  inline(tokens: Token[] | undefined, out: Node[] = []): Node[] {
    for (const token of tokens ?? []) {
      switch (token.type) {
        case "text":
          if ("tokens" in token && token.tokens?.length) {
            this.inline(token.tokens, out)
          } else {
            this.text(out, token.text)
          }
          break
        case "escape":
          pushText(out, token.text)
          break
        case "strong":
        case "em":
        case "del":
          out.push(element(token.type, this.inline(token.tokens)))
          break
        case "codespan":
          out.push(
            element("code", [{ type: "text", value: decodeEntities(token.text) }])
          )
          break
        case "br":
          out.push(element("br", []))
          break
        case "link": {
          const attrs: Attr[] = [
            { name: "href", value: this.attrValue(token.href) },
          ]
          if (token.title) attrs.push(staticAttr("title", token.title))
          out.push(element("a", this.inline(token.tokens), attrs))
          break
        }
        case "image": {
          const attrs: Attr[] = [
            { name: "src", value: this.attrValue(token.href) },
            staticAttr("alt", token.text ?? ""),
          ]
          if (token.title) attrs.push(staticAttr("title", token.title))
          out.push(element("img", [], attrs))
          break
        }
        case "checkbox": {
          const attrs = [staticAttr("type", "checkbox"), staticAttr("disabled", true)]
          if (token.checked) attrs.push(staticAttr("checked", true))
          out.push(element("input", [], attrs))
          pushText(out, " ")
          break
        }
        default:
          if ("text" in token && typeof token.text === "string") {
            this.text(out, token.text)
          }
      }
    }
    return out
  }

  blocks(tokens: Token[], out: Node[] = []): Node[] {
    for (const token of tokens) {
      switch (token.type) {
        case "space":
        case "def":
          break
        case "paragraph":
          out.push(element("p", this.inline(token.tokens)))
          break
        case "heading":
          out.push(element(`h${token.depth}`, this.inline(token.tokens)))
          break
        case "hr":
          out.push(element("hr", []))
          break
        case "blockquote":
          out.push(element("blockquote", this.blocks(token.tokens ?? [])))
          break
        case "code": {
          const attrs = token.lang ? [staticAttr("lang", token.lang)] : []
          out.push(element("pre", [{ type: "text", value: token.text }], attrs))
          break
        }
        case "list": {
          const attrs: Attr[] = []
          if (token.ordered && typeof token.start === "number" && token.start !== 1) {
            attrs.push(staticAttr("start", String(token.start)))
          }
          const items = (token.items as Token[]).map((item) =>
            element("li", this.listItem(item))
          )
          out.push(element(token.ordered ? "ol" : "ul", items, attrs))
          break
        }
        case "table": {
          const cell = (
            name: "th" | "td",
            data: { tokens: Token[]; align: string | null }
          ) =>
            element(
              name,
              this.inline(data.tokens),
              data.align ? [staticAttr("align", data.align)] : []
            )
          const head = element("thead", [
            element(
              "tr",
              token.header.map((data: never) => cell("th", data))
            ),
          ])
          const body = element(
            "tbody",
            token.rows.map((row: never[]) =>
              element(
                "tr",
                row.map((data) => cell("td", data))
              )
            )
          )
          out.push(element("table", [head, body]))
          break
        }
        case "text":
          this.inline("tokens" in token ? token.tokens : undefined, out)
          break
        default:
          if ("tokens" in token && token.tokens) this.inline(token.tokens, out)
      }
    }
    return out
  }

  private listItem(item: Token): Node[] {
    const out: Node[] = []
    for (const token of ("tokens" in item && item.tokens) || []) {
      if (token.type === "text" || token.type === "checkbox") {
        this.inline([token], out)
      } else {
        this.blocks([token], out)
      }
    }
    return out
  }
}

function dedent(lines: string[]): string {
  let indent = Number.POSITIVE_INFINITY
  for (const line of lines) {
    if (!line.trim()) continue
    const match = /^[ \t]*/.exec(line)
    indent = Math.min(indent, match ? match[0].length : 0)
  }
  if (!Number.isFinite(indent) || indent === 0) return lines.join("\n")
  return lines.map((line) => line.slice(indent)).join("\n")
}

/**
 * While text is still streaming in, closes emphasis and code that have been
 * opened but not finished, so half a sentence doesn't flash raw `**`.
 */
export function healMarkdownTail(text: string): string {
  const fences = text.match(/^[ \t]*(```|~~~)/gm)
  if (fences && fences.length % 2 === 1) return text
  const cut = text.lastIndexOf("\n\n") + 1
  const head = text.slice(0, cut)
  let tail = text.slice(cut)
  tail = tail.replace(/(!?)\[([^\]\n]*)\]\([^)\n]*$/, (_, bang, label) =>
    bang ? "" : label
  )
  tail = tail.replace(/!\[[^\]\n]*$/, "")
  for (const marker of ["**", "~~", "`"]) {
    const count = tail.split(marker).length - 1
    if (count % 2 === 0) continue
    const trimmed = tail.trimEnd()
    if (trimmed.endsWith(marker)) {
      tail = trimmed.slice(0, -marker.length)
    } else {
      tail = trimmed + marker
    }
  }
  return head + tail
}

function plainChildren(items: RawChild[]): Node[] {
  const out: Node[] = []
  const multiline = items.some(
    (item) => typeof item === "string" && item.includes("\n")
  )
  for (const item of items) {
    if (typeof item !== "string") {
      out.push(item)
      continue
    }
    if (!item.trim()) {
      if (!multiline && item) pushText(out, " ")
      continue
    }
    let text = item.replace(/\s*\n\s*/g, " ")
    if (multiline) text = text.trim()
    pushText(out, decodeEntities(text))
  }
  return out
}

const INLINE_TAGS = new Set([
  "a", "abbr", "b", "badge", "cite", "code", "del", "em", "i", "icon", "ins", "kbd",
  "link", "mark", "q", "s", "small", "span", "strong", "sub", "sup", "text", "time",
  "u", "var", "Number",
])

function isInline(node: RawChild | undefined): boolean {
  if (!node || typeof node === "string") return false
  if (node.type === "expr") return true
  return node.type === "element" && INLINE_TAGS.has(node.name)
}

/**
 * Children with no words between them. A space on one line between two
 * inline things is a word space, as in `{count} {unit}`; everything else is
 * indentation.
 */
function keepInlineSpaces(items: RawChild[]): Node[] {
  const out: Node[] = []
  items.forEach((item, index) => {
    if (typeof item !== "string") {
      out.push(item)
    } else if (
      item &&
      !item.includes("\n") &&
      isInline(items[index - 1]) &&
      isInline(items[index + 1])
    ) {
      out.push({ type: "text", value: " " })
    }
  })
  return out
}

/**
 * Turns the text between nodes into Markdown elements, keeping the nodes in
 * place. Nodes on a line of their own sit between blocks; nodes inside a line
 * of text stay inline.
 */
export function finishChildren(
  items: RawChild[],
  mode: ContentMode,
  tail = false
): Node[] {
  if (mode === "plain") return plainChildren(items)

  const nodes: Node[] = []
  let source = ""
  let hasText = false
  for (const item of items) {
    if (typeof item === "string") {
      source += item
      if (!hasText && item.trim()) hasText = true
    } else {
      source += `${OPEN}${nodes.length}${CLOSE}`
      nodes.push(item)
    }
  }
  if (!hasText) return keepInlineSpaces(items)

  const converter = new Converter(nodes)
  const body = source.replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "")

  const inline =
    !body.includes("\n") &&
    (mode === "flow" || (mode === "branch" && !source.includes("\n")))
  if (inline) {
    const text = body === source ? source : body.trim()
    return converter.inline(
      markdown.Lexer.lexInline(tail ? healMarkdownTail(text) : text, markdown.defaults)
    )
  }

  const out: Node[] = []
  const paragraphs: number[] = []
  let markdownBlocks = 0
  const lines = body.split("\n")
  let chunk: string[] = []
  const flush = (isLast: boolean) => {
    if (!chunk.some((line) => line.trim())) {
      chunk = []
      return
    }
    let text = dedent(chunk)
    chunk = []
    if (tail && isLast) text = healMarkdownTail(text)
    const start = out.length
    converter.blocks(markdown.lexer(text), out)
    for (let i = start; i < out.length; i++) {
      markdownBlocks++
      const node = out[i]
      if (node?.type === "element" && node.name === "p") paragraphs.push(i)
    }
  }
  for (const line of lines) {
    if (ONLY_PLACEHOLDERS.test(line)) {
      flush(false)
      converter.text(out, line.trim().replace(/\s+/g, ""))
    } else {
      chunk.push(line)
    }
  }
  flush(true)

  if (mode === "flow" && markdownBlocks === 1 && paragraphs.length === 1) {
    const index = paragraphs[0] as number
    const paragraph = out[index] as ElementNode
    out.splice(index, 1, ...paragraph.children)
  }
  return out
}
