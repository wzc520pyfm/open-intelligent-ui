# @open-intelligent-ui/web

The Web Components renderer for [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui), for pages with no framework. A model writes Markdown mixed with tags; `<intelligent-ui>` turns that stream into a live interface with [UI SDK](https://ui-sdk.dev/docs) behaviors, a [DESIGN.md](https://github.com/google-labs-code/design.md) look and motion.

```bash
npm install @open-intelligent-ui/web @open-intelligent-ui/core @ui-sdk/web @ui-sdk/core
```

`@ui-sdk/web` and `@ui-sdk/core` are peer dependencies, so the renderer and your own code share one copy and one registration of each custom element.

## Render a reply

As a custom element:

```html
<intelligent-ui id="reply" scheme="auto"></intelligent-ui>

<script type="module">
  import "@open-intelligent-ui/web/define"
  import "@open-intelligent-ui/web/styles.css"

  const reply = document.querySelector("#reply")
  reply.design = designMarkdown
  reply.tools = { listTickets, updateTicket }
  reply.addEventListener("action", (event) => {
    const action = event.detail
    if (action.type === "send") askModel(action.text, action.data, action.state)
  })

  for await (const text of replySoFar()) {
    reply.streaming = true
    reply.source = text
  }
  reply.streaming = false
</script>
```

Or as a function, when you would rather not register an element:

```ts
import { mount } from "@open-intelligent-ui/web"
import "@open-intelligent-ui/web/styles.css"

const ui = mount(document.querySelector("#reply"), {
  source: "",
  streaming: true,
  design: designMarkdown,
  tools: { listTickets, updateTicket },
  onAction(action) {
    if (action.type === "send") askModel(action.text, action.data, action.state)
  },
})

ui.update({ source: textSoFar, streaming: true })
ui.update({ source: wholeText, streaming: false })
ui.unmount()
```

- `source` is the model's reply so far. Pass the growing text on every chunk with `streaming` set.
- `design` is a DESIGN.md file's text. Leave it out for the built-in design.
- `tools` are the functions markup reads with `<query>` and writes with `call()`.
- `onAction` receives what the reader decided, to send back to the model. Return `true` when you have handled an `open` or `copy` action yourself.

The markup, the options and the prompt are the same as for [`@open-intelligent-ui/react`](https://www.npmjs.com/package/@open-intelligent-ui/react); one reply looks and behaves the same in both. The prompt that teaches a model the markup comes from `buildSystemPrompt` in [`@open-intelligent-ui/core/prompt`](https://www.npmjs.com/package/@open-intelligent-ui/core).

What is on the page is patched in place as `source` grows and as state changes. An element that is still in the markup is the same element afterwards, with its focus, what was typed in it and its scroll position.

## `<intelligent-ui>`

`import "@open-intelligent-ui/web/define"` registers the element. To choose when, or under which tag name, import `defineIntelligentUI` from the package root, which has no side effects, and call `defineIntelligentUI()` or `defineIntelligentUI("my-reply")`.

The element draws into its own light DOM, so the stylesheet you imported reaches it.

| Option | Attribute | Property |
| --- | --- | --- |
| `source`, `design`, `scheme`, `locale`, `currency` | same name | same name |
| `streaming` | `streaming`, present or absent | `streaming` |
| `storageKey` | `storage-key` | `storageKey` |
| `components`, `tools`, `callTool`, `initialState`, `functions`, `actions`, `storage`, `allowUrl` | | same name |
| `onAction`, `onTool`, `onWarning`, `onDiagnostics`, `onStateChange` | | same name |

A property wins over its attribute. Several set in one go are drawn once.

What the surface reports is an event as well as a callback property, with the value in `event.detail`:

| Event | Callback | Detail |
| --- | --- | --- |
| `action` | `onAction` | The action. Call `event.preventDefault()` to replace the built-in handling of `open`, `copy` and `toast` |
| `tool` | `onTool` | A tool call starting, succeeding or failing |
| `warning` | `onWarning` | A message about the markup |
| `diagnostics` | `onDiagnostics` | Parse problems for the current source |
| `statechange` | `onStateChange` | The state, as plain data |

The events do not bubble. The element is also the handle: `getState()`, `setState()`, `reset()`, `refetch()` and `surface`. `mount()` returns the same methods next to `update()`, `flush()` and `unmount()`.

## Your own components

`components` maps a PascalCase name in markup to one of three things:

```ts
mount(target, {
  source,
  components: {
    // A custom element, by its tag name.
    SeatMap: "seat-map",
    // A custom element with the props it takes as properties, and its event names.
    PriceGrid: { tag: "price-grid", properties: ["rows"], events: { onPick: "row-pick" } },
    // A function that builds the DOM.
    Countdown(props, children) {
      const box = document.createElement("div")
      box.className = "countdown"
      box.append(`${props.seconds}s`, ...children)
      return box
    },
  },
})
```

- A custom element gets every prop as an attribute. Markup is written by a model and is not trusted, so only the props you list in `properties` are assigned as properties, which is how an element takes an array or an object. `innerHTML` and the other properties that replace an element's content are never assigned, listed or not.
- `on:pick={...}` and `onPick={...}` listen for the event `pick`, unless `events` names another. The handler receives `event.detail.value`, or `event.detail`, or the event when it has no detail.
- `bind:value={x}` sets `value` and listens for `valuechange`.
- A function receives the props and the child nodes, already built, to put anywhere in what it returns; they stay live where it put them. It is called again when a prop that isn't a handler changes. Build nodes with `document.createElement`; text from `props` must never be parsed as HTML.

## What differs from React

- UI SDK components are drawn with the custom elements of `@ui-sdk/web`: `<Tabs>` is `<ui-tabs>`, `<DialogPopup>` is `<ui-dialog-popup>`. Where React draws a native element, the custom element wraps or stands in for it, with the same `data-slot`, roles, names and states. Selectors on `[data-slot]` hold in both; selectors on a tag name (`button`, `table`) may not.
- `styles.css` is the stylesheet the React renderer ships, followed by the few rules the custom elements need to look the same.
- `let:` reads what the custom element makes public instead of React's state object: the values its root keeps (`value`, `open`, `page`), its `data-*` state and a range's `value`, `min`, `max`, `percent` and `text`. `<ProgressValue let:progress>`, `<PaginationList let:pages>`, `<CalendarWeekdays let:index>` and `<CalendarWeeks let:cell>` work as in React; inside `<CalendarWeeks>` the day must be a `<CalendarDay>`.
- A few components draw once from what is in them when they join the page (`Field`, `Select`, `Rating`, `Slider`, `Tooltip` and others). While a reply streams, such a component is drawn again when its closing tag arrives, so the finished reply is the same as one drawn whole. Focus and typed text are carried over; anything else the reader did inside it before its closing tag arrived and that isn't bound to state starts over. Tabs, dialogs, menus, accordions and the other containers are never redrawn.
- 14 of the 367 component names have no custom element of their own. `AvatarImage`, `FieldControl` and `PasswordInputControl` are the native `<img>` and `<input>` their custom element looks for; the `…Items` parts, `ComboboxValue` and `Preferences` draw their children, as the element lists its `items` itself.

## What ships

| Import | Contents |
| --- | --- |
| `@open-intelligent-ui/web` | `mount`, `defineIntelligentUI`, `IntelligentUIElement`, `Chart`, `Icon`, `preloadIcons`, `formatValue`, `flush`, the registries `PRIMITIVES`, `PRESETS` and `PRESET_NAMES`, and the three functions below |
| `@open-intelligent-ui/web/define` | Registers `<intelligent-ui>` on import |
| `@open-intelligent-ui/web/ui-sdk` | `preloadUiSdk`, `isUiSdkComponent`, `uiSdkComponentNames` |
| `@open-intelligent-ui/web/styles.css` | One stylesheet in two cascade layers, `ui-sdk` and `iui`, confined to the renderer's root |

The layout primitives and the presets `Stat`, `Number`, `DataTable`, `CodeBlock` and `Skeleton` are tags a model writes in markup, not named exports.

UI SDK components and icons load on first use, one chunk per entry point or icon. Call `preloadUiSdk()` or `preloadUiSdk("Tabs", "Dialog")`, and `preloadIcons("arrow-up", "x")`, to load them ahead of time.

ESM only, for browsers. The files in `dist` import their dependencies by package name, so a bundler is the easy way to use them. A page without one needs an import map with an entry for every entry point of `@open-intelligent-ui/web`, `@open-intelligent-ui/core`, `@ui-sdk/web` and `@ui-sdk/core`, for `marked` and `yaml`, for the prefix `lucide/`, and for the two names `@ui-sdk/core` gives its own files, `#dev` and `#name-check`. Importing the package on a server does nothing and does not fail; there is no server rendering.

Tools, theming, state and the safety model are covered in the [integration guide](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/skills/intelligent-ui/references/integration.md).

## License

MIT. `styles.css` includes UI SDK's default styles, which are Apache-2.0; see `NOTICE`.
