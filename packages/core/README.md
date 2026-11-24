# @open-intelligent-ui/core

The framework-free half of [Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui): the parser for IUI markup, the expression language, the state store behind a surface, the DESIGN.md reader and the system prompt builder.

Use it on the server to build the prompt that teaches a model the markup, and with a renderer to draw what comes back: [`@open-intelligent-ui/react`](https://www.npmjs.com/package/@open-intelligent-ui/react), [`/vue`](https://www.npmjs.com/package/@open-intelligent-ui/vue), [`/svelte`](https://www.npmjs.com/package/@open-intelligent-ui/svelte), [`/solid`](https://www.npmjs.com/package/@open-intelligent-ui/solid), or [`/web`](https://www.npmjs.com/package/@open-intelligent-ui/web) for a page with no framework.

```bash
npm install @open-intelligent-ui/core
```

## Build the system prompt

```ts
import { parseDesign } from "@open-intelligent-ui/core"
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"

const design = parseDesign(designMarkdown) // a DESIGN.md file's text
const system = buildSystemPrompt({
  design,
  tools: [{ name: "listTickets", description: "Open support tickets", input: "{ status?: string }" }],
})
```

`@open-intelligent-ui/core/prompt` carries the language guide and the UI SDK component catalog, about 290 kB of text. Import it where you call the model, not in the browser bundle.

## Read markup yourself

```ts
import { parse } from "@open-intelligent-ui/core"

const doc = parse(replySoFar, { streaming: true })
doc.diagnostics // problems in the markup, with positions
```

`parse` accepts a reply that is still arriving and holds back a half-written tag. `Surface` is the state store a renderer drives: state, derived values, queries, actions.

## What is in it

| Export | What it does |
| --- | --- |
| `parse` | IUI markup to a tree, tolerant of a stream cut anywhere |
| `evaluate`, `run` | The expression language. An interpreter, never `eval` |
| `Surface` | State, `<derive>`, `<query>`, actions |
| `parseDesign`, `designFromCss`, `designToCss` | DESIGN.md tokens to CSS variables. Reads a design written for another library from the CSS variables it documents, or from a theme stylesheet |
| `defineComponent`, `defineWidget`, `defineLibrary` | What a product registers: its components with their props, events and examples, its design and its engines, in one object for the renderer and the prompt |
| `librarySpec`, `validateLibrary` | A library as JSON, for a server that builds the prompt; what is wrong with a library, for a test |
| `buildSystemPrompt` (from `/prompt`) | The prompt: language, components, design, your tools, and what your library adds |
| `/charts` | `echartsCharts`, `g2Charts`: draw `<Chart>` with ECharts or AntV G2. The type `ChartEngine`, for another charting library |
| `/motion` | `motionAdapter`, `gsapAdapter`, `waapiAdapter`, `createMotionAdapter`: play motion with Motion, GSAP, the Web Animations API, or an engine of your own |
| `/renderer`, `/styles.css` | What the renderers are built from: directives, primitives, presets, charts, and the stylesheet. For writing a renderer, not for apps; it changes with the renderers |

The adapters never import an engine: you install it and pass it in. Everything a product can replace or register is in [`docs/extending.md`](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/docs/extending.md).

ESM only. The language is specified in [`docs/spec.md`](https://github.com/wzc520pyfm/open-intelligent-ui/blob/main/docs/spec.md).

## License

MIT. The component catalog inside `/prompt` is generated from UI SDK's documentation and `styles.css` includes UI SDK's default styles; both are Apache-2.0, see `NOTICE`.
