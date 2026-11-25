import { describe, expect, test } from "vitest"
import { type CheckOptions, checkMarkup, type Issue, repairMessage } from "../src/check"
import { PRESET_PROPS, PRIMITIVE_PROPS, UNIVERSAL } from "../src/check/specs"
import { defineComponent, defineLibrary } from "../src/library"
import { PRIMITIVES_GUIDE } from "../src/prompt/guide"
import { RECIPES } from "../src/prompt/recipes"
import { iconSpec, imageView, PRIMITIVE_VIEWS } from "../src/renderer/primitives"

/** The issues of a reply, each as `severity code: message`. */
function issues(source: string, options?: CheckOptions): string[] {
  return checkMarkup(source, options).issues.map(
    (issue) => `${issue.severity} ${issue.code}: ${issue.message}`
  )
}

function only(source: string, options?: CheckOptions): Issue {
  const result = checkMarkup(source, options)
  expect(result.issues.map((issue) => issue.message)).toHaveLength(1)
  return result.issues[0] as Issue
}

const CLEAN = `<state count={0} items={[{ id: 1, name: "Tea", price: 4 }]} filter="" persist />
<derive total={sumBy(items, "price")} shown={items.filter(i => i.name.includes(filter))} />
<define name="PriceRow" props="label amount?">
  <row justify="between"><text>{label}</text><text tabular>{currency(amount ?? 0)}</text><slot /></row>
</define>

## Order

<card gap={3} motion="rise">
  <Input placeholder="Filter" bind:value={filter} />
  {#each shown as item, index (item.id)}
    {@const label = \`\${index + 1}. \${item.name}\`}
    <PriceRow label={label} amount={item.price}>
      <Button size="sm" variant="ghost" aria-label="Remove" on:click={items = items.filter(i => i.id != item.id)}>
        <icon name="x" />
      </Button>
    </PriceRow>
  {:else}
    <text color="muted">Nothing matches.</text>
  {/each}
  <divider />
  <PriceRow label="Total" amount={total} />
  <row gap={2}>
    <Button on:click={count++; items.push({ id: uid(), name: "Scone", price: 3 })}>Add a scone</Button>
    <Button variant="outline" on:click={(event) => { count = 0; reset("items") }}>Start over</Button>
    <input type="range" min="0" max="10" value={count} on:input={count = Number($value)} />
  </row>
  <Chart type="bar" data={items} x="name" y="price" height={160} />
  {#if count > 2}<badge color="success">{count} added</badge>{/if}
</card>`

describe("a reply that is right", () => {
  test("has nothing to say", () => {
    expect(issues(CLEAN)).toEqual([])
    expect(checkMarkup(CLEAN)).toEqual({ ok: true, issues: [], errors: 0, warnings: 0 })
    expect(repairMessage(checkMarkup(CLEAN))).toBe("")
  })

  test("may declare what it uses further down", () => {
    expect(
      issues(`<text>{total} {label}</text>
<Button on:click={n++}>Add</Button>
<Row />
<state n={1} label="Total" />
<derive total={n * 2} />
<define name="Row"><text>{n}</text></define>`)
    ).toEqual([])
  })

  test("may be wrapped in a fence, and written in prose", () => {
    expect(issues("```iui\n<card>Hello</card>\n```")).toEqual([])
    expect(issues("Here is the plan.\n\n- One thing at a time\n- 3 < 4 and a > b, so {a pair of braces} is text")).toEqual([])
    // A fenced block the reader is meant to read as code.
    expect(issues('Run this:\n\n```html\n<div class="a"><span>x</span></div>\n```')).toEqual([])
  })

  test("may use what the host adds", () => {
    const source = `<Rating value={stars} on:rate={save(clamp10($value))} />
<Button on:click={call("orders.cancel", { id: orderId })}>Cancel</Button>
<query id="orders" tool="orders.list" />`
    const library = defineLibrary({
      components: [
        defineComponent({
          name: "Rating",
          description: "Stars",
          props: { value: "number" },
          events: { rate: "The new value" },
          component: () => null,
        }),
      ],
    })
    expect(
      issues(source, {
        library,
        tools: [{ name: "orders.list" }, "orders.cancel"],
        state: { stars: 3, orderId: "a" },
        functions: ["clamp10"],
        actions: { save: () => {} },
      })
    ).toEqual([])
  })

  test.each(Object.entries(RECIPES))("the %s recipe has the parts in the right place", (_name, source) => {
    const found = checkMarkup(source).issues.filter(
      // A recipe is a fragment: the state it reads is declared by whoever uses it.
      (issue) => issue.code !== "unknown-name"
    )
    expect(found).toEqual([])
  })
})

