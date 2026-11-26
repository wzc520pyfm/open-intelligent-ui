---
name: integrate-open-intelligent-ui
description: Wires Open Intelligent UI into a product so a chat model can answer with operable interfaces. Use when adding `<IntelligentUI>` or `mount()`, building `buildSystemPrompt`, streaming replies, running `checkMarkup` / `repairMessage`, connecting tools and `onAction`, scaffolding with `npm create open-intelligent-ui`, or choosing which package/skill an agent should load.
---

# Integrate Open Intelligent UI

You are wiring a **product** to Open Intelligent UI. Another model (the
author) will write IUI markup in chat replies. You install the renderer,
build the system prompt, stream and check replies, and connect tools.

Do **not** load the full author system prompt into your own context. That
prompt is for the chat model. You need this skill and, when writing markup
yourself for demos or fixtures, `skills/intelligent-ui/SKILL.md`.

## Decide the path

| Goal | Do this |
| --- | --- |
| New demo app | `npm create open-intelligent-ui@latest <dir>` then `npm install && npm run dev` |
| Existing React 19 app | Install packages below; copy the loop from [Minimal product loop](#minimal-product-loop) |
| Vue / Svelte / Solid / no framework | Same loop; swap the renderer package (see table) |
| Only author markup | Stop; use `skills/intelligent-ui` instead |

Machine index of the project: repository root [`llms.txt`](../../llms.txt).
Human docs: https://open-intelligent-ui.pages.dev/docs/guide/start

## Install

```bash
# React (default scaffold)
npm install @open-intelligent-ui/react @open-intelligent-ui/core @ui-sdk/react @ui-sdk/core

# Or: vue | svelte | solid | web — each needs matching @ui-sdk/*
```

| Renderer | Peers |
| --- | --- |
| `@open-intelligent-ui/react` | React 19+, `@ui-sdk/react`, `@ui-sdk/core` |
| `@open-intelligent-ui/vue` | Vue 3.5+, `@ui-sdk/vue`, `@ui-sdk/core` |
| `@open-intelligent-ui/svelte` | Svelte 5.33+, `@ui-sdk/svelte`, `@ui-sdk/core` |
| `@open-intelligent-ui/solid` | Solid 2, `@ui-sdk/solid`, `@ui-sdk/core` |
| `@open-intelligent-ui/web` | `@ui-sdk/web`, `@ui-sdk/core` — `<intelligent-ui>` or `mount()` |

Import styles from the renderer (`@open-intelligent-ui/react/styles.css`).
Import `@open-intelligent-ui/core/prompt` and `/check` on the **server** (or
a Vite path that is not the main client bundle): the prompt catalog is large.

## Minimal product loop

```ts
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"

const tools = [
  {
    name: "listTickets",
    kind: "read" as const,
    description: "Tickets in the support queue.",
    input: { status: "open | pending | solved | all" },
    output: "[{ id, title, status }]",
  },
]

const system = buildSystemPrompt({
  instructions: "You are the product assistant. Answer with IUI when the reader should operate something.",
  tools,
})

async function complete(messages: { role: string; content: string }[]) {
  let reply = await callModel([{ role: "system", content: system }, ...messages])
  reply = unwrapFence(reply)
  let result = checkMarkup(reply, { tools: tools.map((t) => t.name) })
  for (let round = 0; !result.ok && round < 2; round++) {
    messages = [
      ...messages,
      { role: "assistant", content: reply },
      { role: "user", content: repairMessage(result) },
    ]
    reply = unwrapFence(await callModel([{ role: "system", content: system }, ...messages]))
    result = checkMarkup(reply, { tools: tools.map((t) => t.name) })
  }
  return { reply, ok: result.ok, issues: result.issues }
}

function unwrapFence(text: string) {
  const open = /^\s*```[a-z]*\n/i.exec(text)
  if (!open) return text
  return text.slice(open[0].length).replace(/\n```\s*$/, "")
}
```

```tsx
import { IntelligentUI } from "@open-intelligent-ui/react"
import "@open-intelligent-ui/react/styles.css"

<IntelligentUI
  source={replySoFar}
  streaming={streaming}
  tools={{ listTickets: (input) => api.listTickets(input) }}
  onAction={(action) => {
    if (action.type === "send") {
      askModelAgain(action.text, action.data, action.state)
    }
    return undefined
  }}
  onWarning={(message) => console.warn(message)}
/>
```

Checklist for a correct integration:

- [ ] One `<IntelligentUI>` (or mount) **per assistant turn**
- [ ] `streaming` true while chunks arrive; strip fences before render
- [ ] Same `library` / tool names in `buildSystemPrompt`, `checkMarkup`, and the renderer
- [ ] `onAction` handles `send` (hand the turn back)
- [ ] `onWarning` logged in production
- [ ] Destructive writes only through tools you authorize on the server

## Scaffold

```bash
npm create open-intelligent-ui@latest my-app
# options: --template react-vite (default), --name <pkg-name>
cd my-app && npm install && npm run dev
```

The scaffold includes a demo reply (no API key) and a Live path that uses
`VITE_OPENAI_API_KEY` / `VITE_OPENAI_BASE_URL` / `VITE_OPENAI_MODEL` when set.
It already wires `checkMarkup` + `repairMessage`.

## Dual roles again

| Agent | Reads | Writes |
| --- | --- | --- |
| You (integrator) | This skill, `llms.txt`, start + correctness docs | Host app code |
| Chat model (author) | `buildSystemPrompt(...)` output | IUI markup in the assistant message |

If you must author sample markup, follow `skills/intelligent-ui` and render
it with `onWarning` until Events is clean.

## More detail

- Full host guide (hand-written): [`../intelligent-ui/references/integration.md`](../intelligent-ui/references/integration.md)
- Correctness / repair: https://open-intelligent-ui.pages.dev/docs/guide/correctness
- Extending library / charts / motion: `docs/extending.md` in the repo
