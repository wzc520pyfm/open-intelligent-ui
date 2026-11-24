# @open-intelligent-ui/solid

The Solid renderer for [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui). A model writes Markdown mixed with tags; `<IntelligentUI>` turns that stream into a live interface with [UI SDK](https://ui-sdk.dev/docs) behaviors, a [DESIGN.md](https://github.com/google-labs-code/design.md) look and motion.

```bash
npm install @open-intelligent-ui/solid @open-intelligent-ui/core @ui-sdk/solid @ui-sdk/core solid-js @solidjs/web
```

Solid 2: `solid-js` and `@solidjs/web` 2.0 or later. They, `@ui-sdk/solid` and `@ui-sdk/core` are peer dependencies, so the renderer and your own code share one copy.

## Render a reply

```tsx
import { IntelligentUI } from "@open-intelligent-ui/solid"
import "@open-intelligent-ui/solid/styles.css"

function Reply(props: { text: string; streaming: boolean }) {
  return (
    <IntelligentUI
      source={props.text}
      streaming={props.streaming}
      design={designMarkdown}
      tools={{ listTickets, updateTicket }}
      onAction={(action) => {
        if (action.type === "send") askModel(action.text, action.data, action.state)
      }}
    />
  )
}
```

- `source` is the model's reply so far. Pass the growing text on every chunk with `streaming` set.
- `design` is a DESIGN.md file's text. Leave it out for the built-in design.
- `tools` are the functions markup reads with `<query>` and writes with `call()`.
- `library` is what your product adds, made with `defineLibrary`: its own components, its design, and the engines that draw charts and play motion. Give the same object to `buildSystemPrompt`.
- `onAction` receives what the reader decided, to send back to the model. Return `true` when you have handled an `open` or `copy` action yourself.

The markup, the props and the prompt are the same as for [`@open-intelligent-ui/react`](https://www.npmjs.com/package/@open-intelligent-ui/react); one reply renders to the same DOM in both. The prompt that teaches a model the markup comes from `buildSystemPrompt` in [`@open-intelligent-ui/core/prompt`](https://www.npmjs.com/package/@open-intelligent-ui/core).

What is on screen is patched in place when state changes or the source grows: an element is made once, so focus, typed text, scroll position and a component's own state stay where they are.

## What differs from React

- `ref` is called with the handle: `getState()`, `setState()`, `reset()`, `refetch()`. `class` and `style` land on the surface's root element.
- `components` takes Solid components. Markup props arrive as props, `on:pick={...}` as `onPick`, and `bind:value={x}` as `value` plus `onValueChange`. A component runs once and its props change under it, as with any Solid component, so read them where Solid tracks: in JSX, a memo or an effect.
- `let:` reads what a component passes to a function child, in order. `<ProgressValue let:progress>` gets the part's state; `<CalendarWeeks let:cell>` gets its `cell`.
- Markup can't give a component `ref`, `children` as a prop, `innerHTML`, `textContent`, `innerText`, any name with a colon such as `prop:value`, or text under an `on…` name. A component that spreads its props onto an element would otherwise hand markup the DOM.

## What ships

| Import | Contents |
| --- | --- |
| `@open-intelligent-ui/solid` | `IntelligentUI`, `Chart`, `Icon`, `preloadIcons`, `formatValue`, the registries `PRIMITIVES`, `PRESETS` and `PRESET_NAMES`, and the three functions below |
| `@open-intelligent-ui/solid/ui-sdk` | `preloadUiSdk`, `isUiSdkComponent`, `uiSdkComponentNames` |
| `@open-intelligent-ui/solid/styles.css` | One stylesheet in two cascade layers, `ui-sdk` and `iui`, confined to the renderer's root. It is the same file the React renderer ships |

The layout primitives and the presets `Stat`, `Number`, `DataTable`, `CodeBlock` and `Skeleton` are tags a model writes in markup, not named exports. Of the presets, only `Chart` can be imported on its own; the rest are reachable through `PRESETS`.

UI SDK components and icons load on first use, one chunk per entry point or icon. Call `preloadUiSdk()` or `preloadUiSdk("Tabs", "Dialog")`, and `preloadIcons("arrow-up", "x")`, to load them ahead of time.

The package is plain JavaScript with no JSX in it, so it needs no Solid compiler of its own; your app's usual setup, `@solidjs/vite-plugin` with Vite, is enough. ESM only, and for the browser only: on a server `<IntelligentUI>` renders nothing, so in SolidStart load it with `clientOnly`.

Tools, theming, your own components, state and the safety model are covered in the [integration guide](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/skills/intelligent-ui/references/integration.md). Registering components and widgets, and replacing the design, the chart engine and the motion engine: [`docs/extending.md`](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/docs/extending.md).

## License

MIT. `styles.css` includes UI SDK's default styles, which are Apache-2.0; see `NOTICE`.
