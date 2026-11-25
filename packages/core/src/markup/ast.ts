import type { Expr, Pattern } from "../expr"

export type AttrValue =
  | { kind: "static"; value: string | true }
  | { kind: "expr"; expr: Expr; src: string }
  | { kind: "template"; parts: (string | Expr)[] }

export interface Attr {
  name: string
  value: AttrValue
}

export interface ElementNode {
  type: "element"
  name: string
  attrs: Attr[]
  children: Node[]
  /** `tag` was written as a tag; `markdown` came from Markdown syntax. */
  origin: "tag" | "markdown"
  /** True for `<svg>` and everything inside it. */
  svg: boolean
  pos: number
  /** False while the closing tag hasn't arrived yet. */
  closed: boolean
}

export interface TextNode {
  type: "text"
  value: string
}

export interface ExprNode {
  type: "expr"
  expr: Expr
  src: string
  pos: number
}

export interface IfNode {
  type: "if"
  /** `test` is null for the final `{:else}` branch. */
  branches: { test: Expr | null; children: Node[] }[]
  pos: number
}

export interface EachNode {
  type: "each"
  list: Expr
  pattern: Pattern
  index?: string
  key?: Expr
  children: Node[]
  /** Shown when the list is empty, from `{:else}`. */
  empty?: Node[]
  pos: number
}

export interface ConstNode {
  type: "const"
  pattern: Pattern
  expr: Expr
  pos: number
}

export type Node =
  | ElementNode
  | TextNode
  | ExprNode
  | IfNode
  | EachNode
  | ConstNode

/** What kind of problem a diagnostic is, for code that sorts or counts them. */
export type DiagnosticCode =
  /** A closing tag, `{:else}` or `{/if}` with nothing open to close. */
  | "stray-close"
  /** A block the language doesn't have, like `{#await}`. */
  | "unknown-block"
  /** A tag that never reaches its `>`. */
  | "unclosed-tag"
  /** An element or a block with no closing tag. The reply was probably cut short. */
  | "unclosed-element"
  /** A tag that is never let through, like `<script>`. */
  | "blocked-tag"
  /** A lowercase tag the language doesn't have. It is shown as text. */
  | "unknown-tag"
  /** An expression that can't be read. */
  | "bad-expression"
  /** Tags written inside `{…}`, as JSX has them. */
  | "tags-in-expression"

export interface Diagnostic {
  severity: "error" | "warning"
  code: DiagnosticCode
  message: string
  pos: number
}

export interface Document {
  type: "root"
  children: Node[]
  diagnostics: Diagnostic[]
  /**
   * False when the end of the input was held back because it stopped in the
   * middle of a tag or an expression. Only happens while streaming.
   */
  complete: boolean
  /** True when it was parsed while its source was still arriving: more may follow. */
  streaming?: boolean
}
