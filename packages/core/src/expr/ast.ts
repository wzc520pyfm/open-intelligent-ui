export type Pattern =
  | { type: "Ident"; name: string }
  | { type: "ObjectPattern"; names: string[] }
  | { type: "ArrayPattern"; names: string[] }

export interface Spread {
  type: "Spread"
  arg: Expr
}

export type ObjectProp =
  | { type: "Prop"; key: string | Expr; computed: boolean; value: Expr }
  | Spread

export type Expr =
  | { type: "Literal"; value: string | number | boolean | null | undefined }
  | { type: "Ident"; name: string }
  | {
      type: "Member"
      object: Expr
      property: Expr | string
      computed: boolean
      optional: boolean
    }
  | { type: "Call"; callee: Expr; args: (Expr | Spread)[]; optional: boolean }
  | { type: "Unary"; op: "!" | "-" | "+" | "typeof" | "await"; arg: Expr }
  | { type: "Binary"; op: string; left: Expr; right: Expr }
  | { type: "Logical"; op: "&&" | "||" | "??"; left: Expr; right: Expr }
  | { type: "Cond"; test: Expr; then: Expr; else: Expr }
  | { type: "Array"; items: (Expr | Spread)[] }
  | { type: "Object"; props: ObjectProp[] }
  | { type: "Template"; quasis: string[]; exprs: Expr[] }
  | { type: "Arrow"; params: Pattern[]; body: Expr }
  | { type: "Assign"; op: string; target: Expr; value: Expr }
  | { type: "Update"; op: "++" | "--"; target: Expr; prefix: boolean }
  | { type: "Block"; body: Expr[] }
  | { type: "If"; test: Expr; then: Expr; else?: Expr }
  | { type: "Return"; arg?: Expr }
  | { type: "Let"; pattern: Pattern; init?: Expr }

export class ExprSyntaxError extends Error {
  readonly pos: number
  /** True when the input ended before the expression was complete. */
  readonly incomplete: boolean

  constructor(message: string, pos: number, incomplete = false) {
    super(message)
    this.name = "ExprSyntaxError"
    this.pos = pos
    this.incomplete = incomplete
  }
}

export class ExprRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ExprRuntimeError"
  }
}
