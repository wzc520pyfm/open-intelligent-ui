import type { Sample } from "../../vue/test/corpus"

/**
 * Interfaces with no UI SDK component in them. The corpus leans on UI SDK,
 * so these cover the rest on its own: Markdown, plain HTML and SVG, each of
 * the 15 primitives, each of the 6 presets, and the language features that
 * shape the tree. Every one must come out as the DOM React makes.
 */
export const EXACT_SAMPLES: Sample[] = [
  {
    name: "markdown",
    source: `# Heading one

Some **bold**, *italic*, ~~struck~~ and \`code\`, with a [link](https://example.com "Example").

## Lists

- one
- two
  - nested
1. first
2. second

- [ ] to do
- [x] done

> A quote
> over two lines.

| Name | Qty |
| :--- | ---: |
| Tea | 2 |
| Milk | 1 |

---

![A picture](https://example.com/a.png)

\`\`\`ts
const a = 1
\`\`\`
`,
  },
  {
    name: "plain html",
    source: `<section id="top" class="wrap" data-kind="demo" aria-label="Demo">
  <h2 title="A title">Heading</h2>
  <p>Text with <em>emphasis</em>, <strong>weight</strong>, <kbd>Ctrl</kbd> and a <a href="https://example.com" target="_blank">link</a>.</p>
  <ul><li>One</li><li>Two</li></ul>
  <table><thead><tr><th scope="col">A</th></tr></thead><tbody><tr><td colspan="2">1</td></tr></tbody></table>
  <form>
    <label for="name">Name</label>
    <input id="name" type="text" placeholder="Ada" value="x" maxlength="12" required disabled />
    <input type="checkbox" checked />
    <textarea rows="3" readonly>note</textarea>
    <select><option value="a">A</option><option value="b" selected>B</option></select>
    <button type="button" tabindex="0" style="color: red; --gap: 4px">Go</button>
  </form>
  <details open><summary>More</summary>Inside</details>
  <img src="https://example.com/a.png" alt="A" width="40" height="30" loading="lazy" />
  <video src="https://example.com/a.mp4" controls muted></video>
  <progress value="3" max="10"></progress>
</section>`,
  },
  {
    name: "svg",
    source: `<svg viewBox="0 0 100 60" width="200" height="120" role="img" aria-label="Shapes">
  <defs><linearGradient id="g" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="red" /><stop offset="1" stop-color="blue" /></linearGradient></defs>
  <rect x="2" y="2" width="40" height="20" rx="4" fill="url(#g)" stroke-width="2" />
  <circle cx="70" cy="30" r="12" fill="none" stroke="currentColor" stroke-dasharray="4 2" />
  <path d="M5 50 L95 50" stroke-linecap="round" motion="draw" />
  <text x="10" y="40" text-anchor="start" font-size="8">Label</text>
  <g transform="translate(4 4)" clip-path="none"><line x1="0" y1="0" x2="10" y2="10" /></g>
</svg>`,
  },
  {
    name: "primitive box, row and spacer",
    source: `<box padding="md" gap={2} background="surface" border radius="lg" shadow="sm" width={320} maxWidth="100%">
  <row gap="sm" wrap justify="between" align="end">
    <text>Left</text>
    <spacer />
    <text>Right</text>
    <spacer size={12} />
  </row>
  <box direction="row" paddingX={3} marginY="xs" opacity={0.8} overflow="hidden" aspectRatio="16/9" grow self="center">In a row</box>
</box>`,
  },
  {
    name: "primitive grid and grid-item",
    source: `<grid columns={3} gap="md">
  <grid-item span={2}>Wide</grid-item>
  <grid-item rowSpan={2}>Tall</grid-item>
  <grid-item span="full">Full</grid-item>
</grid>
<grid minColumnWidth={220} stagger>
  <card>One</card>
  <card>Two</card>
</grid>`,
  },
  {
    name: "primitive card",
    source: `<card>Plain</card>
<card variant="soft" padding="lg">Soft</card>
<card variant="outline" interactive>Outline</card>
<card variant="ghost" class="mine" style="margin-top: 4px">Ghost</card>
<card variant="elevated" motion="pop" delay={120}>Elevated</card>`,
  },
  {
    name: "primitive title and text",
    source: `<title>Default level</title>
<title level={1} align="center">One</title>
<title level={6} color="muted">Six</title>
<text>Plain</text>
<text size="xl" weight="bold" color="accent" align="end" block>Large</text>
<text mono tabular italic uppercase strike>Styled</text>
<text truncate>Cut short</text>
<text lines={2} balance variant="caption">Clamped to two lines</text>`,
  },
  {
    name: "primitive badge and divider",
    source: `<row>
  <badge>Default</badge>
  <badge color="success" variant="solid">Paid</badge>
  <badge color="danger" variant="outline" size="sm">Late</badge>
  <badge color="info" variant="dot" size="lg">Live</badge>
  <divider vertical />
</row>
<divider />
<divider spacing="lg" />`,
  },
  {
    name: "primitive icon",
    source: `<row>
  <icon name="arrow-right" />
  <icon name="map-pin" size="lg" color="accent" label="Place" />
  <icon name="check" size={18} />
  <icon name="no-such-icon-anywhere" />
</row>`,
  },
  {
    name: "primitive image",
    source: `<image src="https://example.com/a.png" alt="A picture" />
<image src="https://example.com/b.png" alt="" fit="contain" aspectRatio="4/3" radius="lg" width={200} />
<image src="javascript:alert(1)" alt="Refused" />`,
  },
  {
    name: "primitive link",
    source: `<state n={0} />
<link href="https://example.com">Out</link>
<link href="/local" size="sm" weight="medium">Local</link>
<link on:click={n += 1}>Pressed {n}</link>
<link href="javascript:alert(1)">Refused</link>`,
  },
  {
    name: "primitive list and list-item",
    source: `<list>
  <list-item>Plain</list-item>
  <list-item icon="map-pin">With an icon</list-item>
</list>
<list marker="number" connector>
  <list-item>First</list-item>
  <list-item>Second</list-item>
</list>
<list marker="check"><list-item>Done</list-item></list>
<list marker="bullet"><list-item>Dot</list-item></list>`,
  },
  {
    name: "preset Chart",
    source: `<state rows={[{ month: "Jan", plan: 10, actual: 8 }, { month: "Feb", plan: 12, actual: 15 }, { month: "Mar", plan: 14, actual: 11 }]} />
<Chart type="bar" data={rows} x="month" y={["plan", "actual"]} legend labels names={{ plan: "Plan" }} colors={["chart-3", "accent"]} aria-label="Plan against actual" />
<Chart type="bar" data={rows} x="month" y={["plan", "actual"]} stacked height={160} />
<Chart type="line" data={rows} x="month" y="actual" format="currency" currency="EUR" />
<Chart type="area" data={rows} x="month" y="plan" unit="kg" />
<Chart type="donut" data={rows} x="month" y="plan" legend />
<Chart type="pie" data={rows} x="month" y="actual" format="percent" />
<Chart type="spark" data={rows} y="actual" height={32} />
<Chart type="bar" data={[]} x="month" y="plan" />`,
  },
  {
    name: "preset Stat",
    source: `<grid columns={3}>
  <Stat label="Revenue" value={12800} format="currency" delta={0.08} caption="vs last month" icon="trending-up" />
  <Stat label="Churn" value={0.031} format="percent" delta={-0.004} invert />
  <Stat label="Weight" value={72.5} unit="kg"><Chart type="spark" data={[{ v: 1 }, { v: 3 }, { v: 2 }]} y="v" height={24} /></Stat>
</grid>`,
  },
  {
    name: "preset Number",
    source: `<row>
  <Number value={1234.5} />
  <Number value={0.42} format="percent" />
  <Number value={1999} format="currency" currency="JPY" />
  <Number value={1250000} format="compact" />
  <Number value={3.14159} digits={2} unit="rad" />
</row>`,
  },
  {
    name: "preset DataTable",
    source: `<state row={null} rows={[{ id: 1, name: "Ada", price: 12, status: "paid" }, { id: 2, name: "Lin", price: 30, status: "late" }, { id: 3, name: "Bo", price: 7, status: "paid" }]} />
<DataTable data={rows} columns={["name", { key: "price", label: "Price", format: "currency", align: "right" }, { key: "status", badge: { paid: "success", late: "danger" } }]} sortable pageSize={2} rowKey="id" selected={2} on:select={row = $value} />
<DataTable data={[]} columns={["name"]} empty="Nothing yet" />`,
  },
  {
    name: "preset CodeBlock",
    source: `<CodeBlock code="const a = 1\\nconst b = 2" lang="ts" />
<CodeBlock code="plain" />`,
  },
  {
    name: "preset Skeleton",
    source: `<Skeleton />
<Skeleton lines={3} />
<Skeleton width={120} height={16} />
<Skeleton circle width={40} />`,
  },
  {
    name: "state, expressions and blocks",
    source: `<state n={2} items={[{ id: "a", name: "Tea", qty: 2 }, { id: "b", name: "Milk", qty: 0 }]} mode="list" />
<let total={items.reduce((sum, item) => sum + item.qty, 0)} />
<text>{n * 2} / {total} / {mode == "list" ? "List" : "Grid"}</text>
{#if n > 1}<badge>Many</badge>{:else}<badge>Few</badge>{/if}
{#each items as item, index (item.id)}
  <row class:empty={item.qty == 0} style:opacity={item.qty == 0 ? 0.5 : 1}>
    <text>{index + 1}. {item.name}</text>
    {#if item.qty > 0}<badge color="success">{item.qty}</badge>{/if}
  </row>
{:else}
  <text>None</text>
{/each}
<input aria-label="N" type="number" bind:value={n} />
<input aria-label="Flag" type="checkbox" bind:checked={n} />
<box show={n > 1}>Shown</box>
<box show={n > 5}>Hidden</box>`,
  },
  {
    name: "define",
    source: `<define name="Pill" props="label, tone">
  <badge color={tone ?? "info"}>{label}<slot /></badge>
</define>
<Pill label="One" />
<Pill label="Two" tone="success"> !</Pill>`,
  },
]
