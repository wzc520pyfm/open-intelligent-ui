import { describe, expect, test } from "vitest"
import {
  type Attr,
  type Document,
  type ElementNode,
  type Node,
  parse,
} from "../src/markup"

/** A compact picture of the tree, so tests read like the markup they check. */
function outline(nodes: Node[]): unknown[] {
  return nodes.map((node) => {
    switch (node.type) {
      case "text":
        return node.value
      case "expr":
        return `{${node.src}}`
      case "const":
        return "@const"
      case "if":
        return { if: node.branches.map((branch) => outline(branch.children)) }
      case "each": {
        const each: Record<string, unknown> = { each: outline(node.children) }
        if (node.empty) each.empty = outline(node.empty)
        return each
      }
      case "element":
        return node.children.length
          ? { [node.name]: outline(node.children) }
          : node.name
    }
  })
}

function tree(source: string, streaming = false): unknown[] {
  return outline(parse(source, { streaming }).children)
}

function first(doc: Document): ElementNode {
  const node = doc.children[0]
  if (node?.type !== "element") throw new Error("Expected an element")
  return node
}

function attr(node: ElementNode, name: string): Attr["value"] | undefined {
  return node.attrs.find((item) => item.name === name)?.value
}

describe("markdown", () => {
  test("plain markdown documents", () => {
    expect(
      tree("# Title\n\nSome **bold** and `code`.\n\n- one\n- two\n")
    ).toEqual([
      { h1: ["Title"] },
      { p: ["Some ", { strong: ["bold"] }, " and ", { code: ["code"] }, "."] },
      { ul: [{ li: ["one"] }, { li: ["two"] }] },
    ])
  })

  test("tables, links, images and task lists", () => {
    const doc = parse(
      "| a | b |\n|---|--:|\n| 1 | [x](https://x.dev) |\n\n- [x] done\n"
    )
    expect(outline(doc.children)).toEqual([
      {
        table: [
          { thead: [{ tr: [{ th: ["a"] }, { th: ["b"] }] }] },
          { tbody: [{ tr: [{ td: ["1"] }, { td: [{ a: ["x"] }] }] }] },
        ],
      },
      { ul: [{ li: ["input", " done"] }] },
    ])
  })

  test("code is never parsed for tags or expressions", () => {
    expect(tree("Use `<row>` and `{count}`.")).toEqual([
      { p: ["Use ", { code: ["<row>"] }, " and ", { code: ["{count}"] }, "."] },
    ])
    const doc = parse("```jsx\n<row>{count}</row>\n```\n")
    const pre = first(doc)
    expect(pre.name).toBe("pre")
    expect(attr(pre, "lang")).toEqual({ kind: "static", value: "jsx" })
    expect(outline(pre.children)).toEqual(["<row>{count}</row>"])
  })

  test("text that only looks like markup stays text", () => {
    expect(tree("a < b and x <y> z, 3 <5")).toEqual([
      { p: ["a < b and x <y> z, 3 <5"] },
    ])
    expect(tree("Use {curly braces} freely, even {} or { ... }.")).toEqual([
      { p: ["Use {curly braces} freely, even {} or { ... }."] },
    ])
    expect(tree("Escaped \\{count\\} and \\<row>")).toEqual([
      { p: ["Escaped {count} and <row>"] },
    ])
  })

  test("entities are decoded", () => {
    expect(tree("Fish &amp; chips &lt;3 &#169;")).toEqual([
      { p: ["Fish & chips <3 ©"] },
    ])
  })

  test("indented text is not a code block", () => {
    expect(tree("<box>\n      Deeply indented\n</box>")).toEqual([
      { box: ["Deeply indented"] },
    ])
  })
})

