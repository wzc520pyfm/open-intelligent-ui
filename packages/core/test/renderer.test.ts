import { describe, expect, test, vi } from "vitest"
import { type EvalHost, evaluate, parseExpression, parseProgram, run, Scope } from "../src/expr"
import { parse } from "../src/markup"
import {
  chartValues,
  chartView,
  claimId,
  createRenderer,
  exitAnimations,
  lazyRecord,
  numberView,
  plainArg,
  readChartData,
  type View,
} from "../src/renderer"
import { Surface } from "../src/runtime/surface"

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

/** Every piece of text in a view, in order. */
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string" || typeof node === "number") out.push(String(node))
  else if (Array.isArray(node)) for (const child of node) texts(child, out)
  else if (node && typeof node === "object") texts((node as View).children, out)
  return out
}

/** The props a host component named `Plain`, or the element `tag`, is handed when `source` is rendered. */
function handed(source: string, tag?: string): Record<string, unknown> {
  let given: Record<string, unknown> = {}
  const component = (_type: string, props: Record<string, unknown>) => {
    given = props
    return null
  }
  const render = createRenderer<unknown, string>({
    dialect: {
      className: "class",
      html: (lower) => lower,
      svg: (_lower, written) => written,
      prop: (name) => name,
      event: (name) => `on:${name}`,
      handler: (name) => name,
      bindEvent: () => "on:change",
      bindProps: (argument) => [`on:${argument}Change`],
    },
    primitives: {},
    presets: {},
    lookup: () => ({ status: "unknown" }),
    widget: () => "widget",
    fragment: (children) => children,
    element: (type, props) => {
      if (type === tag) given = props
      return null
    },
    component,
    scoped: component,
    presence: (child) => child,
    pending: () => null,
  })
  const doc = parse(source)
  const surface = new Surface()
  surface.update(doc)
  render(doc.children, {
    surface,
    scope: surface.scope,
    slot: null,
    templateDepth: 0,
    options: {
      components: { Plain: "Plain" },
      streaming: false,
      report: () => {},
      invoke: (work) => work(),
      write: (work) => work(),
    },
  })
  return given
}

describe("what markup hands a component", () => {
  // A component passes what it doesn't know to its element, and an HTML
  // element reads `STYLE` as `style`.
  test("is a style only under the name the style is checked under", () => {
    const given = handed(`<state css="position: fixed; background: url(https://evil.test/a.png)" bag={{ Style: "background: url(https://evil.test/b.png)" }} />
<Plain title="ok" style="color: red; background: url(https://evil.test/c.png)" STYLE={css} sTyLe="position: fixed" {...bag} bind:STYLE={css} />`)
    expect(given).toEqual({ title: "ok", style: { color: "red" } })
  })
})

describe("what markup hands an element", () => {
  // A browser reads the type of an input in any case, and React writes a
  // list of one word as that word.
  test("is not a file picker, however the type is written", () => {
    for (const type of ['"file"', '"FILE"', '"File"', '{"fi" + "le"}', '{["file"]}', '{["FiLe"]}']) {
      expect(handed(`<input type=${type} name="doc" />`, "input"), type).toEqual({ name: "doc" })
    }
    expect(handed('<input type="email" name="doc" />', "input")).toEqual({ type: "email", name: "doc" })
    expect(handed('<input type={["a", "b"]} />', "input")).toEqual({ type: ["a", "b"] })
  })
})

describe("charts", () => {
  const chart = (type: string, values: number[]) => {
    const props = { type, data: values.map((value, index) => ({ label: `r${index}`, value })) }
    const data = readChartData(props)
    return chartView(props, {
      data,
      values: chartValues(data),
      width: 560,
      active: null,
      setActive: () => {},
      id: "c",
    })
  }

  test("a scale is drawn for numbers a float can barely hold or tell apart", () => {
    for (const values of [
      [0, 1.7e308],
      [-1.7e308, 1.7e308],
      [1e16, 1e16 + 2],
      [5e-324, 1e-323],
    ]) {
      for (const type of ["bar", "line", "area"]) {
        expect(texts(chart(type, values)).length).toBeLessThan(60)
      }
    }
  })

  test("a donut of nothing adds up to nothing", () => {
    expect(texts(chart("donut", [0, 0]))).toContain("0")
    expect(texts(chart("donut", [0, 0]))).not.toContain("1")
    expect(texts(chart("donut", [3, 1]))).toContain("4")
  })
})

describe("a number", () => {
  test("that is missing is not counted up from zero", () => {
    for (const value of [null, undefined, ""]) {
      expect(texts(numberView({ value }, 0))).toEqual(["–"])
    }
    expect(texts(numberView({ value: 0 }, 0))).toEqual(["0"])
    expect(texts(numberView({ value: "12" }, 7))).toEqual(["7"])
  })
})