describe("markup written the way another language has it", () => {
  test("JSX conditions and loops", () => {
    expect(
      issues(`<state open={false} items={[{ name: "a" }]} />
{open && <card>Details</card>}
{items.map(item => <row><text>{item.name}</text></row>)}`)
    ).toEqual([
      "error tags-in-expression: Tags can't be written inside {…}: write {#if test}…{/if} to show something when a test holds, and {#each list as item}…{/each} to repeat it, in {open && <card>Details</card>}",
      "error tags-in-expression: Tags can't be written inside {…}: write {#if test}…{/if} to show something when a test holds, and {#each list as item}…{/each} to repeat it, in {items.map(item => <row><text>{item.name}</text></row>)}",
    ])
  })

  test("tags and components from other libraries", () => {
    const found = checkMarkup(`<stack gap={2}>
  <heading level={2}>Report</heading>
  <Card><Text>Up 4%</Text></Card>
  <Tabs defaultValue="a"><TabsList><TabsTrigger value="a">One</TabsTrigger></TabsList><TabsContent value="a">First</TabsContent></Tabs>
  <Typography>Body</Typography>
</stack>`).issues.map((issue) => [issue.code, issue.message.split(",")[0], issue.hint])
    expect(found).toEqual([
      ["unknown-tag", "<stack> is not a tag the language has", "Write <box>."],
      ["unknown-tag", "<heading> is not a tag the language has", "Write <title>."],
      ["unknown-component", "<Card> is not a known component", "Write <card>, in lower case."],
      ["unknown-component", "<Text> is not a known component", "Write <text>, in lower case."],
      [
        "unknown-component",
        "<TabsTrigger> is not a known component",
        "The parts of <Tabs> are: Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab, TabsTabIcon.",
      ],
      [
        "unknown-component",
        "<TabsContent> is not a known component",
        "The parts of <Tabs> are: Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab, TabsTabIcon.",
      ],
      ["unknown-component", "<Typography> is not a known component", "Write <text>."],
    ])
  })

  test("Vue and Svelte attributes and blocks", () => {
    expect(
      checkMarkup(`<state todos={[]} />
<Button v-if="todos.length" @click="todos = []" :disabled="false">Clear</Button>
{#await promise}{/await}`).issues.map((issue) => [issue.code, issue.hint])
    ).toEqual([
      ["unknown-prop", "Wrap it in {#if …}…{/if}, or write show={…}."],
      ["unknown-prop", "Write on:click={…}."],
      ["unknown-prop", "Write disabled={…}."],
      ["unknown-block", undefined],
    ])
  })

  test("handlers and bindings written as text do nothing", () => {
    expect(
      issues(`<state n={0} />
<button onclick="n = n + 1">Plus</button>
<Button on:click="n += 1">Plus</Button>
<Button onClick="add()">Plus</Button>
<input bind:value="n" />
<a href="javascript:alert(1)">More</a>
<script>alert(1)</script>`)
    ).toEqual([
      "error bad-handler: <button> has a handler that is not in braces, so it does nothing",
      "error bad-handler: <Button> has a handler that is not in braces, so it does nothing",
      "error bad-handler: <Button> has a handler that is not in braces, so it does nothing",
      "error bad-handler: bind:value on <input> needs a state name or a path in braces",
      'error blocked-url: href="javascript:alert(1)" on <a> is not an address a surface may use, so it is dropped',
      "error blocked-tag: <script> is not allowed and was removed",
    ])
  })
})

