# Put the renderer in a product

Three things connect a model to a screen: a system prompt that teaches the
markup, a component that renders what comes back, and the callbacks through
which the interface reaches your product.

- [Packages](#packages)
- [Render a reply](#render-a-reply)
- [Build the system prompt](#build-the-system-prompt)
- [Give the interface tools](#give-the-interface-tools)
- [Take the turn back](#take-the-turn-back)
- [Theme it](#theme-it)
- [Add your own components](#add-your-own-components)
- [Change what draws charts and plays motion](#change-what-draws-charts-and-plays-motion)
- [Read and write its state](#read-and-write-its-state)
- [In Vue](#in-vue)
- [In Svelte, in Solid, and without a framework](#in-svelte-in-solid-and-without-a-framework)
- [CSS and your page](#css-and-your-page)
- [What markup can and can't do](#what-markup-can-and-cant-do)
- [Let an agent operate it](#let-an-agent-operate-it)

## Packages

| Package | What it holds |
| --- | --- |
| `@open-intelligent-ui/core` | The markup parser, the expression language, the state store, the DESIGN.md reader. No framework. |
| `@open-intelligent-ui/core/prompt` | `buildSystemPrompt`, `describeComponent`, the guides and the UI SDK catalog. Import it on the server. |
| `@open-intelligent-ui/react` | `<IntelligentUI>` for React, with the primitives, the preset widgets and the stylesheet. |
| `@open-intelligent-ui/vue` | The same for Vue. |
| `@open-intelligent-ui/svelte` | The same for Svelte. |
| `@open-intelligent-ui/solid` | The same for Solid. |
| `@open-intelligent-ui/web` | The same with no framework: the `<intelligent-ui>` element and `mount()`. |
| `open-intelligent-ui` | The unscoped name. Re-exports `@open-intelligent-ui/core`, with `/prompt`. |

```bash
# React
npm install @open-intelligent-ui/react @open-intelligent-ui/core @ui-sdk/react @ui-sdk/core
# Vue
npm install @open-intelligent-ui/vue @open-intelligent-ui/core @ui-sdk/vue @ui-sdk/core
# Svelte
npm install @open-intelligent-ui/svelte @open-intelligent-ui/core @ui-sdk/svelte @ui-sdk/core
# Solid
npm install @open-intelligent-ui/solid @open-intelligent-ui/core @ui-sdk/solid @ui-sdk/core solid-js @solidjs/web
# No framework
npm install @open-intelligent-ui/web @open-intelligent-ui/core @ui-sdk/web @ui-sdk/core
```

All are ESM with type declarations. The React package needs React 19 and
`@ui-sdk/react` + `@ui-sdk/core` as peers, and its entry is marked
`"use client"`: a Next.js server component can render `<IntelligentUI>`,
but `tools` and the callbacks are functions, so pass those from a client
component. The Vue package needs Vue 3.5, the Svelte package Svelte 5.33
and a bundler with the Svelte plugin, the Solid package Solid 2; each needs
its `@ui-sdk/*` package and `@ui-sdk/core` as peers. Hydrating
server-rendered output has not been tested in any of them: in Nuxt put the
surface inside `<ClientOnly>`, in SvelteKit draw it in the browser only, in
SolidStart load it with `clientOnly`.

The five renderers take the same markup and the same props. React, Vue and
Solid draw the same DOM, and Svelte does apart from a few elements
`@ui-sdk/svelte` places differently. The web renderer draws UI SDK
components as custom elements (`<Tabs>` is `<ui-tabs>`) with the same
`data-slot`, roles, names and states, so select on `[data-slot]`, not on a
tag name. The examples below are React; [In Vue](#in-vue) and
[the section after it](#in-svelte-in-solid-and-without-a-framework) list
what is written differently.

## Render a reply

```tsx
import { IntelligentUI } from "@open-intelligent-ui/react"
import "@open-intelligent-ui/react/styles.css"

function Reply({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <IntelligentUI
      source={text}
      streaming={streaming}
      onAction={(action) => {
        if (action.type === "send") sendUserMessage(action.text, action.data, action.state)
        return undefined
      }}
      onWarning={(message) => console.warn(message)}
    />
  )
}
```

- `source` is the model's reply so far. Pass the growing text on every
  chunk with `streaming` set; the renderer parses what is complete, holds
  back a half-written tag, and keeps state as the reader left it.
- Render one `<IntelligentUI>` per assistant turn. Each has its own state.
- Give it a width. It is a size container and lays itself out for the space
  it gets, from a phone column to a full page.
- UI SDK components load on first use. Call `preloadUiSdk()` (or
  `preloadUiSdk("Tabs", "Dialog")`) early if you want none of that wait.

If the model wraps its reply in a Markdown code fence, strip the fence
before rendering; `apps/playground/src/live.ts` has an `unwrapFence` that
does it for a stream.

## Build the system prompt

```ts
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"

const system = buildSystemPrompt({
  design: designMarkdown,
  tools: [
    {
      name: "listTickets",
      kind: "read",
      description: "Tickets in the support queue.",
      input: { status: "open | pending | solved | all" },
      output: "[{ id, title, status, priority, assignee, updatedAt }]",
    },
    {
      name: "updateTicket",
      kind: "write",
      description: "Change a ticket.",
      input: { id: "string", status: "?", assignee: "?" },
    },
  ],
  instructions: "You are the support desk assistant for Acme.",
})
```

The prompt holds the language, the primitives and presets, the UI SDK
components, motion, craft, the design (tokens and prose) and the tools. The
default is about 34,000 characters. To shorten it:

- `components: ["tabs", "dialog", "select"]` shows examples for those only;
  the rest are listed by name. `"all"` shows every one.
- `motion: false` leaves the motion section out.
- Offer `describeComponent(name, { props: true })` as a tool the model can
  call when it needs a component in full.

Send it as the system message with any chat API. Every example inside it is
rendered by the test suite, so the prompt can't teach something the
renderer doesn't do.

## Give the interface tools

Tools are how a generated interface reads and writes your data without a
model call for every click.

```tsx
<IntelligentUI
  source={text}
  tools={{
    listTickets: (input) => api.get("/tickets", input),
    updateTicket: (input) => api.post("/tickets/update", input),
  }}
  callTool={(name, input) => mcp.callTool(name, input)}
  onTool={(event) => audit(event)}
/>
```

- A tool is a function of one argument that returns a value or a promise.
- `<query tool="listTickets" input={…} />` calls it when the interface
  appears and whenever the input changes. `call("updateTicket", {…})` in a
  handler calls it once, then reloads every query.
- `callTool` receives calls to names not in `tools`. Use it to forward to a
  server or an MCP client.
- `onTool` reports each call as `start`, then `done` or `error`, marked
  `read` or `write`.

Tools run in the browser with the reader's session. The markup that calls
them was written by a model, so treat every call as untrusted input: check
permissions and validate on the server, list only tools the reader may use,
and confirm destructive writes in your own UI if the stakes are high. Only
tools you pass exist; markup has no other way to reach the network.

## Take the turn back

`onAction` receives what the interface asks of its host:

| `action.type` | Sent by | Default |
| --- | --- | --- |
| `send` | `send(text, data)` | None. Add `text` to the conversation as a user message, with `data` and `state` as context, and ask the model again. |
| `open` | `open(url)`, links | Opens a new tab, `noopener`. |
| `copy` | `copy(text)` | Writes to the clipboard. |
| `toast` | `toast(message, tone)` | Shows a toast inside the surface. |

Return `true` to say you handled it and skip the default.

`send` is what makes a conversation out of interfaces: the reader adjusts
three sliders, presses "Make this my plan", and the model receives that
sentence together with the numbers they chose.

## Theme it

Pass a DESIGN.md as text. The renderer turns its tokens into CSS variables
for the surface, and the prompt builder gives the model the same tokens and
the prose that explains how to use them.

```tsx
import design from "./brand.DESIGN.md?raw"

<IntelligentUI source={text} design={design} scheme="auto" />
```

- `scheme` is `light`, `dark` or `auto` (follow the system). A design with
  `colors.light` and `colors.dark` supports both.
- With no `design`, the built-in Paper design is used.
- `design/` has complete designs to start from (Paper, Noir, Heritage, Signal). `pnpm design:lint`
  checks them with the DESIGN.md CLI.
- Fonts named in the design are used if the page has them. Load them
  yourself; the renderer does not fetch fonts.

Tokens the renderer reads: `colors` (background, surface, foreground,
muted, border, primary, accent, success, warning, danger, info, chart
colors and their `on-` pairs), `typography`, `rounded`, `spacing`,
`motion` and `components`. `packages/core/src/design/variables.ts` lists
every role and its fallback.

A DESIGN.md written for another component library works too. When the file
has no token YAML, its tokens are read from the CSS variables it documents:
tables of variables with light and dark values, inline `--name: value`, and
`css` blocks. HeroUI's published DESIGN.md is read this way as it is.
`parseDesign` takes options for what such a file leaves open, and returns a
design you pass in place of the text:

```ts
import { designFromCss, parseDesign } from "@open-intelligent-ui/core"

const design = parseDesign(heroui, {
  // Laid over the file's tokens: what it leaves out, or a color it only names.
  tokens: { colors: { snow: "oklch(0.9911 0 0)" }, motion: { emphasis: { duration: "420ms" } } },
  // Which of the design's colors fills which role, when the names differ.
  roles: { primary: "accent", "muted-foreground": "muted" },
  // Sections the model shouldn't read: another library's install steps.
  prose: { omit: ["Setup"] },
})

// With only a theme stylesheet (shadcn/ui, Tailwind `@theme`, your own variables):
const fromCss = designFromCss(themeCss, { name: "Acme", prose: "Primary is for one action per surface." })
```

Nothing here throws. A value that can't be read or isn't safe in CSS is left
out and listed in `design.issues`.

## Add your own components

A model builds most things from primitives and UI SDK parts. Register a
component for what must look the same everywhere in your product, or needs
your code: an order card, an approval flow, a seat map.

```tsx
import { defineComponent, defineLibrary } from "@open-intelligent-ui/core"

const SeatMap = defineComponent({
  name: "SeatMap",
  description: "A cabin seat map. Use it whenever the reader picks a seat.",
  props: {
    flight: { type: "string", required: true, description: "A flight number." },
    selected: { type: "string", bindable: true },
    cabin: ["economy", "business"],
  },
  events: { select: "A seat was pressed; $value is its number." },
  example: `<SeatMap flight="UA418" bind:selected={seat} />`,
  component: SeatMapView,
})

export const library = defineLibrary({ components: [SeatMap] })
```

```tsx
<IntelligentUI source={text} library={library} />

buildSystemPrompt({ library })
```

The renderer and the prompt read the same definition:

- The prompt gets a section per component, written from the definition: the
  description, each prop with its type, the events, whether it takes
  children, and the example.
- The renderer passes a component only the props, events and bindings it
  declares, and only values of the declared type. Anything else is dropped
  and reported through `onWarning`. Markup is untrusted, so a component
  receives nothing it didn't ask for.
- `on:select` becomes `onSelect`. `bind:selected` passes `selected` and
  `onSelectedChange`, for a prop declared `bindable`.
- `props` is a record as above, a JSON Schema of an object, or a Standard
  Schema that can write its own JSON Schema (Zod 4, Valibot, ArkType).
- `validateLibrary(library)` returns what is wrong as sentences: a missing
  description, an example that passes an undeclared prop or leaves out a
  required one. Assert that it is empty in a test.

**A widget is a component written once for every renderer.** `defineWidget`
takes the same description and a `setup` that draws with framework-neutral
views, the way the built-in presets are drawn:

```ts
import { defineWidget, view } from "@open-intelligent-ui/core"

const Rating = defineWidget<{ value: number; label?: string }>({
  name: "Rating",
  description: "A row of stars showing a score out of five.",
  props: { value: { type: "number", required: true }, label: "string" },
  example: `<Rating value={4.5} label="Guest rating" />`,
  setup: () => (props) =>
    view("span", { class: "rating", role: "img", "aria-label": props.label }, [
      "★".repeat(Math.round(props.value)),
    ]),
})
```

`setup` runs once per place the widget is used and receives a handle:
`redraw()` after its own state changed, `cleanup(fn)`, `attach(fn)` to get
one of its elements, `report(message)`. Style a widget with `--iui-*`
variables and it follows every design, light and dark.

**When the prompt is built on a server.** Either leave `component` out of
the definitions, share that file with the server and give the components to
the renderer by name (`components={{ SeatMap: SeatMapView }}`), or write the
library out as data when the app is built:

```ts
writeFileSync("library.json", JSON.stringify(librarySpec(library)))

// On the server, which never loads the UI:
buildSystemPrompt({ library: JSON.parse(readFileSync("library.json", "utf8")) })
```

`components` with `buildSystemPrompt({ hostComponents })` still works. The
description is then written by hand and props are passed through unchecked.

## Change what draws charts and plays motion

Both go in the same library. Markup doesn't change: a model writes the same
`<Chart>` and the same `motion`, `stagger`, `show` and `morph`.

```ts
import { echartsCharts, g2Charts } from "@open-intelligent-ui/core/charts"
import { gsapAdapter, motionAdapter, waapiAdapter } from "@open-intelligent-ui/core/motion"
import { animate } from "motion"

export const library = defineLibrary({
  design,
  components: [SeatMap, Rating],
  charts: echartsCharts(() => import("echarts")),
  motion: motionAdapter(animate),
})
```

Charts:

- `echartsCharts(echarts, { renderer, option })` and `g2Charts(g2, { options })`
  work in every renderer. `rechartsCharts(Recharts)` from
  `@open-intelligent-ui/react/recharts` is for React.
- Pass the module or a function that imports it; the function loads the
  engine when the first chart appears.
- Colors, type, grid and tooltip follow the design and redraw when the
  scheme changes. `on:select`, `format` and the other `<Chart>` props work
  as before.
- The adapters add `type="scatter|radar|funnel"`, and the prompt says so.
  `types: ["bar", "line"]` hands only those to the engine; the built-in SVG
  draws the rest.
- For another charting library, write a `ChartEngine`: `mount(element, spec,
  context)` returns `{ update(spec), destroy() }`. `spec` has the rows,
  series, resolved colors, a number formatter and the theme.

Motion:

- `motionAdapter(animate, { transitions })` for [Motion](https://motion.dev),
  `gsapAdapter(gsap, { eases })` for GSAP, `waapiAdapter()` for the Web
  Animations API with no dependency.
- The renderer still decides what moves and when (arrival while streaming,
  stagger, exits, reduced motion); the adapter moves it. Durations and
  easings still come from the design's `motion` tokens.
- `presets` adds entrances by name, each with a description the prompt
  lists and engine-neutral keyframes:
  `{ "flip-in": { description: "…", keyframes: { opacity: [0, 1], rotate: [-8, 0] } } }`.
  Markup refers to a preset by name; it can't write keyframes.
- For another engine, `createMotionAdapter({ name, animate })`: `animate`
  plays keyframes on an element with a timing and returns
  `{ finished, cancel }`.

Define the library once, at module level, not inside a render function.
`docs/extending.md` has every option.

## Read and write its state

```tsx
const surface = useRef<IntelligentUIHandle>(null)

<IntelligentUI ref={surface} source={text} onStateChange={save} initialState={saved} />

surface.current?.getState()
surface.current?.setState({ guests: 6 })
surface.current?.reset()
surface.current?.refetch("tickets")
```

`<state persist>` values are kept in `storage` under `storageKey` when you
pass both (for example `localStorage` and the message id).

## In Vue

```vue
<script setup lang="ts">
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/vue"
import "@open-intelligent-ui/vue/styles.css"
import { ref } from "vue"
import SeatMap from "./SeatMap.vue"

const surface = ref<IntelligentUIHandle | null>(null)

function onAction(action) {
  if (action.type === "send") sendUserMessage(action.text, action.data, action.state)
}
</script>

<template>
  <IntelligentUI
    ref="surface"
    :source="text"
    :streaming="streaming"
    :design="design"
    :tools="tools"
    :components="{ SeatMap }"
    :on-action="onAction"
    :on-state-change="save"
  />
</template>
```

- Every prop on this page exists under the same name. The callbacks
  (`onAction`, `onTool`, `onWarning`, `onStateChange`, `onDiagnostics`) are
  props that take a function, not emitted events, because `onAction`'s
  return value matters: write `:on-action="fn"`, not `@action="fn"`.
- A template ref is the handle: `surface.value?.getState()`, `setState`,
  `reset`, `refetch`.
- `components` takes Vue components. Markup attributes arrive as props,
  `on:select` calls the listener for the `select` event, and
  `bind:selected` passes `selected` and listens for both
  `update:selected` and `selectedChange`, so a component written for
  `v-model:selected` works as it is.
- `let:name` reads what a component passes to its default slot, where
  React reads what it passes to a function child.
- `class` and `style` on `<IntelligentUI>` land on the surface's root.
- Vue counts the ids `useId()` gives out per app. If each reply is a Vue
  app of its own, set a different `app.config.idPrefix` on each, so the ids
  UI SDK components give their parts don't repeat across replies.

## In Svelte, in Solid, and without a framework

Every prop on this page exists under the same name in all three. Each
package's README has a full example and the list of what differs.

**Svelte** (`@open-intelligent-ui/svelte`): `<IntelligentUI source={text}
{streaming} {onAction} />`. `bind:this` is the handle. `components` takes
Svelte components; `on:pick` arrives as the function prop `onPick`, and
`bind:value` as a `value` the component can write (`$bindable()`) plus
`onValueChange`. `let:` reads what a component passes to its `children`
snippet.

**Solid** (`@open-intelligent-ui/solid`): the JSX is the same as React's.
`ref` is called with the handle. `components` takes Solid components,
which run once: read props where Solid tracks them.

**No framework** (`@open-intelligent-ui/web`). The page still needs a
bundler such as Vite: the imports below are package names and a
stylesheet, which a browser can't load by itself. The package README
lists what an import map would need instead.

```html
<intelligent-ui id="reply"></intelligent-ui>

<script type="module">
  import "@open-intelligent-ui/web/define"
  import "@open-intelligent-ui/web/styles.css"

  const reply = document.querySelector("#reply")
  reply.tools = tools
  reply.addEventListener("action", (event) => {
    if (event.detail.type === "send") sendUserMessage(event.detail.text, event.detail.data, event.detail.state)
  })
  reply.streaming = true
  reply.source = textSoFar
</script>
```

- Options that are text (`source`, `design`, `scheme`, `locale`,
  `currency`) are attributes and properties; the rest (`tools`,
  `components`, `allowUrl`, the callbacks) are properties. What the surface
  reports is also an event: `action`, `tool`, `warning`, `diagnostics`,
  `statechange`. Call `event.preventDefault()` on `action` where the other
  renderers return `true`.
- The element is the handle: `reply.getState()`, `setState`, `reset`,
  `refetch`. `mount(target, options)` does the same without registering an
  element and returns the handle with `update()` and `unmount()`.
- `components` maps a name to a custom element's tag, to
  `{ tag, properties, events }`, or to a function `(props, children) =>
  Node` that builds the DOM.
- A page that already loads another renderer's `styles.css` needs only
  `@open-intelligent-ui/web/elements.css` on top of it.

## CSS and your page

The stylesheet uses two cascade layers, `ui-sdk` then `iui`, and everything
in it is confined to `.iui-root`. Your page is not restyled.

The reverse needs care: **CSS outside any layer beats layered CSS**, so an
unlayered reset such as `button { color: inherit }` or `* { margin: 0 }`
overrides the renderer inside the surface. Put resets in a layer of their
own declared first, or keep them off the surface:

```css
@layer reset, ui-sdk, iui;

@layer reset {
  button { font: inherit; color: inherit; }
}
```

With Tailwind 4, or a component library built on it, the page's styles are
already layered. Name their layers first so the surface's come last:

```css
@layer theme, base, components, utilities, ui-sdk, iui;
@import "tailwindcss";
```

The renderer then wins wherever both set a property. Two things still get
through: a reset on a property the renderer leaves alone (`svg { display:
block }`), and a class name of the library that a reply happens to use
(`.card`, `.button`). If either shows, keep those layers off the surface by
adding `:where(:not(.iui-root, .iui-root *))` to their selectors;
`apps/playground/build/outside-surfaces.ts` in the repository is a PostCSS
plugin that does it.

Dialogs, popovers, menus and toasts use the browser's top layer, so they
are not clipped by a scrolling chat column and need no z-index from you.

## What markup can and can't do

Markup is data that the renderer interprets. It is never evaluated as
JavaScript.

- Expressions run in an interpreter with no access to `window`, `document`,
  `fetch`, timers or `eval`, and no way to reach object prototypes.
- `<script>`, `<iframe>`, `<object>`, `<embed>`, `<meta>`, `<base>`,
  `<template>`, SVG `<foreignObject>` and string event attributes
  (`onclick="…"`) are dropped.
- Links accept `http`, `https`, `mailto`, `tel` and relative URLs. Images
  and video accept `http`, `https`, `blob:` and image `data:` URLs.
  `allowUrl` lets you narrow that, for example to your own domains. It is
  asked about the `open(url)` action too, and about each address a
  `Pagination`'s `getHref` returns.
- The `form` attribute is dropped everywhere, so a control can't join a
  form of yours by its id, and a button can't submit one.
- A `<FileInputDropzone>` takes the files dropped on or pasted into it.
  The options that would make it listen to the whole page, `target` and
  `pasteTarget`, are dropped. One effect on your page remains: while a
  reply shows a drop zone, UI SDK cancels file drops that land outside its
  drop zones, so the browser doesn't open the file. A file drop target of
  your own can stop taking files during that time.
- `<style>` is scoped to its surface. `@import`, `url()` to other sites and
  unknown at-rules are removed, and `position: fixed` becomes `absolute`,
  so a surface can't draw over your page. The scope holds across the page,
  also when each reply is its own React root or Vue app, or is drawn by a
  different renderer.
- The only side effects are the actions: `send`, `call`, `refetch`,
  `reset`, `toast`, `copy`, `open`, plus any you add with `actions`.

A model can still write something misleading, such as a button whose label
doesn't match what it sends. Show the reader what a `send` said, as a user
message, and keep consequential writes behind tools you control.

## Let an agent operate it

Because the controls are UI SDK components, UI SDK's agent bridge can read
and drive a generated surface: `createAgent()` from `@ui-sdk/react/agent`
(or the `/agent` entry of the `@ui-sdk/*` package you use)
returns a snapshot of the controls with their labels and values, and can
act on them (for example `setValue`). An agent can therefore use an interface
another agent wrote. `packages/react/test/ui-sdk.test.tsx` shows it.
