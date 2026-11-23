import { describe, expect, test } from "vitest"
import { type EvalHost, evaluate, parseExpression, parseProgram, run, Scope } from "../src/expr"
import { lazyRecord, plainArg } from "../src/renderer"

const host: EvalHost = {
  lookup: () => ({ found: false }),
  assign: () => {},
  functions: {},
  actions: {},
}

function calc(source: string, values: Record<string, unknown>) {
  const scope = new Scope()
  for (const [name, value] of Object.entries(values)) scope.declare(name, value)
  return evaluate(parseExpression(source), scope, host)
}

describe("what a component hands to markup", () => {
  test("is copied to plain data", () => {
    class Model {
      secret = 1
    }
    const given = { a: 1, list: [{ b: "x" }], run: () => 1, model: new Model(), when: new Date(0) }
    const plain = plainArg(given) as Record<string, unknown>
    expect(plain).not.toBe(given)
    expect(plain.a).toBe(1)
    expect(plain.list).toEqual([{ b: "x" }])
    expect(plain.run).toBeUndefined()
  })

  test("a lazy record asks for a field only when markup reads it", () => {
    const asked: string[] = []
    const state: Record<string, unknown> = {
      value: 40,
      items: [1, "gap", 3],
      nested: { deep: { on: true } },
      act: () => "ran",
    }
    const record = lazyRecord((name) => {
      asked.push(name)
      return state[name]
    })
    expect(asked).toEqual([])
    expect(plainArg(record)).toBe(record)

    expect(calc("progress.value + 2", { progress: record })).toBe(42)
    expect([...new Set(asked)]).toEqual(["value"])
    expect(calc("progress.items.length", { progress: record })).toBe(3)
    expect(calc("progress.nested.deep.on ? 'yes' : 'no'", { progress: record })).toBe("yes")
    expect(calc("progress['value']", { progress: record })).toBe(40)
    expect(calc("progress.missing ?? 'none'", { progress: record })).toBe("none")

    state.value = 75
    expect(calc("progress.value", { progress: record })).toBe(75)
  })

  test("a lazy record gives out plain data and nothing else", () => {
    const state: Record<string, unknown> = {
      act: () => "ran",
      element: { nodeType: 1, ownerDocument: globalThis },
      items: [() => 1, 2],
    }
    const record = lazyRecord((name) => state[name])
    expect(calc("progress.act", { progress: record })).toBeUndefined()
    expect(calc("progress.items", { progress: record })).toEqual([undefined, 2])
    expect(calc("progress.constructor", { progress: record })).toBeUndefined()
    expect(calc("progress.__proto__", { progress: record })).toBeUndefined()
    expect(calc("progress.toString", { progress: record })).toBeUndefined()
    expect(Object.keys(record)).toEqual([])
  })

  test("writing to a lazy record changes nothing", async () => {
    const state: Record<string, unknown> = { value: 40 }
    const record = lazyRecord((name) => state[name])
    const scope = new Scope()
    scope.declare("progress", record)
    await run(parseProgram("progress.value = 1"), scope, host)
    expect(state.value).toBe(40)
    expect(record.value).toBe(40)
  })
})
