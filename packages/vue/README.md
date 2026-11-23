# @open-intelligent-ui/vue

The Vue renderer for [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui). A model writes Markdown mixed with tags; `<IntelligentUI>` turns that stream into a live interface with [UI SDK](https://ui-sdk.dev/docs) behaviors, a [DESIGN.md](https://github.com/google-labs-code/design.md) look and motion.

```bash
npm install @open-intelligent-ui/vue @open-intelligent-ui/core @ui-sdk/vue @ui-sdk/core
```

Vue 3.5 or later. `@ui-sdk/vue` and `@ui-sdk/core` are peer dependencies, so the renderer and your own code share one copy.

## Render a reply

```vue
<script setup lang="ts">
import { IntelligentUI } from "@open-intelligent-ui/vue"
import "@open-intelligent-ui/vue/styles.css"

defineProps<{ text: string; streaming: boolean }>()

function onAction(action) {
  if (action.type === "send") askModel(action.text, action.data, action.state)
}
</script>

<template>
  <IntelligentUI
    :source="text"
    :streaming="streaming"
    :design="designMarkdown"
    :tools="{ listTickets, updateTicket }"
    :on-action="onAction"
  />
</template>
```

- `source` is the model's reply so far. Pass the growing text on every chunk with `streaming` set.
- `design` is a DESIGN.md file's text. Leave it out for the built-in design.
- `tools` are the functions markup reads with `<query>` and writes with `call()`.
- `onAction` receives what the reader decided, to send back to the model. It is a prop, not an emitted event, because what it returns matters: return `true` when you have handled an `open` or `copy` action yourself.

The markup, the props and the prompt are the same as for [`@open-intelligent-ui/react`](https://www.npmjs.com/package/@open-intelligent-ui/react); one reply renders to the same DOM in both. The prompt that teaches a model the markup comes from `buildSystemPrompt` in [`@open-intelligent-ui/core/prompt`](https://www.npmjs.com/package/@open-intelligent-ui/core).

## What differs from React

- A template ref on `<IntelligentUI>` is the handle: `getState()`, `setState()`, `reset()`, `refetch()`.
- `components` takes Vue components. Markup props arrive as props, `on:pick={...}` as the listener for `pick`, and `bind:value={x}` as `value` plus `onUpdate:value`, so a component that works with `v-model:value` works with `bind:value`.
- `let:` reads the props a component passes to its default slot. `<ProgressValue let:progress>` gets the slot's `state`; `<CalendarWeeks let:cell>` gets its `cell`.

## What ships

| Import | Contents |
| --- | --- |
| `@open-intelligent-ui/vue` | `IntelligentUI`, `Chart`, `Icon`, `preloadIcons`, `formatValue`, the registries `PRIMITIVES`, `PRESETS` and `PRESET_NAMES`, and the three functions below |
| `@open-intelligent-ui/vue/ui-sdk` | `preloadUiSdk`, `isUiSdkComponent`, `uiSdkComponentNames` |
| `@open-intelligent-ui/vue/styles.css` | One stylesheet in two cascade layers, `ui-sdk` and `iui`, confined to the renderer's root. It is the same file the React renderer ships |

The layout primitives and the presets `Stat`, `Number`, `DataTable`, `CodeBlock` and `Skeleton` are tags a model writes in markup, not named exports. Of the presets, only `Chart` can be imported on its own; the rest are reachable through `PRESETS`.

UI SDK components and icons load on first use, one chunk per entry point or icon. Call `preloadUiSdk()` or `preloadUiSdk("Tabs", "Dialog")`, and `preloadIcons("arrow-up", "x")`, to load them ahead of time.

ESM only. `renderToString` produces the surface's HTML on a server, but hydrating that HTML has not been tested: in Nuxt, wrap it in `<ClientOnly>`.

Tools, theming, your own components, state and the safety model are covered in the [integration guide](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/skills/intelligent-ui/references/integration.md).

## License

MIT. `styles.css` includes UI SDK's default styles, which are Apache-2.0; see `NOTICE`.
