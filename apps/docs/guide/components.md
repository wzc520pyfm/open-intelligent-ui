# Your components

A model builds most things from primitives and UI SDK parts. Some things have to look the same everywhere in your product, or need code a model can't write: an order card, an approval flow, a seat map. Register those, and the model uses them the way you declared.

## One library, two readers

Everything a product adds goes into one `Library`. The renderer reads it to draw, and the prompt builder reads it to write the prompt. Both see the same definitions, so the prompt can't teach something the renderer doesn't have.

```ts
import { defineLibrary } from "@open-intelligent-ui/core"
import { echartsCharts } from "@open-intelligent-ui/core/charts"
import { motionAdapter } from "@open-intelligent-ui/core/motion"
import { animate } from "motion"
import design from "./acme.DESIGN.md?raw"

export const library = defineLibrary({
  name: "Acme",
  design,                                           // the product's DESIGN.md
  components: [OrderCard, Steps, PolicyCheck],      // its components and widgets
  charts: echartsCharts(() => import("echarts")),   // what draws <Chart>
  motion: motionAdapter(animate),                   // what plays motion
  instructions: 'Show every amount with <Number format="currency">.',
})
```

```tsx
// In the app
<IntelligentUI source={reply} streaming={streaming} library={library} />

// Where the prompt is built
buildSystemPrompt({ library, tools })

// Where a reply is checked
checkMarkup(reply, { library, tools })
```

Every part is optional. Define the library once, at module level, not inside a render function.

## Registering a component

`defineComponent` registers a component of your framework with a description, declared props, events and an example.

```tsx
import { defineComponent } from "@open-intelligent-ui/core"

const OrderCard = defineComponent({
  name: "OrderCard",
  description: "One order: status, total and recipient. Use it wherever an order is shown.",
  props: {
    order: { type: "object", required: true, description: "An item returned by listOrders." },
    tone: ["neutral", "urgent"],
    expanded: { type: "boolean", bindable: true },
  },
  events: { open: "The card was pressed; $value is the order id." },
  children: "Action buttons at the bottom of the card.",
  example: `<OrderCard order={order} on:open={picked = $value} />`,
  component: OrderCardView,
})
```

| Field | Meaning |
| --- | --- |
| `name` | The tag, in PascalCase. A name that matches a preset or a UI SDK part replaces it |
| `description` | What it is and when to use it. This sentence is what the model reads |
| `props` | The props it takes, in one of three forms below |
| `events` | The events it reports. Markup listens with `on:name` |
| `children` | `true`, or a sentence saying what goes between the tags. Left out, it takes no children |
| `example`, `examples` | Complete uses. The first goes into the prompt |
| `component` | The component: a React, Vue, Solid or Svelte component. In the web renderer, a custom element's tag, `{ tag, properties, events }`, or a function that returns a DOM node |
| `prompt: false` | Keeps it out of the prompt, for a replacement of a preset the prompt already explains |

**Props in three forms.**

```ts
// 1. Shorthand: a type name, a list of allowed values, or a full description.
props: {
  title: "string",
  size: ["sm", "md", "lg"],
  rows: { type: "array", items: { type: "object", properties: { id: "string", total: "number" } }, required: true },
  page: { type: "number", default: 1, bindable: true, description: "The current page." },
}

// 2. A JSON Schema of an object.
props: z.toJSONSchema(OrderCardProps)

// 3. A Standard Schema that can write its own JSON Schema (Zod 4, Valibot, ArkType).
props: OrderCardProps
```

## Declared props are enforced

A component with `props` is strict. The renderer passes it only the props, events and bindings it declares, and only values of the declared type.

- An undeclared prop is dropped.
- A value of the wrong type is dropped and reported through `onWarning`: `<OrderCard> takes "neutral" | "urgent" for "tone"`.
- A missing required prop is reported.
- A `default` is filled in when markup leaves the prop out.

Markup is written by a model and can be steered by prompt injection, so a component receives nothing it didn't ask for. `class`, `style`, `motion`, `show`, `aria-*` and `data-*` are always allowed. The [checker](./correctness) applies the same rules before anything is drawn.

**Events and bindings.** `on:open` reaches the component as `onOpen` (in Vue, the listener for `open`). A prop declared `bindable` can be written `bind:expanded={x}`: the component reports changes through `onExpandedChange` (in Vue, `update:expanded`, so a component written for `v-model:expanded` works as it is).

## Widgets: written once for every renderer

A component made with `defineComponent` belongs to one framework. A widget, made with `defineWidget`, is drawn with framework-neutral views, the way the built-in presets are. One definition draws the same DOM in React, Vue, Svelte, Solid and Web Components.