describe("names", () => {
  test("a name nobody declared, with the one that was meant", () => {
    const issue = only("<state total={3} />\n<text>Sum: {totl}</text>")
    expect(issue).toEqual({
      code: "unknown-name",
      severity: "error",
      message: '"totl" is not defined',
      hint: "Did you mean total?",
      line: 2,
      column: 12,
      excerpt: "<text>Sum: {totl}</text>",
    })
  })

  test("functions JavaScript has and the language doesn't", () => {
    expect(
      checkMarkup(`<state price={3} at="2026-03-09" />
<text>{formatCurrency(price)} {price.toLocaleDateString()} {new Date().getFullYear()} {Math.clamp(price, 0, 1)}</text>
<Button on:click={setPrice(price + 1)}>More</Button>
<Button on:click={fetch("/api")}>Load</Button>`).issues.map((issue) => [issue.code, issue.message, issue.hint])
    ).toEqual([
      ["unknown-function", '"formatCurrency" is not a function the language has', "Did you mean currency?"],
      ["unknown-function", ".toLocaleDateString() is not a method the language has", "Write date(value)."],
      ["bad-expression", '"new" is not supported in {new Date().getFullYear()}', undefined],
      ["unknown-function", "Math.clamp is not a function the language has", expect.stringContaining("Math has: PI")],
      [
        "unknown-function",
        '"setPrice" is not a function: state changes by assigning to it',
        "Write price = … instead of setPrice(…).",
      ],
      [
        "unknown-function",
        '"fetch" is not a function the language has',
        'Use what the language has: <query id="…" tool="…" /> reads data and call("tool", input) changes it.',
      ],
    ])
  })

  test("a method may be missing when the call allows for it, or when the data holds functions", () => {
    expect(
      issues(`<state a={{ run: () => 1 }} b={null} />
<text>{a.run()} {b?.explode()}</text>`)
    ).toEqual([])
  })

  test("names a block or a component hands down are known inside it", () => {
    expect(
      issues(`<state rows={[{ id: 1, tags: ["a"] }]} />
{#each rows as { id, tags }, i (id)}
  {#each tags as tag}<text>{i} {id} {tag}</text>{/each}
{/each}
<text>{id} {tag}</text>
<Tabs defaultValue="a" let:value={current}><text>{current}</text></Tabs>`).filter((line) => line.includes("unknown-name"))
    ).toEqual(['error unknown-name: "id" is not defined', 'error unknown-name: "tag" is not defined'])
  })

  test("inside a template, only its props and what the reply declares", () => {
    expect(
      issues(`<state n={1} />
<define name="Line" props="label"><text>{label} {extra} {n} {missing}</text></define>
<Line label="a" extra="b" />`)
    ).toEqual(['error unknown-name: "missing" is not defined'])
  })
})

describe("writes", () => {
  test("only a handler changes state", () => {
    expect(
      issues(`<state n={0} list={[]} />
<text>{n = 1} {list.push(2)} {toast("hi")}</text>
<text>{list.map(x => x * 2).join()}</text>`)
    ).toEqual([
      "error bad-write: A change to state can only run from an event handler",
      "error bad-write: push() can only run from an event handler",
      "error bad-write: toast() can only run from an event handler",
    ])
  })

  test("what is computed can't be assigned, but what it picked out of state can be edited", () => {
    expect(
      issues(`<state tasks={[{ done: false }]} />
<derive next={tasks.find(t => !t.done)} open={tasks.filter(t => !t.done).length} />
<query id="orders" tool="orders.list" />
<Button on:click={next.done = true}>Done</Button>
<Button on:click={open = 0}>Clear</Button>
<Button on:click={orders.data[0].paid = true}>Pay</Button>
<Button on:click={undeclared = 1}>Set</Button>
<Checkbox bind:checked={open} />`)
    ).toEqual([
      'error bad-write: "open" is computed and can\'t be assigned',
      'error bad-write: "orders" is what a tool returned and can\'t be changed here',
      'error unknown-name: "undeclared" is assigned but never declared',
      'error bad-write: "open" is computed and can\'t be assigned',
    ])
  })
})

