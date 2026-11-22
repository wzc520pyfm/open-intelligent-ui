import { describe, expect, test } from "vitest"
import {
  createBuiltins,
  type EvalHost,
  evaluate,
  ExprRuntimeError,
  ExprSyntaxError,
  parseExpression,
  parseProgram,
  registerCallable,
  run,
  Scope,
} from "../src/expr"

function createHost(initial: Record<string, unknown> = {}) {
  const state = new Map(Object.entries(initial))
  const calls: unknown[][] = []
  const host: EvalHost = {
    lookup: (name) =>
      state.has(name)
        ? { found: true, value: state.get(name) }
        : { found: false },
    assign: (name, value) => {
      state.set(name, value)
    },
    functions: createBuiltins({ locale: "en-US", now: () => 1_700_000_000_000 }),
    actions: {
      send: registerCallable((...args: unknown[]) => {
        calls.push(["send", ...args])
      }),
      call: registerCallable(async (...args: unknown[]) => {
        calls.push(["call", ...args])
        return { ok: true, id: 7 }
      }),
    },
  }
  return { host, state, calls }
}

function calc(src: string, initial?: Record<string, unknown>) {
  const { host } = createHost(initial)
  return evaluate(parseExpression(src), new Scope(), host)
}

describe("expressions", () => {
  test("arithmetic and precedence", () => {
    expect(calc("1 + 2 * 3")).toBe(7)
    expect(calc("(1 + 2) * 3")).toBe(9)
    expect(calc("2 ** 3 ** 2")).toBe(512)
    expect(calc("-2 + 10 % 4")).toBe(0)
    expect(calc("7 / 2")).toBe(3.5)
  })

  test("comparison, logic and conditionals", () => {
    expect(calc("3 > 2 && 2 >= 2")).toBe(true)
    expect(calc("null ?? 'fallback'")).toBe("fallback")
    expect(calc("0 || 5")).toBe(5)
    expect(calc("a > 5 ? 'big' : 'small'", { a: 9 })).toBe("big")
    expect(calc("a === 'x' ? 1 : a === 'y' ? 2 : 3", { a: "y" })).toBe(2)
    expect(calc("x?.5:1", { x: true })).toBe(0.5)
  })

  test("strings and template literals", () => {
    expect(calc("'a' + 1")).toBe("a1")
    expect(calc("`${n} guests`", { n: 6 })).toBe("6 guests")
    expect(calc("`${missing} left`")).toBe(" left")
    expect(calc("'Hello'.toUpperCase().slice(0, 2)")).toBe("HE")
    expect(calc("'a,b'.split(',')")).toEqual(["a", "b"])
  })

  test("objects, arrays and spread", () => {
    expect(calc("{ a: 1, b, ...rest }", { b: 2, rest: { c: 3 } })).toEqual({
      a: 1,
      b: 2,
      c: 3,
    })
    expect(calc("[...list, 4].length", { list: [1, 2, 3] })).toBe(4)
    expect(calc("user.address?.city", { user: {} })).toBeUndefined()
    expect(calc("rows[1].name", { rows: [{ name: "a" }, { name: "b" }] })).toBe(
      "b"
    )
  })

  test("arrow functions and array methods", () => {
    const items = [
      { name: "Lamb", price: 30, qty: 2 },
      { name: "Potatoes", price: 4, qty: 3 },
    ]
    expect(calc("sum(items.map(i => i.price * i.qty))", { items })).toBe(72)
    expect(
      calc("items.filter(({ price }) => price > 10).map(i => i.name)", { items })
    ).toEqual(["Lamb"])
    expect(calc("items.reduce((t, i) => t + i.qty, 0)", { items })).toBe(5)
    expect(calc("[3, 1, 2].sort()")).toEqual([1, 2, 3])
    expect(calc("[3, 1, 2].sort((a, b) => b - a)")).toEqual([3, 2, 1])
    expect(calc("sortBy(items, 'price')[0].name", { items })).toBe("Potatoes")
  })

  test("sort does not change the original list", () => {
    const { host, state } = createHost({ list: [3, 1, 2] })
    evaluate(parseExpression("list.sort()"), new Scope(), host)
    expect(state.get("list")).toEqual([3, 1, 2])
  })

  test("formatting helpers", () => {
    expect(calc("currency(1234.5)")).toBe("$1,234.50")
    expect(calc("currency(12, 'EUR', 0)")).toBe("€12")
    expect(calc("percent(0.256, 1)")).toBe("25.6%")
    expect(calc("compact(15300)")).toBe("15.3K")
    expect(calc("num(1234.5678)")).toBe("1,234.57")
    expect(calc("plural(1, 'guest')")).toBe("guest")
    expect(calc("plural(3, 'guest')")).toBe("guests")
    expect(calc("duration(3725)")).toBe("1h 2m")
    expect(calc("date('2026-03-09', 'long')")).toBe("March 9, 2026")
    expect(calc("round(2.345, 2)")).toBe(2.35)
    expect(calc("clamp(12, 0, 10)")).toBe(10)
    expect(calc("range(3)")).toEqual([0, 1, 2])
    expect(calc("Math.max(1, 5, 3)")).toBe(5)
  })

  test("unknown names are undefined instead of throwing", () => {
    expect(calc("nope")).toBeUndefined()
    expect(calc("nope.deeper.still")).toBeUndefined()
    expect(calc("nope ?? 3")).toBe(3)
  })
})

