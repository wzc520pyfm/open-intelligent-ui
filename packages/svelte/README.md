# @open-intelligent-ui/svelte

The Svelte renderer for [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui). A model writes Markdown mixed with tags; `<IntelligentUI>` turns that stream into a live interface with [UI SDK](https://ui-sdk.dev/docs) behaviors, a [DESIGN.md](https://github.com/google-labs-code/design.md) look and motion.

```bash
npm install @open-intelligent-ui/svelte @open-intelligent-ui/core @ui-sdk/svelte @ui-sdk/core
```

Svelte 5.33 or later. `@ui-sdk/svelte` and `@ui-sdk/core` are peer dependencies, so the renderer and your own code share one copy.

## Render a reply

```svelte
<script lang="ts">
  import { IntelligentUI } from "@open-intelligent-ui/svelte"
  import "@open-intelligent-ui/svelte/styles.css"

  let { text, streaming }: { text: string; streaming: boolean } = $props()

  function onAction(action) {
    if (action.type === "send") askModel(action.text, action.data, action.state)
  }
</script>

<IntelligentUI
  source={text}
  {streaming}
  design={designMarkdown}
  tools={{ listTickets, updateTicket }}
  {onAction}
/>
```

- `source` is the model's reply so far. Pass the growing text on every chunk with `streaming` set.
- `design` is a DESIGN.md file's text. Leave it out for the built-in design.
- `tools` are the functions markup reads with `<query>` and writes with `call()`.
- `onAction` receives what the reader decided, to send back to the model. Return `true` when you have handled an `open` or `copy` action yourself.

The markup, the props and the prompt are the same as for [`@open-intelligent-ui/react`](https://www.npmjs.com/package/@open-intelligent-ui/react). The prompt that teaches a model the markup comes from `buildSystemPrompt` in [`@open-intelligent-ui/core/prompt`](https://www.npmjs.com/package/@open-intelligent-ui/core).

## What differs from React

- `bind:this` on `<IntelligentUI>` is the handle: `getState()`, `setState()`, `reset()`, `refetch()` and `surface`.
- `components` takes Svelte components. Markup props arrive as props and `on:pick={...}` as the function prop `onPick`. An event of the DOM arrives in lower case, `on:click` as `onclick`, so a component that spreads the rest of its props onto its element listens for it.
- `bind:value={x}` gives a component `value` as a prop it can write, plus `onValueChange`. A component that declares `value = $bindable()` and one that calls `onValueChange` both work.
- `let:` reads what a component passes to its `children` snippet. `<ProgressValue let:progress>` gets the part's state.
- A UI SDK component draws the same elements as in React, with two differences that come from `@ui-sdk/svelte` itself: there can be a text node holding one space between the parts of a component, and a few elements that take no room sit elsewhere (the hidden input of a `Slider` or `NumberInput` follows the component's element instead of ending it, and a `Select` keeps its closed list in the page).
- The renderer draws its own toasts. `OverlayHost` from `@ui-sdk/svelte/overlays` is for the toasts and confirms your own code opens, and is yours to mount.

## What ships

| Import | Contents |
| --- | --- |
| `@open-intelligent-ui/svelte` | `IntelligentUI`, `Chart`, `Icon`, `preloadIcons`, `formatValue`, the registries `PRIMITIVES`, `PRESETS` and `PRESET_NAMES`, and the three functions below |
| `@open-intelligent-ui/svelte/ui-sdk` | `preloadUiSdk`, `isUiSdkComponent`, `uiSdkComponentNames` |
| `@open-intelligent-ui/svelte/styles.css` | One stylesheet in two cascade layers, `ui-sdk` and `iui`, confined to the renderer's root. It is the same file the React renderer ships |

The layout primitives and the presets `Stat`, `Number`, `DataTable`, `CodeBlock` and `Skeleton` are tags a model writes in markup, not named exports. Of the presets, only `Chart` can be imported on its own; the rest are reachable through `PRESETS`.

UI SDK components and icons load on first use, one chunk per entry point or icon. Call `preloadUiSdk()` or `preloadUiSdk("Tabs", "Dialog")`, and `preloadIcons("arrow-up", "x")`, to load them ahead of time.

The package ships `.svelte` files and the modules beside them, as Svelte libraries do, so it needs a bundler with the Svelte plugin: Vite with `@sveltejs/vite-plugin-svelte`, or SvelteKit. ESM only. `render` from `svelte/server` produces the surface's HTML, but hydrating that HTML has not been tested: in SvelteKit, draw it in the browser only.

Tools, theming, your own components, state and the safety model are covered in the [integration guide](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/skills/intelligent-ui/references/integration.md).

## License

MIT. `styles.css` includes UI SDK's default styles, which are Apache-2.0; see `NOTICE`.