describe("elements", () => {
  test("layout tags nest, with markdown between them", () => {
    const source = `
## Roast plan

<row gap={3}>
  <box flex="1">
    **Lamb** for {guests}
  </box>
  <badge color="success">Ready</badge>
</row>

Enjoy.
`
    expect(tree(source)).toEqual([
      { h2: ["Roast plan"] },
      {
        row: [
          { box: [{ strong: ["Lamb"] }, " for ", "{guests}"] },
          { badge: ["Ready"] },
        ],
      },
      { p: ["Enjoy."] },
    ])
  })

  test("inline tags stay inside their paragraph", () => {
    expect(tree("Status: <badge>Live</badge> since {day}.")).toEqual([
      { p: ["Status: ", { badge: ["Live"] }, " since ", "{day}", "."] },
    ])
  })

  test("several blocks inside an element keep their structure", () => {
    expect(tree("<card>\n### Title\n\nOne.\n\nTwo.\n</card>")).toEqual([
      { card: [{ h3: ["Title"] }, { p: ["One."] }, { p: ["Two."] }] },
    ])
  })

  test("text next to a child element does not become a paragraph", () => {
    expect(
      tree('<Button>\n  <icon name="plus"/>\n  Add item\n</Button>')
    ).toEqual([{ Button: ["icon", "Add item"] }])
  })

  test("attribute forms", () => {
    const node = first(
      parse(
        `<Slider min={0} max="100" disabled size=sm label="Up to {max} km" bind:value={distance} on:change={() => send("moved")} {step} {...rest} />`
      )
    )
    expect(node.name).toBe("Slider")
    expect(node.attrs.map((item) => item.name)).toEqual([
      "min",
      "max",
      "disabled",
      "size",
      "label",
      "bind:value",
      "on:change",
      "step",
      "...",
    ])
    expect(attr(node, "max")).toEqual({ kind: "static", value: "100" })
    expect(attr(node, "disabled")).toEqual({ kind: "static", value: true })
    expect(attr(node, "size")).toEqual({ kind: "static", value: "sm" })
    expect(attr(node, "min")).toMatchObject({
      kind: "expr",
      expr: { type: "Literal", value: 0 },
    })
    const label = attr(node, "label")
    expect(label?.kind).toBe("template")
    if (label?.kind === "template") {
      expect(label.parts[0]).toBe("Up to ")
      expect(label.parts[1]).toMatchObject({ type: "Ident", name: "max" })
      expect(label.parts[2]).toBe(" km")
    }
    expect(attr(node, "on:change")).toMatchObject({
      kind: "expr",
      expr: { type: "Arrow" },
    })
  })

  test("handlers may hold several statements", () => {
    const node = first(
      parse(`<Button on:click={count += 1; send("Added")}>Add</Button>`)
    )
    expect(attr(node, "on:click")).toMatchObject({
      kind: "expr",
      expr: { type: "Block" },
    })
  })

  test("multi-line state declarations", () => {
    const node = first(
      parse(`<state
  guests={6}
  items={[
    { name: "Lamb", grams: 250 },
    { name: "Potatoes", grams: 180 }
  ]}
/>`)
    )
    expect(node.name).toBe("state")
    expect(node.attrs.map((item) => item.name)).toEqual(["guests", "items"])
  })

  test("void tags need no closing slash", () => {
    expect(tree('<row><icon name="sun"><text>Hi</text><divider></row>')).toEqual(
      [{ row: ["icon", { text: ["Hi"] }, "divider"] }]
    )
  })

  test("a closing tag closes everything left open inside it", () => {
    const doc = parse("<card><row><text>One</card>\n\nAfter")
    expect(outline(doc.children)).toEqual([
      { card: [{ row: [{ text: ["One"] }] }] },
      { p: ["After"] },
    ])
    expect(doc.diagnostics.map((item) => item.message)).toEqual([
      "<text> is never closed",
      "<row> is never closed",
    ])
  })

  test("stray closing tags are dropped", () => {
    const doc = parse("One</box> two")
    expect(outline(doc.children)).toEqual([{ p: ["One two"] }])
    expect(doc.diagnostics).toHaveLength(1)
  })

  test("comments are dropped", () => {
    expect(tree("One<!-- hidden <row> --> two")).toEqual([{ p: ["One two"] }])
  })

  test("unsafe tags are removed with their content", () => {
    const doc = parse(
      'Before<script>alert("x")</script> <iframe src="https://x.dev"></iframe>after'
    )
    expect(outline(doc.children)).toEqual([{ p: ["Before after"] }])
    expect(doc.diagnostics.map((item) => item.message)).toEqual([
      "<script> is not allowed and was removed",
      "<iframe> is not allowed and was removed",
    ])
  })

  test("style keeps its text untouched", () => {
    const node = first(
      parse("<style>\n.hero { color: var(--iui-color-primary); }\n</style>")
    )
    expect(node.children).toEqual([
      { type: "text", value: "\n.hero { color: var(--iui-color-primary); }\n" },
    ])
  })

  test("svg content is plain text and keeps svg names", () => {
    const doc = parse(
      '<svg viewBox="0 0 100 40">\n  <title>Chain</title>\n  <text x="4" y="12">Rear *wheel*</text>\n  {#each gears as g}<circle cx={g.x} cy="20" r={g.r}/>{/each}\n</svg>'
    )
    const svg = first(doc)
    expect(svg.svg).toBe(true)
    expect(outline(svg.children)).toEqual([
      { title: ["Chain"] },
      { text: ["Rear *wheel*"] },
      { each: ["circle"] },
    ])
    const title = svg.children[0] as ElementNode
    expect(title.svg).toBe(true)
  })

  test("a whole answer wrapped in a code fence is unwrapped", () => {
    expect(tree("```iui\n<row><text>Hi</text></row>\n```\n")).toEqual([
      { row: [{ text: ["Hi"] }] },
    ])
    expect(tree("```md\n<row><text>Hi</text></row>\n```")).toEqual([
      { row: [{ text: ["Hi"] }] },
    ])
  })
})

