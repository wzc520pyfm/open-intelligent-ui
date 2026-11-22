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
- [Read and write its state](#read-and-write-its-state)
- [CSS and your page](#css-and-your-page)
- [What markup can and can't do](#what-markup-can-and-cant-do)
- [Let an agent operate it](#let-an-agent-operate-it)

## Packages

| Package | What it holds |
| --- | --- |
| `@open-intelligent-ui/core` | The markup parser, the expression language, the state store, the DESIGN.md reader. No framework. |
| `@open-intelligent-ui/core/prompt` | `buildSystemPrompt`, `describeComponent`, the guides and the UI SDK catalog. Import it on the server. |
| `@open-intelligent-ui/react` | `<IntelligentUI>`, the primitives, the preset widgets and the stylesheet. |

They are workspace packages in this repository and are not on npm. They
export TypeScript source, so use them through the workspace or a bundler
that compiles dependencies (Vite does). The React package needs React 19
and `@ui-sdk/react` + `@ui-sdk/core` as peers.

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
- `design/` has three complete designs to start from. `pnpm design:lint`
  checks them with the DESIGN.md CLI.
- Fonts named in the design are used if the page has them. Load them
  yourself; the renderer does not fetch fonts.

Tokens the renderer reads: `colors` (background, surface, foreground,
muted, border, primary, accent, success, warning, danger, info, chart
colors and their `on-` pairs), `typography`, `rounded`, `spacing`,
`motion` and `components`. `packages/core/src/design/variables.ts` lists
every role and its fallback.

## Add your own components

```tsx
<IntelligentUI source={text} components={{ FlightCard, SeatMap }} />
```

```ts
buildSystemPrompt({
  hostComponents: [
    {
      name: "SeatMap",
      description: "A cabin seat map. Props: flight (string), selected (string), onSelect.",
      example: '<SeatMap flight="UA418" bind:selected={seat} />',
    },
  ],
})
```

Markup uses them by name. Props are passed through, `on:select` becomes
`onSelect`, and `bind:selected` passes `selected` and `onSelectedChange`.
Use this for things that need your code: a map, a payment sheet, a
product-specific widget. Everything else the model can build itself.

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
  `allowUrl` lets you narrow that, for example to your own domains.
- `<style>` is scoped to its surface. `@import`, `url()` to other sites and
  unknown at-rules are removed, and `position: fixed` becomes `absolute`,
  so a surface can't draw over your page.
- The only side effects are the actions: `send`, `call`, `refetch`,
  `reset`, `toast`, `copy`, `open`, plus any you add with `actions`.

A model can still write something misleading, such as a button whose label
doesn't match what it sends. Show the reader what a `send` said, as a user
message, and keep consequential writes behind tools you control.

## Let an agent operate it

Because the controls are UI SDK components, UI SDK's agent bridge can read
and drive a generated surface: `createAgent()` from `@ui-sdk/react/agent`
returns a snapshot of the controls with their labels and values, and can
act on them (for example `setValue`). An agent can therefore use an interface
another agent wrote. `packages/react/test/ui-sdk.test.tsx` shows it.