describe("components", () => {
  const library = defineLibrary({
    components: [
      defineComponent({
        name: "Rating",
        description: "Stars",
        props: {
          value: { type: "number", required: true, bindable: true },
          size: ["sm", "lg"],
        },
        events: { rate: "The new value" },
        children: false,
        component: () => null,
      }),
    ],
  })

  test("what a library component doesn't take", () => {
    expect(
      issues(
        `<state stars={3} />
<Rating size="huge" colour="red" on:change={stars = $value} bind:size={stars}>Stars</Rating>`,
        { library }
      )
    ).toEqual([
      'error wrong-type: <Rating> takes "sm" | "lg" for "size", so it is dropped',
      'warning unknown-prop: <Rating> doesn\'t have the prop "colour", so it is dropped',
      'error unknown-prop: <Rating> doesn\'t have the event "change", so it is dropped',
      'error unknown-prop: <Rating> doesn\'t have a bindable prop "size", so it is dropped',
      'error missing-prop: <Rating> needs "value"',
      "warning no-children: <Rating> takes nothing between its tags, so what is there is not shown",
    ])
  })

  test("a part outside the component it belongs to", () => {
    const issue = only('<TabsPanel value="a">Outside</TabsPanel>')
    expect([issue.code, issue.message, issue.hint]).toEqual([
      "misplaced-part",
      "<TabsPanel> only works inside <Tabs>",
      "Put it inside <Tabs>…</Tabs>.",
    ])
    // A template may hold a part: where it ends up is decided by whoever uses it.
    expect(
      issues(`<define name="Pane" props="id"><TabsPanel value={id}><slot /></TabsPanel></define>
<Tabs defaultValue="a"><TabsList><TabsTab value="a">A</TabsTab></TabsList><Pane id="a">One</Pane></Tabs>`)
    ).toEqual([])
  })

  test("props a primitive or a widget ignores", () => {
    expect(
      checkMarkup(`<text colour="red" bold>Hello</text>
<card elevation={3} title="Sales">Body</card>
<row spacing={4} alignItems="center"><icon name="rocket-launch" /><icon icon="star" /></row>
<grid cols={3}><text motion="bounce">a</text></grid>
<Chart type="radar" values={[1]} />
<Stat title="Revenue" number={1200} />
<DataTable rows={[]} on:rowClick={1} />`).issues.map((issue) => `${issue.message}${issue.hint ? ` ${issue.hint}` : ""}`)
    ).toEqual([
      '<text> doesn\'t have the prop "colour", so it is ignored Write color.',
      '<text> doesn\'t have the prop "bold", so it is ignored Write weight="bold".',
      '<card> doesn\'t have the prop "elevation", so it is ignored Write shadow.',
      "title on <card> is a tooltip, not a heading Put a <title> inside the card.",
      '<row> doesn\'t have the prop "spacing", so it is ignored Write gap.',
      '<row> doesn\'t have the prop "alignItems", so it is ignored Write align.',
      'There is no icon named "rocket-launch", so nothing is drawn Did you mean "rocket"?',
      '<icon> doesn\'t have the prop "icon", so it is ignored Write name.',
      '<icon> has no "name", so nothing is drawn',
      '<grid> doesn\'t have the prop "cols", so it is ignored Write columns.',
      expect.stringContaining('motion="bounce" is not a motion the surface has, so nothing plays Use one of: fade, rise, drop,'),
      '<Chart> doesn\'t have the prop "values", so it is ignored Write data.',
      '<Chart> has no "data", so it has nothing to show',
      'There is no chart of type "radar", so a bar chart is drawn The types are: bar, line, area, donut, pie, spark.',
      '<Stat> doesn\'t have the prop "title", so it is ignored Write label.',
      '<Stat> doesn\'t have the prop "number", so it is ignored Write value.',
      '<Stat> has no "value", so it has nothing to show',
      '<DataTable> doesn\'t have the prop "rows", so it is ignored Write data.',
      '<DataTable> doesn\'t have the event "rowClick", so the handler never runs It has: on:select.',
      '<DataTable> has no "data", so it has nothing to show',
    ])
  })

  test("a library that brings its own charts and motion widens what is allowed", () => {
    const own = defineLibrary({
      charts: { name: "Own", extra: { radar: "Several measures of one thing, compared." } },
      motion: { name: "Own", presets: { bounce: { description: "For something that just landed." } } },
    })
    expect(
      issues('<Chart type="radar" data={[]} smooth />\n<text motion="bounce">a</text>', { library: own })
    ).toEqual([])
  })
})