describe("safety", () => {
  test("prototype chains are unreachable", () => {
    expect(calc("({}).constructor")).toBeUndefined()
    expect(calc("[].constructor")).toBeUndefined()
    expect(calc("'a'.constructor")).toBeUndefined()
    expect(calc("({}).__proto__")).toBeUndefined()
    expect(calc("x['__proto__']", { x: {} })).toBeUndefined()
    expect(calc("Math.constructor")).toBeUndefined()
    expect(calc("[].map")).toBeUndefined()
    expect(calc("[].map.call([], 1)")).toBeUndefined()
  })

  test("only registered functions can be called", () => {
    const { host } = createHost({ evil: () => "pwned" })
    expect(() =>
      evaluate(parseExpression("evil()"), new Scope(), host)
    ).toThrow(ExprRuntimeError)
  })

  test("unsupported syntax is rejected at parse time", () => {
    for (const src of [
      "new Date()",
      "this",
      "function () {}",
      "a = > 1",
      "delete a.b",
      "import('x')",
      "while (true) {}",
    ]) {
      expect(() => parseProgram(src), src).toThrow(ExprSyntaxError)
    }
  })

  test("render mode cannot change state or call actions", () => {
    const { host, state } = createHost({ count: 1 })
    expect(() =>
      evaluate(parseProgram("count = 2"), new Scope(), host)
    ).toThrow(/event handler/)
    expect(() =>
      evaluate(parseProgram("send('hi')"), new Scope(), host)
    ).toThrow(/event handler/)
    expect(() =>
      evaluate(parseProgram("list.push(1)"), new Scope(), {
        ...host,
        lookup: () => ({ found: true, value: [] }),
      })
    ).toThrow(/event handler/)
    expect(state.get("count")).toBe(1)
  })

  test("runaway work is stopped", () => {
    expect(() => calc("range(100000000)")).toThrow(/too long/)
    expect(() => calc("'x'.repeat(100000000)")).toThrow(/too long/)
    expect(() =>
      calc("range(9000).map(a => range(9000).map(b => a * b))")
    ).toThrow(/too long/)
    const { host } = createHost()
    expect(() =>
      run(
        parseProgram("const f = (n) => f(n + 1); f(0)"),
        new Scope(),
        host
      )
    ).toThrow(/recursion|too long/)
  })

  test("incomplete input is flagged for streaming", () => {
    try {
      parseExpression("items.map(i => i.")
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ExprSyntaxError)
      expect((error as ExprSyntaxError).incomplete).toBe(true)
    }
    try {
      parseExpression("a +* b")
      expect.unreachable()
    } catch (error) {
      expect((error as ExprSyntaxError).incomplete).toBe(false)
    }
  })
})

describe("actions", () => {
  const setup = createHost

  test("assignment and compound assignment", () => {
    const { host, state } = setup({ count: 1, name: "a" })
    run(parseProgram("count += 2; name = name + 'b'"), new Scope(), host)
    expect(state.get("count")).toBe(3)
    expect(state.get("name")).toBe("ab")
    run(parseProgram("count++"), new Scope(), host)
    expect(state.get("count")).toBe(4)
  })

  test("nested writes copy on the way down", () => {
    const original = { profile: { tags: ["a"], name: "x" } }
    const { host, state } = setup({ user: original })
    run(parseProgram("user.profile.tags[1] = 'b'"), new Scope(), host)
    expect(state.get("user")).toEqual({
      profile: { tags: ["a", "b"], name: "x" },
    })
    expect(original.profile.tags).toEqual(["a"])
    expect(state.get("user")).not.toBe(original)
  })

  test("array mutators write back a copy", () => {
    const original = [1, 2]
    const { host, state } = setup({ list: original })
    run(parseProgram("list.push(3); list.shift()"), new Scope(), host)
    expect(state.get("list")).toEqual([2, 3])
    expect(original).toEqual([1, 2])
  })

  test("a loop variable writes through to its list", () => {
    const { host, state } = setup({
      todos: [
        { title: "a", done: false },
        { title: "b", done: false },
      ],
    })
    const scope = new Scope()
    const loop = scope.child()
    const todos = state.get("todos") as unknown[]
    loop.declare("todo", todos[1], {
      scope,
      expr: parseExpression("todos[1]"),
    })
    run(parseProgram("todo.done = !todo.done"), loop, host)
    expect(state.get("todos")).toEqual([
      { title: "a", done: false },
      { title: "b", done: true },
    ])
  })

  test("handlers can be arrow functions with blocks", () => {
    const { host, state } = setup({ tab: "a", log: [] })
    const handler = run(
      parseProgram(
        "(value) => { if (value !== tab) { log = [...log, value]; tab = value } }"
      ),
      new Scope(),
      host
    ) as (value: string) => void
    handler("b")
    handler("b")
    expect(state.get("tab")).toBe("b")
    expect(state.get("log")).toEqual(["b"])
  })

  test("statements separated by new lines", () => {
    const { host, state } = setup({ a: 0, b: 0 })
    run(parseProgram("a = 1\nb = 2"), new Scope(), host)
    expect([state.get("a"), state.get("b")]).toEqual([1, 2])
  })

  test("if / else and early return", () => {
    const { host, state } = setup({ n: 5, label: "" })
    run(
      parseProgram(
        "if (n > 3) label = 'high'; else label = 'low'; if (n > 3) return; label = 'unreachable'"
      ),
      new Scope(),
      host
    )
    expect(state.get("label")).toBe("high")
  })

  test("promises are awaited between statements", async () => {
    const { host, state, calls } = setup({ result: null, order: [] })
    const done = run(
      parseProgram(
        "const response = call('orders.update', { id: 1 }); result = response.id; send('saved ' + result)"
      ),
      new Scope(),
      host
    )
    expect(state.get("result")).toBeNull()
    await done
    expect(state.get("result")).toBe(7)
    expect(calls).toEqual([
      ["call", "orders.update", { id: 1 }],
      ["send", "saved 7"],
    ])
  })
})
