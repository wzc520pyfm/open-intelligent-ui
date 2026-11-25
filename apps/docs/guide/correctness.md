# Correct output

A model writes the interface, and a model makes mistakes. A product has to decide what happens then. This page covers what can go wrong, what is caught, and the loop that lets the model fix its own reply before a reader sees it.

## Three kinds of wrong

| Kind | Example | Caught by |
| --- | --- | --- |
| It can't be read | A tag never closed, an expression with a missing bracket, a reply cut off by the token limit | The parser, with a diagnostic and a position |
| It reads, but refers to what doesn't exist | A component from another library, a name nobody declared, a prop a component doesn't have, a tool the host lacks | The checker, before drawing; the renderer, while drawing |
| It draws, and says the wrong thing | A total that adds the wrong column, a button whose label doesn't match what it sends | Nothing automatic. Evals, review, and keeping consequential writes behind tools you control |

The first two are mechanical, and they are what this page is about. The third is the same problem as a wrong sentence in a text reply.

## The layers

No single check is enough, so there are several, each placed where it is cheapest.

| Layer | What it does |
| --- | --- |
| The prompt is written from definitions | `buildSystemPrompt({ library, tools })` describes the components, charts, motion and tools from the same objects the renderer uses. The model isn't told about anything that doesn't exist. Every example in the prompt is drawn by the test suite |
| The prompt names the common mistakes | A section lists what breaks a reply: tags inside braces, `setCount(…)`, other libraries' parts, props a tag doesn't have. A test makes sure the checker reports each example in it |
| The parser is tolerant | It never throws. It holds back a half-written tag while streaming, recovers from a stray closing tag, and reports each problem with a code and a position |
| Components are strict | A registered component receives only the props it declared, with values of the declared type. Anything else is dropped and reported |
| **The checker** | `checkMarkup` reads a finished reply the way the renderer would, without a browser, and returns every issue with a line and what to write instead |
| **The repair loop** | `repairMessage` turns the issues into the next message. The model fixes its own reply |
| The renderer contains failures | A block that fails to draw shows an error in its place, and the rest of the surface keeps working. Markup is interpreted, never run as code |

## Try it

The checker runs on what is in the box. Pick a sample or type.

<CheckDemo />

## The checker

```ts
import { checkMarkup } from "@open-intelligent-ui/core/check"

const result = checkMarkup(reply, {
  library,                       // what you gave the renderer and buildSystemPrompt
  tools: ["listTickets"],        // the tools the host answers, or their descriptions
})

result.ok        // true when nothing is an error
result.errors    // how many errors
result.warnings  // how many warnings
result.issues    // [{ code, severity, message, hint, line, column, excerpt }]
```

It needs no DOM, so it runs on a server, in an edge function or in a test. `library` can be the object or the JSON written by `librarySpec`.

An **error** means the reader gets something other than what was written: a part missing, a control that does nothing, text where an interface should be. A **warning** means something written is ignored.

| Code | Means |
| --- | --- |
| `unclosed-element`, `unclosed-tag` | An element or a tag is never closed. The reply was probably cut short |
| `stray-close`, `unknown-block` | A closing tag with nothing to close, or a block the language doesn't have, like `{#await}` |
| `bad-expression` | An expression that can't be read |
| `tags-in-expression` | Tags written inside `{…}`, the JSX way |
| `unknown-tag`, `blocked-tag` | A lowercase tag the language doesn't have, or one that is never let through, like `<script>` |
| `unknown-component` | A component nothing draws: not in the library, not a preset, not a UI SDK part, not defined in the reply |
| `misplaced-part` | A UI SDK part outside the component it belongs to |
| `unknown-prop`, `missing-prop`, `wrong-type`, `no-children` | A prop the component doesn't have, a required one left out, a value of the wrong kind, children given to a component that takes none |
| `unknown-name` | A name no `<state>`, `<derive>`, `<query>` or block declares |
| `unknown-function` | A call to a function or a method the language doesn't have |
| `bad-write` | A write to a computed value, or a write outside a handler |
| `bad-handler` | A handler or a binding that isn't written in braces, or binds something that can't be written to |
| `unknown-tool` | A tool the host doesn't have |
| `unknown-value` | An icon, a motion or a chart type that doesn't exist |
| `blocked-url` | An address the renderer refuses, like `javascript:` |
| `duplicate-name` | A name declared twice |
| `fenced`, `empty` | The interface is inside a code fence, or there is nothing to draw |

Tell the checker what your host adds, so it doesn't report those as unknown:

```ts
checkMarkup(reply, {
  library,
  tools,
  components: ["SeatMap"],          // given to the renderer's `components`
  state: ["user"],                  // given as `initialState`
  functions: ["fx"],                // given as `functions`
  actions: ["track"],               // given as `actions`
})
```

## The repair loop

When a reply has errors, send them back. `repairMessage` writes the message: each problem with its line, what to write instead, and a request for the whole interface again.

```ts
import { checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"

async function reply(messages: Message[]) {
  let text = await model(messages)
  let result = checkMarkup(text, { library, tools })
  for (let round = 0; !result.ok && round < 2; round++) {
    log.info("repair", { round, issues: result.issues.map((issue) => issue.code) })
    messages = [...messages, { role: "assistant", content: text }, { role: "user", content: repairMessage(result) }]
    text = await model(messages)
    result = checkMarkup(text, { library, tools })
  }
  // result.ok is about the reply being returned, so the caller knows whether the last attempt checked out.
  return { text, ok: result.ok, issues: result.issues }
}
```

