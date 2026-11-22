import { ExprSyntaxError } from "./ast"

type TokenBody =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "tpl"; quasis: string[]; exprs: string[] }
  | { type: "ident"; value: string }
  | { type: "punct"; value: string }
  | { type: "eof" }

/** `nl` is true when a line break comes before the token. */
export type Token = TokenBody & { pos: number; nl: boolean }

const PUNCTUATORS = [
  "...",
  "===",
  "!==",
  "**=",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "??",
  "?.",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "++",
  "--",
  "**",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  ",",
  ";",
  ":",
  ".",
  "?",
  "!",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
]

const IDENT_START = /[A-Za-z_$\u00A0-\uFFFF]/
const IDENT_PART = /[A-Za-z0-9_$\u00A0-\uFFFF]/

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
}

function readEscape(src: string, i: number): { value: string; next: number } {
  const ch = src[i + 1]
  if (ch === undefined) {
    throw new ExprSyntaxError("Unterminated escape", i, true)
  }
  if (ch === "u") {
    if (src[i + 2] === "{") {
      const end = src.indexOf("}", i + 3)
      if (end === -1) throw new ExprSyntaxError("Bad unicode escape", i, true)
      const code = Number.parseInt(src.slice(i + 3, end), 16)
      return { value: String.fromCodePoint(code || 0), next: end + 1 }
    }
    const code = Number.parseInt(src.slice(i + 2, i + 6), 16)
    return { value: String.fromCharCode(code || 0), next: i + 6 }
  }
  if (ch === "x") {
    const code = Number.parseInt(src.slice(i + 2, i + 4), 16)
    return { value: String.fromCharCode(code || 0), next: i + 4 }
  }
  return { value: ESCAPES[ch] ?? ch, next: i + 2 }
}

/**
 * Finds the index just past a template literal that starts at `start`
 * (the opening backtick). Returns -1 when it is not closed.
 */
function skipTemplate(src: string, start: number): number {
  let i = start + 1
  while (i < src.length) {
    const ch = src[i]
    if (ch === "\\") {
      i += 2
    } else if (ch === "`") {
      return i + 1
    } else if (ch === "$" && src[i + 1] === "{") {
      const end = findClosingBrace(src, i + 1)
      if (end === -1) return -1
      i = end + 1
    } else {
      i++
    }
  }
  return -1
}

/**
 * Given the index of an opening `{`, returns the index of its matching `}`,
 * skipping strings, template literals and nested brackets. Returns -1 when
 * the source ends first, which is how streaming input shows up.
 */
export function findClosingBrace(src: string, open: number): number {
  let depth = 0
  let i = open
  while (i < src.length) {
    const ch = src[i]
    if (ch === '"' || ch === "'") {
      i++
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\n") return -1
        if (src[i] === "\\") i++
        i++
      }
      if (i >= src.length) return -1
      i++
    } else if (ch === "`") {
      const end = skipTemplate(src, i)
      if (end === -1) return -1
      i = end
    } else if (ch === "{" || ch === "(" || ch === "[") {
      depth++
      i++
    } else if (ch === "}" || ch === ")" || ch === "]") {
      depth--
      if (depth === 0) return ch === "}" ? i : -1
      if (depth < 0) return -1
      i++
    } else {
      i++
    }
  }
  return -1
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let nl = false
  const n = src.length
  const push = (body: TokenBody, pos: number) => {
    tokens.push({ ...body, pos, nl } as Token)
    nl = false
  }

  while (i < n) {
    const ch = src[i]!

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (ch === "\n") nl = true
      i++
      continue
    }

    if (ch === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++
      continue
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2)
      if (end === -1) throw new ExprSyntaxError("Unterminated comment", i, true)
      i = end + 2
      continue
    }

    if (
      (ch >= "0" && ch <= "9") ||
      (ch === "." && src[i + 1]! >= "0" && src[i + 1]! <= "9")
    ) {
      const match = /^(?:0[xX][0-9a-fA-F]+|(?:\d[\d_]*)?\.?\d[\d_]*(?:[eE][+-]?\d+)?)/.exec(
        src.slice(i)
      )
      const raw = match ? match[0] : ch
      push({ type: "num", value: Number(raw.replaceAll("_", "")) }, i)
      i += raw.length
      continue
    }

    if (ch === '"' || ch === "'") {
      const start = i
      let value = ""
      i++
      while (true) {
        if (i >= n) {
          throw new ExprSyntaxError("Unterminated string", start, true)
        }
        const c = src[i]!
        if (c === ch) break
        if (c === "\\") {
          const escape = readEscape(src, i)
          value += escape.value
          i = escape.next
        } else {
          value += c
          i++
        }
      }
      i++
      push({ type: "str", value }, start)
      continue
    }

    if (ch === "`") {
      const start = i
      const quasis: string[] = []
      const exprs: string[] = []
      let current = ""
      i++
      while (true) {
        if (i >= n) {
          throw new ExprSyntaxError("Unterminated template", start, true)
        }
        const c = src[i]!
        if (c === "`") break
        if (c === "\\") {
          const escape = readEscape(src, i)
          current += escape.value
          i = escape.next
        } else if (c === "$" && src[i + 1] === "{") {
          const end = findClosingBrace(src, i + 1)
          if (end === -1) {
            throw new ExprSyntaxError("Unterminated template", start, true)
          }
          quasis.push(current)
          current = ""
          exprs.push(src.slice(i + 2, end))
          i = end + 1
        } else {
          current += c
          i++
        }
      }
      quasis.push(current)
      i++
      push({ type: "tpl", quasis, exprs }, start)
      continue
    }

    if (IDENT_START.test(ch)) {
      const start = i
      i++
      while (i < n && IDENT_PART.test(src[i]!)) i++
      push({ type: "ident", value: src.slice(start, i) }, start)
      continue
    }

    const punct = PUNCTUATORS.find((p) => src.startsWith(p, i))
    if (punct) {
      // `?.5` is a conditional followed by a number, not optional chaining.
      if (punct === "?." && /\d/.test(src[i + 2] ?? "")) {
        push({ type: "punct", value: "?" }, i)
        i += 1
        continue
      }
      push({ type: "punct", value: punct }, i)
      i += punct.length
      continue
    }

    throw new ExprSyntaxError(`Unexpected character "${ch}"`, i)
  }

  push({ type: "eof" }, n)
  return tokens
}