describe("data", () => {
  test("a tool the host doesn't have", () => {
    expect(
      checkMarkup(
        `<query id="tickets" tool="listTicket" />
<query tool="listTickets" />
<Button on:click={await call("closeTicket", { id: 1 }); refetch("ticket")}>Close</Button>`,
        { tools: ["listTickets", "updateTicket"] }
      ).issues.map((issue) => [issue.code, issue.message, issue.hint])
    ).toEqual([
      ["unknown-tool", 'There is no tool named "listTicket"', 'Did you mean "listTickets"?'],
      [
        "unknown-tool",
        "<query> needs an id, so it loads nothing",
        'Write <query id="orders" tool="orders.list" /> and read orders.data.',
      ],
      ["unknown-tool", 'There is no tool named "closeTicket"', "The tools are: listTickets, updateTicket."],
      ["unknown-name", 'There is no <query id="ticket"> to load again', 'Did you mean "tickets"?'],
    ])
    // Without a list of tools, their names are the host's business.
    expect(issues('<query id="a" tool="anything" />\n<text>{a.loading}</text>')).toEqual([])
  })
})

describe("the reply as a whole", () => {
  test("cut short", () => {
    expect(issues("<card>\n  <row>\n    <text>Step 1 of")).toEqual([
      "error unclosed-element: <card> is never closed",
      "error unclosed-element: <row> is never closed",
      "error unclosed-element: <text> is never closed",
    ])
  })

  test("an interface inside a fence, after a sentence", () => {
    const issue = only("Here is your dashboard:\n\n```html\n<card>\n  <Stat label=\"Revenue\" value={1200} />\n</card>\n```\n")
    expect([issue.code, issue.line]).toEqual(["fenced", 3])
  })

  test("nothing at all", () => {
    expect(issues("<state n={1} />")).toEqual(["error empty: The reply draws nothing"])
    expect(issues("")).toEqual(["error empty: The reply draws nothing"])
  })

  test("lines are counted in the reply as it was given", () => {
    const issue = only("```iui\n<card>\n  <text>{missing}</text>\n</card>\n```")
    expect([issue.line, issue.column, issue.excerpt]).toEqual([3, 9, "<text>{missing}</text>"])
  })
})

describe("what to tell the model", () => {
  test("names each problem, its line and what to write", () => {
    const result = checkMarkup(`<state total={3} />
<stack>
  <text colour="red">{totl}</text>
</stack>`)
    expect(repairMessage(result)).toBe(`The interface you wrote can't be shown as written. A checker read it and found:

- Line 2: <stack> is not a tag the language has, so it is shown as text. Write <box>.
  <stack>
- Line 3: <text> doesn't have the prop "colour", so it is ignored. Write color.
  <text colour="red">{totl}</text>
- Line 3: "totl" is not defined. Did you mean total?
  <text colour="red">{totl}</text>

Write the whole interface again with these fixed. Keep everything else as it was: the same content, layout and names. Reply with the markup only, with no explanation and no code fence.`)
  })

  test("stays short, and puts errors first", () => {
    const source = Array.from({ length: 30 }, (_, i) => `<text bold>{missing${i}}</text>`).join("\n")
    const message = repairMessage(checkMarkup(source), { limit: 5 })
    expect(message.match(/^- Line/gm)).toHaveLength(5)
    expect(message).not.toContain("doesn't have the prop")
    expect(message).toContain("And 55 more of the same kinds.")
    expect(repairMessage(checkMarkup("<text bold>a</text>"))).toBe("")
    expect(repairMessage(checkMarkup("<text bold>a</text>"), { warnings: true })).toContain("Line 1")
  })
})