describe("waiting for an element to leave", () => {
  const animation = (endTime: number, finished: Promise<unknown>) => ({
    finished,
    effect: { getComputedTiming: () => ({ endTime }) },
  })
  const element = (...animations: unknown[]) =>
    ({ getAnimations: () => animations }) as unknown as Element

  test("is over when the animations that end have ended", async () => {
    let finish = () => {}
    const exit = new Promise<void>((resolve) => {
      finish = resolve
    })
    const forever = new Promise(() => {})
    let left = false
    void exitAnimations(element(animation(200, exit), animation(Infinity, forever)))?.then(() => {
      left = true
    })
    await Promise.resolve()
    expect(left).toBe(false)
    finish()
    await new Promise((resolve) => setTimeout(resolve))
    expect(left).toBe(true)
  })

  test("is not needed when nothing ends", () => {
    expect(exitAnimations(element(animation(Infinity, new Promise(() => {}))))).toBeNull()
    expect(exitAnimations(element())).toBeNull()
    expect(exitAnimations(null)).toBeNull()
  })
})

describe("ids that hold across a page", () => {
  test("gives the wanted id when it is free, and another one when it is not", () => {
    const first = claimId("page-id")
    const second = claimId("page-id")
    const third = claimId("page-id")
    expect(first.id).toBe("page-id")
    expect(new Set([first.id, second.id, third.id]).size).toBe(3)
    for (const claim of [second, third]) expect(claim.id).toMatch(/^page-id[a-z0-9]+$/)
    for (const claim of [first, second, third]) claim.release()
  })

  test("an id given back can be claimed again, and giving it back twice frees nothing else", () => {
    const first = claimId("page-id")
    first.release()
    const again = claimId("page-id")
    expect(again.id).toBe("page-id")
    first.release()
    const other = claimId("page-id")
    expect(other.id).not.toBe("page-id")
    again.release()
    other.release()
  })

  test("is shared by every copy of the module on the page", async () => {
    const held = claimId("shared-id")
    vi.resetModules()
    const copy = await import("../src/renderer/ids")
    expect(copy.claimId).not.toBe(claimId)
    const elsewhere = copy.claimId("shared-id")
    expect(elsewhere.id).not.toBe("shared-id")
    held.release()
    elsewhere.release()
  })
})

describe("what a host is told about a component", () => {
  const capital = (name: string) => `on${name.charAt(0).toUpperCase()}${name.slice(1)}`
  const noted: Record<string, boolean[]> = {}
  const note = (type: string, open: boolean) => {
    ;(noted[type] ??= []).push(open)
    return type
  }
  const renderNodes = createRenderer<string, string>({
    dialect: {
      className: "class",
      html: (lower) => lower,
      svg: (_, written) => written,
      prop: (name) => name,
      event: capital,
      handler: (name) => name,
      bindEvent: () => "onChange",
      bindProps: (argument) => [`${capital(argument)}Change`],
    },
    primitives: {},
    presets: {},
    lookup: (name) => ({ status: "ready", component: name }),
    widget: () => "widget",
    fragment: () => "",
    element: (tag) => tag,
    component: (type, _props, _key, _children, open) => note(type, open),
    scoped: (type, _props, _key, _lets, render, open) => {
      render([])
      return note(type, open)
    },
    presence: (child) => child,
    pending: () => "",
  })

  function openness(source: string, streaming: boolean): Record<string, boolean[]> {
    for (const name of Object.keys(noted)) delete noted[name]
    const surface = new Surface()
    const doc = parse(source, { streaming })
    surface.update(doc)
    renderNodes(doc.children, {
      surface,
      scope: surface.scope,
      slot: null,
      templateDepth: 0,
      options: {
        components: {},
        streaming,
        report: () => {},
        invoke: (work) => work(),
        write: (work) => work(),
      },
    })
    return { ...noted }
  }

  test("is that it is open while its closing tag hasn't arrived", () => {
    const source = `<Tabs><TabsList><TabsTab value="a">A</TabsTab><TabsTab value="b">B`
    expect(openness(source, true)).toEqual({ Tabs: [true], TabsList: [true], TabsTab: [false, true] })
    expect(openness(`${source}</TabsTab></TabsList>`, true)).toEqual({
      Tabs: [true],
      TabsList: [false],
      TabsTab: [false, false],
    })
    expect(openness(`<Slider let:state><SliderThumb /></Slider><Slider let:state><SliderThumb />`, true)).toEqual({
      Slider: [false, true],
      SliderThumb: [false, false],
    })
  })

  test("is never that it is open once the source is whole", () => {
    expect(openness(`<Tabs><TabsList><TabsTab value="a">A`, false)).toEqual({
      Tabs: [false],
      TabsList: [false],
      TabsTab: [false],
    })
  })

  test("is that it is open inside a template whose use is still being written", () => {
    const source = `<define name="Panel"><Tabs><TabsList /><slot /></Tabs></define>
<Panel><TabsPanel value="a">A</TabsPanel>`
    expect(openness(source, true)).toEqual({ Tabs: [true], TabsList: [true], TabsPanel: [false] })
    expect(openness(`${source}</Panel>`, true)).toEqual({ Tabs: [false], TabsList: [false], TabsPanel: [false] })
  })
})