describe("control flow", () => {
  test("if / else if / else", () => {
    const source = `{#if total > 100}
<badge>Big</badge>
{:else if total > 10}
Medium
{:else}
Small
{/if}`
    expect(tree(source)).toEqual([
      { if: [[{ badge: ["Big"] }], [{ p: ["Medium"] }], [{ p: ["Small"] }]] },
    ])
  })

  test("inline if stays inline", () => {
    expect(tree("You have {#if n === 1}one item{:else}{n} items{/if}.")).toEqual(
      [{ p: ["You have ", { if: [["one item"], ["{n}", " items"]] }, "."] }]
    )
  })

  test("each with index, key, destructuring and empty state", () => {
    const doc = parse(
      "<list>{#each items as { name, qty }, i (name)}<list-item>{i + 1}. {name} × {qty}</list-item>{:else}<text>Nothing yet</text>{/each}</list>"
    )
    const each = first(doc).children[0]
    expect(each).toMatchObject({
      type: "each",
      pattern: { type: "ObjectPattern", names: ["name", "qty"] },
      index: "i",
      key: { type: "Ident", name: "name" },
    })
    expect(outline(doc.children)).toEqual([
      {
        list: [
          {
            each: [{ "list-item": ["{i + 1}", ". ", "{name}", " × ", "{qty}"] }],
            empty: [{ text: ["Nothing yet"] }],
          },
        ],
      },
    ])
  })

  test("each over an inline array literal", () => {
    expect(
      tree('{#each [{ t: "A" }, { t: "B" }] as item}<badge>{item.t}</badge>{/each}')
    ).toEqual([{ each: [{ badge: ["{item.t}"] }] }])
  })

  test("@const", () => {
    const doc = parse("{@const total = price * qty}\n\nTotal {total}")
    expect(doc.children[0]).toMatchObject({
      type: "const",
      pattern: { type: "Ident", name: "total" },
    })
  })

  test("broken blocks are reported, not thrown", () => {
    const doc = parse("{#each items}<text>x</text>{/each}{/if}{:else}")
    expect(doc.children).toEqual([])
    expect(doc.diagnostics.map((item) => item.severity)).toEqual([
      "error",
      "warning",
      "warning",
    ])
  })

  test("bad attribute expressions drop only that attribute", () => {
    const doc = parse('<Slider min={0 +} max={10} />')
    const node = first(doc)
    expect(node.attrs.map((item) => item.name)).toEqual(["max"])
    expect(doc.diagnostics[0]?.severity).toBe("error")
  })
})

