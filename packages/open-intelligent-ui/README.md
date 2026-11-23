# open-intelligent-ui

[Open Intelligent UI](https://github.com/wzc520pyfm/open-intelligent-ui) lets a model write an interface as Markdown mixed with tags, and renders that stream live: behaviors from [UI SDK](https://ui-sdk.dev/docs), look from a [DESIGN.md](https://github.com/google-labs-code/design.md), motion from design tokens.

This package is the project's unscoped name on npm. It re-exports [`@open-intelligent-ui/core`](https://www.npmjs.com/package/@open-intelligent-ui/core), the framework-free half, and nothing else:

| Import | Same as |
| --- | --- |
| `open-intelligent-ui` | `@open-intelligent-ui/core` |
| `open-intelligent-ui/prompt` | `@open-intelligent-ui/core/prompt` |

```ts
import { parseDesign } from "open-intelligent-ui"
import { buildSystemPrompt } from "open-intelligent-ui/prompt"

const system = buildSystemPrompt({ design: parseDesign(designMarkdown), tools: [] })
```

To put an interface on screen you need a renderer, which is a separate package:

```bash
npm install @open-intelligent-ui/react @open-intelligent-ui/core @ui-sdk/react @ui-sdk/core
```

Packages published under the `@open-intelligent-ui` scope and this one are the only official ones.

## License

MIT. The component catalog in `@open-intelligent-ui/core/prompt` is generated from UI SDK's documentation, which is Apache-2.0; see `NOTICE`.