describe("what the checker knows about props", () => {
  const SAMPLES = [true, false, 2, "2", "center", "lg", "full", "row", "danger", "16/9", "absolute", "hidden", "check", "soft", "bold", "0.1em", "vertical", "contain", "a b"]
  /** What a prop needs beside it before it can show. */
  const BASE: Record<string, Record<string, unknown>> = {
    grid: { columns: 3 },
    image: { src: "https://example.com/a.png" },
  }

  function draw(tag: string, props: Record<string, unknown>): string {
    const view =
      tag === "icon"
        ? iconSpec(props)
        : tag === "image"
          ? imageView(props, { failed: null, onError: () => {} })
          : (PRIMITIVE_VIEWS[tag] as (typeof PRIMITIVE_VIEWS)[string])(props, ["x"])
    return JSON.stringify(view)
  }

  const reads = (tag: string, prop: string): boolean =>
    SAMPLES.some((sample) => draw(tag, { ...BASE[tag], [prop]: sample }) !== draw(tag, { ...BASE[tag] })) ||
    SAMPLES.some((sample) => draw(tag, { [prop]: sample }) !== draw(tag, {}))

  test.each(Object.keys(PRIMITIVE_PROPS))("<%s> reads every prop listed for it, and no other", (tag) => {
    const listed = [...(PRIMITIVE_PROPS[tag] as ReadonlySet<string>)]
    expect(listed.filter((prop) => !reads(tag, prop))).toEqual([])
    const others = ["colour", "bold", "spacing", "cols", "elevation", "rounded", "alignItems", "min", "label", "icon", "name", "href", "src", "level", "columns", "marker", "span", "vertical", "fit", "direction", "interactive", "block"]
    expect(others.filter((prop) => !listed.includes(prop) && reads(tag, prop))).toEqual([])
  })

  test("every prop the prompt teaches is one the checker knows", () => {
    const rows = [...PRIMITIVES_GUIDE.matchAll(/^\| `<([\w-]+)>` \|[^|]*\|(.*)\|$/gm)]
    expect(rows.length).toBeGreaterThan(18)
    const unknown: string[] = []
    for (const [, tag = "", cell = ""] of rows) {
      const known = PRIMITIVE_PROPS[tag] ?? PRESET_PROPS[tag]?.props
      const events = PRESET_PROPS[tag]?.events ?? []
      expect(known, tag).toBeDefined()
      for (const [, name = ""] of cell.matchAll(/`([A-Za-z:]+)(?:[=`])/g)) {
        if (name.startsWith("on:") ? events.includes(name.slice(3)) : known?.has(name)) continue
        unknown.push(`<${tag}> ${name}`)
      }
    }
    expect(unknown).toEqual([])

    const shared = /\*\*Shared props\.\*\*([\s\S]*?)\n\n/.exec(PRIMITIVES_GUIDE)?.[1] ?? ""
    const names = [...shared.matchAll(/`([^`]+)`/g)]
      .flatMap((match) => (match[1] as string).split(/\s+/))
      .map((word) => word.split("=")[0] as string)
      .filter((word) => /^[a-z][A-Za-z]*$/.test(word) && !/^(xs|sm|md|lg|xl)$/.test(word))
    expect(names.length).toBeGreaterThan(25)
    const box = PRIMITIVE_PROPS.box as ReadonlySet<string>
    expect(names.filter((name) => !box.has(name) && !UNIVERSAL.has(name))).toEqual([])
  })
})