describe("streaming", () => {
  test("open elements render with what has arrived so far", () => {
    const doc = parse('<card>\n<row gap={2}>\n<text size="lg">Hel', {
      streaming: true,
    })
    expect(outline(doc.children)).toEqual([
      { card: [{ row: [{ text: ["Hel"] }] }] },
    ])
    expect(first(doc).closed).toBe(false)
    expect(doc.diagnostics).toEqual([])
    expect(doc.complete).toBe(true)
  })

  test("a half-written tag is held back", () => {
    for (const partial of [
      "Hello <",
      "Hello <ba",
      "Hello <badge",
      "Hello <badge col",
      'Hello <badge color="suc',
      "Hello <badge color={sta",
      'Hello <badge color="success"',
    ]) {
      const doc = parse(partial, { streaming: true })
      expect(outline(doc.children), partial).toEqual([{ p: ["Hello "] }])
      expect(doc.complete, partial).toBe(false)
    }
    expect(tree('Hello <badge color="success">', true)).toEqual([
      { p: ["Hello ", "badge"] },
    ])
  })

  test("a half-written closing tag is held back", () => {
    expect(tree("<text>Hi</te", true)).toEqual([{ text: ["Hi"] }])
    expect(tree("<text>Hi</", true)).toEqual([{ text: ["Hi"] }])
  })

  test("a half-written expression is held back", () => {
    expect(tree("Total: {sum(items.map(i => i.pr", true)).toEqual([
      { p: ["Total: "] },
    ])
    expect(tree("{#each items as it", true)).toEqual([])
    expect(tree("{#if open}<text>Shown", true)).toEqual([
      { if: [[{ text: ["Shown"] }]] },
    ])
  })

  test("a brace that never closes is text once the stream ends", () => {
    expect(tree("Open { and never closed")).toEqual([
      { p: ["Open { and never closed"] },
    ])
  })

  test("unfinished emphasis and code are closed while streaming", () => {
    expect(tree("Some **bold te", true)).toEqual([
      { p: ["Some ", { strong: ["bold te"] }] },
    ])
    expect(tree("Run `npm ins", true)).toEqual([
      { p: ["Run ", { code: ["npm ins"] }] },
    ])
    expect(tree("See [the docs](https://exa", true)).toEqual([
      { p: ["See the docs"] },
    ])
    expect(tree("Some **", true)).toEqual([{ p: ["Some "] }])
    expect(tree("```js\nconst a = '**", true)).toEqual([
      { pre: ["const a = '**"] },
    ])
  })

  test("every prefix of a document parses without throwing", () => {
    const source = `# Planner

<state guests={6} items={[{ name: "Lamb", grams: 250 }]} />
<derive total={sum(items.map(i => i.grams * guests))} />

<card padding={4}>
  <row justify="between">
    <title>Guests</title>
    <Slider min={1} max={12} bind:value={guests} aria-label="Guests" />
  </row>
  {#each items as item, i (item.name)}
    <row><text>{item.name}</text><text color="secondary">{num(item.grams * guests)} g</text></row>
  {:else}
    Nothing to cook.
  {/each}
  {#if total > 2000}<badge color="warning">Big roast</badge>{/if}
</card>

\`\`\`js
const x = "<row>{y}</row>"
\`\`\`

Total: **{num(total)} g** — <Button on:click={send(\`Shop for \${guests}\`)}>Shopping list</Button>
`
    for (let i = 0; i <= source.length; i++) {
      const doc = parse(source.slice(0, i), { streaming: true })
      expect(doc.diagnostics, source.slice(0, i)).toEqual([])
    }
    const done = parse(source)
    expect(done.diagnostics).toEqual([])
    expect(done.complete).toBe(true)
  })
})
