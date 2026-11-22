import {
  type Expr,
  ExprSyntaxError,
  type ObjectProp,
  type Pattern,
  type Spread,
} from "./ast"
import { type Token, tokenize } from "./tokenizer"

const BINARY_PRECEDENCE: Record<string, number> = {
  "??": 1,
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "===": 4,
  "!==": 4,
  "<": 5,
  ">": 5,
  "<=": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
  "**": 8,
}

const ASSIGN_OPS = new Set(["=", "+=", "-=", "*=", "/=", "%=", "**="])
const KEYWORD_LITERALS: Record<string, unknown> = {
  true: true,
  false: false,
  null: null,
  undefined: undefined,
}
const RESERVED = new Set([
  "new",
  "this",
  "function",
  "class",
  "delete",
  "void",
  "import",
  "export",
  "while",
  "for",
  "do",
  "switch",
  "try",
  "throw",
  "yield",
  "async",
  "var",
  "in",
  "instanceof",
])

class Parser {
  private readonly tokens: Token[]
  private index = 0

  constructor(src: string) {
    this.tokens = tokenize(src)
  }

  private get token(): Token {
    return this.tokens[this.index]!
  }

  private peek(offset = 1): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)]!
  }

  private isPunct(value: string, token: Token = this.token): boolean {
    return token.type === "punct" && token.value === value
  }

  private isIdent(value: string, token: Token = this.token): boolean {
    return token.type === "ident" && token.value === value
  }

  private fail(message: string, token: Token = this.token): never {
    throw new ExprSyntaxError(message, token.pos, token.type === "eof")
  }

  private eat(value: string): boolean {
    if (this.isPunct(value)) {
      this.index++
      return true
    }
    return false
  }

  private expect(value: string): void {
    if (!this.eat(value)) this.fail(`Expected "${value}"`)
  }

  parseProgram(): Expr {
    const body = this.parseStatements(() => this.token.type === "eof")
    if (body.length === 1) return body[0]!
    if (body.length === 0) return { type: "Literal", value: undefined }
    return { type: "Block", body }
  }

  private parseStatements(atEnd: () => boolean): Expr[] {
    const body: Expr[] = []
    while (true) {
      while (this.eat(";")) {
        // Empty statements are allowed.
      }
      if (atEnd()) break
      if (this.token.type === "eof") this.fail("Unexpected end of input")
      body.push(this.parseStatement())
      if (
        !atEnd() &&
        !this.isPunct(";") &&
        !this.token.nl &&
        !this.followsStatement()
      ) {
        this.fail('Expected ";"')
      }
    }
    return body
  }

  /** A block statement such as `if` needs no semicolon after it. */
  private followsStatement(): boolean {
    const previous = this.tokens[this.index - 1]
    return previous?.type === "punct" && previous.value === "}"
  }

  private parseStatement(): Expr {
    const token = this.token
    if (token.type === "ident") {
      if (token.value === "if") return this.parseIf()
      if (token.value === "return") {
        this.index++
        if (
          this.isPunct(";") ||
          this.isPunct("}") ||
          this.token.type === "eof"
        ) {
          return { type: "Return" }
        }
        return { type: "Return", arg: this.parseExpression() }
      }
      if (
        (token.value === "const" || token.value === "let") &&
        (this.peek().type === "ident" ||
          this.isPunct("{", this.peek()) ||
          this.isPunct("[", this.peek()))
      ) {
        this.index++
        const pattern = this.parsePattern()
        let init: Expr | undefined
        if (this.eat("=")) init = this.parseExpression()
        return { type: "Let", pattern, init }
      }
    }
    return this.parseExpression()
  }

  private parseIf(): Expr {
    this.index++
    this.expect("(")
    const test = this.parseExpression()
    this.expect(")")
    const then = this.parseBranch()
    let otherwise: Expr | undefined
    const ateSemicolon = this.isPunct(";") && this.isIdent("else", this.peek())
    if (ateSemicolon) this.index++
    if (this.isIdent("else")) {
      this.index++
      otherwise = this.isIdent("if") ? this.parseIf() : this.parseBranch()
    }
    return { type: "If", test, then, else: otherwise }
  }

  private parseBranch(): Expr {
    if (this.isPunct("{")) return this.parseBlock()
    return this.parseStatement()
  }

  private parseBlock(): Expr {
    this.expect("{")
    const body = this.parseStatements(() => this.isPunct("}"))
    this.expect("}")
    return { type: "Block", body }
  }

  private parsePattern(): Pattern {
    if (this.eat("{")) {
      const names: string[] = []
      while (!this.isPunct("}")) {
        names.push(this.parseBindingName())
        if (!this.eat(",")) break
      }
      this.expect("}")
      return { type: "ObjectPattern", names }
    }
    if (this.eat("[")) {
      const names: string[] = []
      while (!this.isPunct("]")) {
        names.push(this.parseBindingName())
        if (!this.eat(",")) break
      }
      this.expect("]")
      return { type: "ArrayPattern", names }
    }
    return { type: "Ident", name: this.parseBindingName() }
  }

  private parseBindingName(): string {
    const token = this.token
    if (token.type !== "ident" || RESERVED.has(token.value)) {
      this.fail("Expected a name")
    }
    this.index++
    return token.value
  }

  parseExpression(): Expr {
    return this.parseAssignment()
  }

  private parseAssignment(): Expr {
    const arrow = this.tryParseArrow()
    if (arrow) return arrow

    const left = this.parseConditional()
    const token = this.token
    if (token.type === "punct" && ASSIGN_OPS.has(token.value)) {
      if (left.type !== "Ident" && left.type !== "Member") {
        this.fail("Invalid assignment target")
      }
      this.index++
      const value = this.parseAssignment()
      return { type: "Assign", op: token.value, target: left, value }
    }
    return left
  }

  private tryParseArrow(): Expr | null {
    const token = this.token
    if (this.isIdent("async") && (this.isPunct("(", this.peek()) || this.peek().type === "ident")) {
      const saved = this.index
      this.index++
      const arrow = this.tryParseArrow()
      if (arrow) return arrow
      this.index = saved
      return null
    }
    if (token.type === "ident" && this.isPunct("=>", this.peek())) {
      if (RESERVED.has(token.value)) this.fail("Unexpected keyword")
      this.index += 2
      return {
        type: "Arrow",
        params: [{ type: "Ident", name: token.value }],
        body: this.parseArrowBody(),
      }
    }
    if (!this.isPunct("(")) return null

    // Find the matching ")" and check whether "=>" follows it.
    let depth = 0
    let i = this.index
    for (; i < this.tokens.length; i++) {
      const t = this.tokens[i]!
      if (t.type === "eof") return null
      if (t.type !== "punct") continue
      if (t.value === "(" || t.value === "[" || t.value === "{") depth++
      else if (t.value === ")" || t.value === "]" || t.value === "}") {
        depth--
        if (depth === 0) break
      }
    }
    if (!this.isPunct("=>", this.tokens[i + 1])) return null

    this.index++
    const params: Pattern[] = []
    while (!this.isPunct(")")) {
      params.push(this.parsePattern())
      if (!this.eat(",")) break
    }
    this.expect(")")
    this.expect("=>")
    return { type: "Arrow", params, body: this.parseArrowBody() }
  }

  private parseArrowBody(): Expr {
    if (this.isPunct("{")) return this.parseBlock()
    return this.parseAssignment()
  }

  private parseConditional(): Expr {
    const test = this.parseBinary(0)
    if (!this.eat("?")) return test
    const then = this.parseAssignment()
    this.expect(":")
    const otherwise = this.parseAssignment()
    return { type: "Cond", test, then, else: otherwise }
  }

  private parseBinary(minPrecedence: number): Expr {
    let left = this.parseUnary()
    while (true) {
      const token = this.token
      if (token.type !== "punct") break
      const precedence = BINARY_PRECEDENCE[token.value]
      if (precedence === undefined || precedence <= minPrecedence) break
      this.index++
      // "**" is right associative.
      const right = this.parseBinary(
        token.value === "**" ? precedence - 1 : precedence
      )
      if (token.value === "&&" || token.value === "||" || token.value === "??") {
        left = { type: "Logical", op: token.value, left, right }
      } else {
        left = { type: "Binary", op: token.value, left, right }
      }
    }
    return left
  }

  private parseUnary(): Expr {
    const token = this.token
    if (token.type === "punct") {
      if (token.value === "!" || token.value === "-" || token.value === "+") {
        this.index++
        return { type: "Unary", op: token.value, arg: this.parseUnary() }
      }
      if (token.value === "++" || token.value === "--") {
        this.index++
        const target = this.parseUnary()
        return { type: "Update", op: token.value, target, prefix: true }
      }
    }
    if (token.type === "ident") {
      if (token.value === "typeof" || token.value === "await") {
        this.index++
        return { type: "Unary", op: token.value, arg: this.parseUnary() }
      }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expr {
    const expr = this.parseCallMember()
    const token = this.token
    if (
      token.type === "punct" &&
      (token.value === "++" || token.value === "--")
    ) {
      if (expr.type !== "Ident" && expr.type !== "Member") {
        this.fail("Invalid update target")
      }
      this.index++
      return { type: "Update", op: token.value, target: expr, prefix: false }
    }
    return expr
  }

  private parseCallMember(): Expr {
    let expr = this.parsePrimary()
    while (true) {
      if (this.eat(".")) {
        const token = this.token
        if (token.type !== "ident") this.fail("Expected a property name")
        this.index++
        expr = {
          type: "Member",
          object: expr,
          property: token.value,
          computed: false,
          optional: false,
        }
      } else if (this.eat("?.")) {
        if (this.eat("(")) {
          expr = {
            type: "Call",
            callee: expr,
            args: this.parseArguments(),
            optional: true,
          }
        } else if (this.eat("[")) {
          const property = this.parseExpression()
          this.expect("]")
          expr = {
            type: "Member",
            object: expr,
            property,
            computed: true,
            optional: true,
          }
        } else {
          const token = this.token
          if (token.type !== "ident") this.fail("Expected a property name")
          this.index++
          expr = {
            type: "Member",
            object: expr,
            property: token.value,
            computed: false,
            optional: true,
          }
        }
      } else if (this.eat("[")) {
        const property = this.parseExpression()
        this.expect("]")
        expr = {
          type: "Member",
          object: expr,
          property,
          computed: true,
          optional: false,
        }
      } else if (this.eat("(")) {
        expr = {
          type: "Call",
          callee: expr,
          args: this.parseArguments(),
          optional: false,
        }
      } else {
        return expr
      }
    }
  }

  private parseArguments(): (Expr | Spread)[] {
    const args: (Expr | Spread)[] = []
    while (!this.isPunct(")")) {
      if (this.eat("...")) {
        args.push({ type: "Spread", arg: this.parseAssignment() })
      } else {
        args.push(this.parseAssignment())
      }
      if (!this.eat(",")) break
    }
    this.expect(")")
    return args
  }

  private parsePrimary(): Expr {
    const token = this.token
    switch (token.type) {
      case "num":
      case "str":
        this.index++
        return { type: "Literal", value: token.value }
      case "tpl":
        this.index++
        return {
          type: "Template",
          quasis: token.quasis,
          exprs: token.exprs.map((src) => parseExpression(src)),
        }
      case "ident": {
        if (token.value in KEYWORD_LITERALS) {
          this.index++
          return {
            type: "Literal",
            value: KEYWORD_LITERALS[token.value] as null,
          }
        }
        if (RESERVED.has(token.value)) {
          this.fail(`"${token.value}" is not supported`)
        }
        this.index++
        return { type: "Ident", name: token.value }
      }
      case "punct": {
        if (token.value === "(") {
          this.index++
          const expr = this.parseExpression()
          this.expect(")")
          return expr
        }
        if (token.value === "[") return this.parseArray()
        if (token.value === "{") return this.parseObject()
        break
      }
      case "eof":
        break
    }
    return this.fail(
      token.type === "eof" ? "Unexpected end of input" : "Unexpected token"
    )
  }

  private parseArray(): Expr {
    this.expect("[")
    const items: (Expr | Spread)[] = []
    while (!this.isPunct("]")) {
      if (this.eat("...")) {
        items.push({ type: "Spread", arg: this.parseAssignment() })
      } else {
        items.push(this.parseAssignment())
      }
      if (!this.eat(",")) break
    }
    this.expect("]")
    return { type: "Array", items }
  }

  private parseObject(): Expr {
    this.expect("{")
    const props: ObjectProp[] = []
    while (!this.isPunct("}")) {
      if (this.eat("...")) {
        props.push({ type: "Spread", arg: this.parseAssignment() })
      } else if (this.eat("[")) {
        const key = this.parseExpression()
        this.expect("]")
        this.expect(":")
        props.push({
          type: "Prop",
          key,
          computed: true,
          value: this.parseAssignment(),
        })
      } else {
        const token = this.token
        let key: string
        if (token.type === "ident" || token.type === "str") {
          key = token.value
        } else if (token.type === "num") {
          key = String(token.value)
        } else {
          this.fail("Expected a property name")
        }
        this.index++
        if (this.eat(":")) {
          props.push({
            type: "Prop",
            key,
            computed: false,
            value: this.parseAssignment(),
          })
        } else {
          if (token.type !== "ident") this.fail('Expected ":"')
          props.push({
            type: "Prop",
            key,
            computed: false,
            value: { type: "Ident", name: key },
          })
        }
      }
      if (!this.eat(",")) break
    }
    this.expect("}")
    return { type: "Object", props }
  }

  parseEachHeader(): EachHeader {
    const list = this.parseConditional()
    if (!this.isIdent("as")) this.fail("Expected `as` after the list")
    this.index++
    const header: EachHeader = { list, pattern: this.parsePattern() }
    if (this.eat(",")) header.index = this.parseBindingName()
    if (this.eat("(")) {
      header.key = this.parseExpression()
      this.expect(")")
    }
    return header
  }

  finish(): void {
    if (this.token.type !== "eof") this.fail("Unexpected token")
  }
}

export interface EachHeader {
  list: Expr
  pattern: Pattern
  index?: string
  key?: Expr
}

/** Parses the inside of `{#each list as item, index (key)}`. */
export function parseEachHeader(src: string): EachHeader {
  const parser = new Parser(src)
  const header = parser.parseEachHeader()
  parser.finish()
  return header
}

/** Parses one expression, like `price * qty`. */
export function parseExpression(src: string): Expr {
  const parser = new Parser(src)
  const expr = parser.parseExpression()
  parser.finish()
  return expr
}

/**
 * Parses one or more statements separated by `;`, like `count += 1; send("Done")`.
 * A single statement comes back as that expression.
 */
export function parseProgram(src: string): Expr {
  const parser = new Parser(src)
  const expr = parser.parseProgram()
  parser.finish()
  return expr
}
