import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  defineComponent,
  defineLibrary,
  defineWidget,
  librarySpec,
  validateLibrary,
  view,
} from "../src"
import { checkProp, normalizeProps } from "../src/library/schema"
import { buildSystemPrompt, describeComponent } from "../src/prompt"

const props = (input: Parameters<typeof normalizeProps>[0]) => {
  const issues: string[] = []
  return { props: normalizeProps(input, issues), issues }
}

describe("declaring props", () => {
  test("reads the short forms and the long one", () => {
    const { props: read, issues } = props({
      title: "string",
      size: ["sm", "md", "lg"],
      count: { type: "integer", default: 1, description: "How many." },
      order: {
        type: "object",
        required: true,
        properties: { id: "string", total: { type: "number", required: true } },
      },
      tags: { type: "array", items: "string" },
      open: { type: "boolean", bindable: true },
    })
    expect(issues).toEqual([])
    expect(read.map((prop) => [prop.name, prop.type])).toEqual([
      ["title", "string"],
      ["size", `"sm" | "md" | "lg"`],
      ["count", "number"],
      ["order", "{ id?: string, total: number }"],
      ["tags", "string[]"],
      ["open", "boolean"],
    ])
    expect(read.find((prop) => prop.name === "order")?.required).toBe(true)
    expect(read.find((prop) => prop.name === "count")).toMatchObject({ default: 1, description: "How many." })
    expect(read.find((prop) => prop.name === "open")?.bindable).toBe(true)
  })

  test("reads a JSON Schema of an object", () => {
    const { props: read } = props({
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "The order's id." },
        status: { enum: ["open", "paid"], default: "open" },
      },
    })
    expect(read).toMatchObject([
      { name: "id", type: "string", required: true, description: "The order's id." },
      { name: "status", type: `"open" | "paid"`, required: false, default: "open" },
    ])
  })

  test("reads a schema that can describe itself, such as Zod's", () => {
    const schema = z.object({
      title: z.string().describe("Shown at the top."),
      rows: z.array(z.object({ name: z.string(), amount: z.number() })),
      tone: z.enum(["neutral", "urgent"]).optional(),
      limit: z.number().default(5),
    })
    for (const input of [schema, z.toJSONSchema(schema)]) {
      const { props: read, issues } = props(input as Parameters<typeof normalizeProps>[0])
      expect(issues).toEqual([])
      expect(read.map((prop) => [prop.name, prop.type, prop.required])).toEqual([
        ["title", "string", true],
        ["rows", "{ name: string, amount: number }[]", true],
        ["tone", `"neutral" | "urgent"`, false],
        ["limit", "number", false],
      ])
      expect(read[0]?.description).toBe("Shown at the top.")
      expect(read[3]?.default).toBe(5)
    }
  })

  test("says what it can't read", () => {
    expect(props({ title: "text" as never }).issues).toEqual([`prop "title" has the unknown type "text"`])
    expect(props("nothing" as never).issues).toHaveLength(1)
  })

  test("checks a value against what was declared", () => {
    const { props: read } = props({
      count: "number",
      open: "boolean",
      size: ["sm", "lg"],
      rows: { type: "array" },
      order: "object",
      label: "string",
      any: "any",
    })
    const check = (name: string, value: unknown) => checkProp(read.find((prop) => prop.name === name) as never, value)
    expect(check("count", "12")).toEqual({ ok: true, value: 12 })
    expect(check("count", "twelve").ok).toBe(false)
    expect(check("open", "false")).toEqual({ ok: true, value: false })
    expect(check("open", "")).toEqual({ ok: true, value: true })
    expect(check("size", "lg")).toEqual({ ok: true, value: "lg" })
    expect(check("size", "xl").ok).toBe(false)
    expect(check("rows", [1]).ok).toBe(true)
    expect(check("rows", { length: 1 }).ok).toBe(false)
    expect(check("order", [1]).ok).toBe(false)
    expect(check("label", 4)).toEqual({ ok: true, value: "4" })
    expect(check("label", () => "x").ok).toBe(false)
    expect(check("any", { a: 1 }).ok).toBe(true)
    // Nothing a model writes makes a prop hold a function.
    expect(check("any", () => 1).ok).toBe(false)
  })
})

const OrderCard = defineComponent({
  name: "OrderCard",
  description: "One order with its status and total.",
  props: {
    order: {
      type: "object",
      required: true,
      description: "An order from listOrders.",
      properties: { id: "string", total: { type: "number", required: true } },
    },
    tone: ["neutral", "urgent"],
    expanded: { type: "boolean", default: false, bindable: true },
  },
  events: { open: { description: "The card was pressed.", payload: "the order id" } },
  children: "extra lines under the total",
  example: `<OrderCard order={{ id: "A-1", total: 42 }} tone="urgent" on:open={toast($value)} />`,
  component: () => null,
})

