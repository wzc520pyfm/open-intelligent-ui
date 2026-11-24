# @open-intelligent-ui/react

The React renderer for [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui). A model writes Markdown mixed with tags; `<IntelligentUI>` turns that stream into a live interface with [UI SDK](https://ui-sdk.dev/docs) behaviors, a [DESIGN.md](https://github.com/google-labs-code/design.md) look and motion.

```bash
npm install @open-intelligent-ui/react @open-intelligent-ui/core @ui-sdk/react @ui-sdk/core
```

React 19 or later. `@ui-sdk/react` and `@ui-sdk/core` are peer dependencies, so the renderer and your own code share one copy.

## Render a reply

```tsx
import { IntelligentUI } from "@open-intelligent-ui/react"
import "@open-intelligent-ui/react/styles.css"

function Reply({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <IntelligentUI
      source={text}
      streaming={streaming}
      design={designMarkdown}
      tools={{ listTickets, updateTicket }}
      onAction={(action) => {
        if (action.type === "send") askModel(action.text, action.data, action.state)
        return undefined
      }}
    />
  )
}
```

- `source` is the model's reply so far. Pass the growing text on every chunk with `streaming` set.
- `design` is a DESIGN.md file's text. Leave it out for the built-in design.
- `tools` are the functions markup reads with `<query>` and writes with `call()`.
- `library` is what your product adds, made with `defineLibrary`: its own components, its design, and the engines that draw charts and play motion. Give the same object to `buildSystemPrompt`.
- `onAction` receives what the reader decided, to send back to the model.

The same markup renders in Vue, Svelte and Solid and on a page with no framework, with [`@open-intelligent-ui/vue`](https://www.npmjs.com/package/@open-intelligent-ui/vue), [`/svelte`](https://www.npmjs.com/package/@open-intelligent-ui/svelte), [`/solid`](https://www.npmjs.com/package/@open-intelligent-ui/solid) and [`/web`](https://www.npmjs.com/package/@open-intelligent-ui/web). The prompt that teaches a model the markup comes from `buildSystemPrompt` in [`@open-intelligent-ui/core/prompt`](https://www.npmjs.com/package/@open-intelligent-ui/core).

## What ships

| Import | Contents |
| --- | --- |
| `@open-intelligent-ui/react` | `IntelligentUI`, `Chart`, `Icon`, `formatValue`, the registries `PRIMITIVES`, `PRESETS` and `PRESET_NAMES`, and the three functions below |
| `@open-intelligent-ui/react/recharts` | `rechartsCharts`, which draws `<Chart>` with Recharts: `defineLibrary({ charts: rechartsCharts(Recharts) })` |
| `@open-intelligent-ui/react/ui-sdk` | `preloadUiSdk`, `isUiSdkComponent`, `uiSdkComponentNames` |
| `@open-intelligent-ui/react/styles.css` | One stylesheet in two cascade layers, `ui-sdk` and `iui`, confined to the renderer's root |

The layout primitives and the presets `Stat`, `Number`, `DataTable`, `CodeBlock` and `Skeleton` are tags a model writes in markup, not named exports. Of the presets, only `Chart` can be imported on its own; the rest are reachable through `PRESETS`.

UI SDK components load on first use, one chunk per entry point. Call `preloadUiSdk()` or `preloadUiSdk("Tabs", "Dialog")` to load them ahead of time.

ESM only. The entry is marked `"use client"`, so a Next.js server component can render `<IntelligentUI>` directly; `tools` and `onAction` are functions and must come from a client component.

Tools, theming, your own components, state and the safety model are covered in the [integration guide](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/skills/intelligent-ui/references/integration.md). Registering components and widgets, and replacing the design, the chart engine and the motion engine: [`docs/extending.md`](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/docs/extending.md).

## License

MIT. `styles.css` includes UI SDK's default styles, which are Apache-2.0; see `NOTICE`.