```ts
import { defineWidget, view } from "@open-intelligent-ui/core"

const Steps = defineWidget<{ items: string[]; current?: number; onSelect?: (index: number) => void }>({
  name: "Steps",
  description: "Where something stands in a fixed sequence, such as an approval or an order.",
  props: {
    items: { type: "array", items: "string", required: true, description: "The stages, in order." },
    current: { type: "number", default: 0, description: "The index of the stage in progress." },
  },
  events: { select: "A stage was pressed. $value is its index." },
  example: `<Steps items={["Submitted", "Manager", "Finance", "Paid"]} current={1} />`,
  setup: () => (props) =>
    view(
      "ol",
      { class: "acme-steps" },
      props.items.map((item, index) =>
        view(
          "li",
          {
            key: index,
            "data-stage": index < (props.current ?? 0) ? "done" : index === props.current ? "current" : "todo",
            on: { click: () => props.onSelect?.(index) },
          },
          [item]
        )
      )
    ),
})
```

The example below uses three widgets a made-up expense product registered: `Person`, `Steps` and `PolicyCheck`. The model composes them with primitives it chose itself. This page draws them with the Vue renderer; the playground draws the same definitions with all five.

```iui live product designs
<state stage={1} />
<derive stages={["Submitted", "Manager", "Finance", "Paid"]} />

<card padding={4} gap={4}>
  <row wrap gap={3}>
    <Person name="Mei Tanaka" role="Design · Tokyo offsite" status="online" />
    <spacer />
    <badge color="accent">Waiting for you</badge>
  </row>
  <Steps items={stages} current={stage} on:select={stage = $value} />
  <box gap={3}>
    <PolicyCheck result="pass" label="Receipts">All five lines have one attached.</PolicyCheck>
    <PolicyCheck result="review" label="Hotel rate">{currency(312)} a night against a {currency(280)} cap for Tokyo.</PolicyCheck>
  </box>
  <row gap={2}>
    <Button variant="solid" on:click={stage = min(stage + 1, 3)}>Approve</Button>
    <Button on:click={stage = 0}>Send back</Button>
  </row>
</card>
```

`setup` runs once for each place the widget is used and returns the function that draws it. Keep the widget's own state in the closure:

```ts
setup: (handle) => {
  let open = false
  handle.cleanup(() => { /* when it leaves the page */ })
  return (props, children) =>
    view("section", {}, [
      view("button", { on: { click: () => { open = !open; handle.redraw() } } }, [props.title]),
      open ? view("div", {}, children) : null,
    ])
}
```

| `handle` | Use |
| --- | --- |
| `redraw()` | Its own state changed: draw again with the last props |
| `cleanup(fn)` | Runs when it leaves the page |
| `attach(fn)` | Gives it one of its real elements, for a third-party library |
| `report(message)` | Reports a problem through `onWarning` |

Style a widget with `--iui-*` variables and it follows every design, light and dark.

**Which to use.** `defineWidget` for what can be drawn with views: it covers every framework at once. `defineComponent` to reuse a component your design system already has.

## The prompt follows

`buildSystemPrompt({ library })` writes a section for each component from its definition:

````md
# Components from this product

Prefer these over building the same thing yourself.

### Steps

Where something stands in a fixed sequence, such as an approval or an order.

- `items`: `string[]`, required. The stages, in order.
- `current`: `number`, default `0`. The index of the stage in progress.
- `on:select`: A stage was pressed. `$value` is its index.
- Takes no children; self-close it.

```
<Steps items={["Submitted", "Manager", "Finance", "Paid"]} current={1} />
```
````

The chart types an engine adds go into the charts section, an adapter's presets into the motion section, the design into the design section, and `instructions` at the end.

## Test the library

`validateLibrary` parses every example and returns what is wrong as sentences: a missing description, an example that doesn't use its component, passes an undeclared prop, leaves out a required one, or gives children to a component that takes none. It also reports tokens the design couldn't be read for.

```ts
import { validateLibrary } from "@open-intelligent-ui/core"

test("the library", () => expect(validateLibrary(library)).toEqual([]))
```

## When the prompt is built on a server

A server that builds the prompt shouldn't load UI code, and may not run Node. There are two ways.

**Share definitions without components.** Leave `component` out, import the file on both sides, and give the renderer the implementations by name:

```tsx
// shared/library.ts
export const library = defineLibrary({
  components: [defineComponent({ name: "OrderCard", description: "…", props: { /* … */ } })],
})

// In the app
<IntelligentUI library={library} components={{ OrderCard: OrderCardView }} />
```

**Write the library out as data.** `librarySpec(library)` turns it into plain JSON: components with their descriptions, props, events and examples, the chart and motion notes, and the design.

```ts
// At build time
writeFileSync("dist/library.json", JSON.stringify(librarySpec(library)))

// On the server
const library = JSON.parse(readFileSync("library.json", "utf8"))
const system = buildSystemPrompt({ library, tools })
const result = checkMarkup(reply, { library, tools })
```

The JSON can also be diffed in CI to notice a change in a component's interface.

## Limits

- Markup can use a component by name and pass declared props of the right type. It can't pass `ref` or `innerHTML`, and a prop that holds a URL still goes through the protocol filter and `allowUrl`.
- In your own components, treat text from props as text. Don't build HTML from it.