const Rating = defineWidget<{ value: number; label?: string }>({
  name: "Rating",
  description: "A row of stars showing a score out of five.",
  props: { value: { type: "number", required: true }, label: "string" },
  example: `<Rating value={4.5} label="Guest rating" />`,
  setup: () => (given) => view("span", { class: "rating" }, ["★".repeat(Math.round(given.value))]),
})

describe("a library", () => {
  const library = defineLibrary({
    name: "Acme",
    components: [OrderCard, Rating],
    charts: { name: "ECharts", extra: { radar: "Compares several measures of one thing." } },
    motion: { name: "Motion", presets: { swing: { description: "Swings in from the left." } } },
    instructions: "Amounts are in euros.",
  })

  test("finds a component by its tag", () => {
    expect(library.get("OrderCard")).toBe(OrderCard)
    expect(library.get("Rating")?.setup).toBeTypeOf("function")
    expect(library.get("Missing")).toBeUndefined()
    expect(validateLibrary(library)).toEqual([])
  })

  test("tells the model about each component, generated from its definition", () => {
    const prompt = buildSystemPrompt({ library })
    expect(prompt).toContain("# Components from this product")
    expect(prompt).toContain(`### OrderCard

One order with its status and total.

- \`order\`: \`{ id?: string, total: number }\`, required. An order from listOrders.
- \`tone\`: \`"neutral" | "urgent"\`.
- \`expanded\`: \`boolean\`, default \`false\`.
- \`on:open\`: The card was pressed. \`$value\` is the order id.
- Bind state with \`bind:expanded\`.
- Children: extra lines under the total.

\`\`\`
<OrderCard order={{ id: "A-1", total: 42 }} tone="urgent" on:open={toast($value)} />
\`\`\``)
    expect(prompt).toContain("- Takes no children; self-close it.")
    expect(prompt).toContain("`<Chart>` is drawn with ECharts.")
    expect(prompt).toContain("- `radar`: Compares several measures of one thing.")
    expect(prompt).toContain("- `swing`: Swings in from the left.")
    expect(prompt).toContain("Amounts are in euros.")
    expect(describeComponent("Rating", { library })).toContain("A row of stars")
  })

  test("writes itself as plain data that makes the same prompt on a server", () => {
    const spec = librarySpec(library)
    const copy = JSON.parse(JSON.stringify(spec))
    expect(copy).toEqual(spec)
    expect(JSON.stringify(spec)).not.toContain("setup")
    expect(buildSystemPrompt({ library: copy })).toBe(buildSystemPrompt({ library }))
  })

  test("a component kept out of the prompt is still drawn", () => {
    const Stat = defineWidget({
      name: "Stat",
      description: "",
      prompt: false,
      setup: () => () => view("b", {}, ["x"]),
    })
    const own = defineLibrary({ components: [Stat] })
    expect(validateLibrary(own)).toEqual([])
    expect(buildSystemPrompt({ library: own })).not.toContain("# Components from this product")
    expect(own.get("Stat")).toBe(Stat)
  })

  test("the motion section can be replaced, or left out", () => {
    const guide = "# Motion\n\nNothing moves in this product except `motion=\"fade\"`."
    const quiet = defineLibrary({ motion: { name: "Quiet", guide } })
    expect(buildSystemPrompt({ library: quiet })).toContain(guide)
    expect(buildSystemPrompt({ library: quiet })).not.toContain("stagger")
    expect(buildSystemPrompt({ motion: guide })).toContain(guide)
    expect(buildSystemPrompt({ library: quiet, motion: false })).not.toContain(guide)
  })

  test("says what is wrong with a definition before a model reads it", () => {
    const broken = defineLibrary({
      components: [
        defineComponent({ name: "orderCard", description: "Lower case." }),
        defineComponent({ name: "Silent", description: "" }),
        defineComponent({
          name: "Picker",
          description: "Picks.",
          props: { value: "string", onPick: "any" },
          example: `<Picker value="a" size="lg"><text>no children</text></Picker>`,
        }),
        defineComponent({ name: "Wrong", description: "Example for something else.", example: `<card>Hi</card>` }),
        defineComponent({ name: "Needs", description: "Needs a thing.", props: { thing: { type: "string", required: true } }, example: `<Needs />` }),
        defineComponent({ name: "Twice", description: "One." }),
        defineComponent({ name: "Twice", description: "Two." }),
        { name: "Loose", description: "Not made with defineComponent." } as never,
      ],
    })
    const issues = validateLibrary(broken)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`"orderCard" is not a component name`),
        expect.stringContaining("<Silent> has no description"),
        expect.stringContaining(`"onPick"`),
        expect.stringContaining(`<Picker> example 1 passes "size"`),
        expect.stringContaining("<Picker> example 1 gives <Picker> children"),
        expect.stringContaining("<Wrong> example 1 doesn't use <Wrong>"),
        expect.stringContaining(`<Needs> example 1 leaves out "thing"`),
        expect.stringContaining("<Twice> is defined twice"),
        expect.stringContaining("defineComponent or defineWidget"),
      ])
    )
    expect(broken.get("Twice")?.description).toBe("Two.")
  })
})