```text
The interface you wrote can't be shown as written. A checker read it and found:

- Line 4: "setCount" is not a function: state changes by assigning to it. Write count = … instead of setCount(…).
  <Button onClick={() => setCount(count + 1)}>Add one</Button>
- Line 8: Tags can't be written inside {…}: write {#if test}…{/if} to show something when a test holds…
  {open && <card>Details</card>}

Write the whole interface again with these fixed. Keep everything else as it was: the same content, layout and names. Reply with the markup only, with no explanation and no code fence.
```

- **Two rounds is the usual limit.** A model that hasn't fixed a reply in two attempts rarely does in a third, and each round costs a full reply.
- **Don't keep the failed attempts.** Once a round succeeds, store only the final reply in the conversation.
- **If it still has errors**, draw it anyway (the renderer is tolerant, and the parts that are right work), or fall back to plain text. Either way, log the issues: they tell you what to add to `instructions`.
- **Warnings don't trigger a repair.** They are listed in the message only when there is room after the errors.

## While a reply streams

A reply can't be judged until it is complete: a name used on line 3 may be declared on line 9. So the renderer waits. While `streaming` is set it draws what it can and holds back warnings about names and components the stream hasn't declared yet. When the stream ends, anything still missing is reported.

That leaves two ways to combine streaming with checking:

| | How | The reader sees |
| --- | --- | --- |
| Stream, then repair | Draw the reply as it arrives. Check it when it ends. If it has errors, ask for a fix and replace the surface | The first draft, then the fixed one |
| Check, then show | Wait for the whole reply, run the loop, then draw | Only a checked reply, later |

The playground's live mode does the first, and says in the thread when it is fixing a reply. Choose the second where a wrong first draft is not acceptable.

## Warnings from the renderer

`onWarning` reports what the renderer notices while drawing: the same kinds of problem as the checker, found one at a time as each block is drawn or a control is pressed. Log them in production. In the playground they appear under Events.

If you see a warning there, it is one of two things:

- **A real mistake in the reply.** The Markup panel lists it with its line, and in live mode the model is asked to fix it.
- **A false alarm.** In 0.4.0 and earlier, a streamed reply could warn about a name it declared a few lines later. Since 0.5.0, forward references are held until the stream ends.

## In your tests

Three checks belong in CI. They run without a model.

```ts
import { validateLibrary } from "@open-intelligent-ui/core"
import { checkMarkup } from "@open-intelligent-ui/core/check"

// 1. The library is described completely, and its examples use it correctly.
test("the library", () => expect(validateLibrary(library)).toEqual([]))

// 2. Every example you show the model, in instructions or few-shot turns, checks out.
test.each(fewShotExamples)("example %#", (example) => {
  expect(checkMarkup(example, { library, tools }).issues).toEqual([])
})

// 3. Replies saved from real sessions still check out after you change the library or the prompt.
test.each(savedReplies)("saved reply %#", (reply) => {
  expect(checkMarkup(reply, { library, tools }).ok).toBe(true)
})
```

With a model in the loop, the same function gives you the numbers worth tracking: the share of replies that check out on the first attempt, and after one repair. Run a fixed set of prompts whenever the prompt, the library or the model changes.

## How other projects do it

| | Prompt | Validation | When it fails |
| --- | --- | --- | --- |
| [OpenUI](https://www.openui.com) | Generated from the component library's schemas | The parser validates each component against its schema and reports errors with codes. Errors are held until the stream ends | Errors are handed back to the model for another attempt |
| [A2UI](https://a2ui.org) | Generated from the catalog, with validated few-shot examples | A streaming healer repairs partial JSON, then the message is validated against the catalog | A structured error goes back to the agent, which retries a bounded number of times |
| Open Intelligent UI | Generated from the library, the design and the tools. Examples are drawn by tests | Parser diagnostics, strict props on registered components, and a checker that also follows names, writes, tools and part placement | `repairMessage` goes back to the model, twice at most. The renderer draws what is right in the meantime |

The pattern is the same in all three: generate the prompt from what exists, validate against it, feed errors back. What differs here is the surface to check. A catalog format validates a tree of known components against schemas. This markup also has expressions, state and handlers, so the checker follows names through scopes and tells reads from writes.

## What has been measured

- 32 replies written by one strong model against the default prompt: all drew without a warning. The checker found one latent mistake, a handler that assigned through a `<derive>`; that pattern is now supported.
- Every demo, every documented example and every recipe in the prompt checks clean and draws without a warning on all five renderers, streamed and whole.
- A set of typical mistakes (JSX habits, other libraries' tags, undeclared names, truncation) is reported in full, each with a fix.

What has not been measured: replies from smaller or cheaper models, and the pass rate after repair on a real workload. Measure both on your own prompts before relying on them.

## Limits

- The checker follows the default language. A prop of a UI SDK part isn't checked against a list, because the generated catalog doesn't hold every prop the parts accept.
- It can't know that data is wrong, that a label misleads, or that a layout is poor.
- A reply that checks out can still fail at run time: a tool can throw, a query can return a shape the markup didn't expect. The renderer reports those through `onWarning` and keeps the surface working.
