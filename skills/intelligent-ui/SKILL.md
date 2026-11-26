---
name: intelligent-ui
description: Writes or fixes IUI markup for Open Intelligent UI (calculators, comparisons, dashboards, forms, workbenches). Use when authoring `.iui`, editing playground demos, or teaching craft rules for markup. To wire a product (install renderer, system prompt, check/repair, tools), use the integrate skill instead.
---

# Intelligent UI

Open Intelligent UI lets a model answer with an interface. The model writes
**IUI markup**: Markdown, plus tags for layout, for UI SDK behaviors and for
state. A renderer shows it as it streams, themed by a DESIGN.md.

There is no fixed component library to pick from. The model gets behaviors
(a `Dialog` that traps focus, a `Slider` that works from the keyboard), a
design system (tokens and written guidance) and a state syntax, and composes
what the question needs, including components nobody defined in advance.

**Wiring a host app?** Use [`../integrate/SKILL.md`](../integrate/SKILL.md)
(and `npm create open-intelligent-ui`). This skill is for writing markup.

Pick the job in front of you:

| The job | Read |
| --- | --- |
| Write or fix an interface | [The steps below](#write-an-interface), then [references/language.md](references/language.md) |
| Look up a UI SDK component and its parts | [references/components.md](references/components.md) |
| Put the renderer in a product (prompt, stream, check, tools) | [`../integrate/SKILL.md`](../integrate/SKILL.md), then [references/integration.md](references/integration.md) |
| Make it move well | The `motion` skill next to this one |

## Write an interface

1. **Decide whether it should be an interface.** A short factual answer is
   Markdown. Reach for tags when the reader would otherwise compare,
   calculate, choose, track or edit.
2. **Find the assumptions.** Whatever the answer depends on (an amount, a
   date range, a priority) becomes `<state>` with a control. What follows
   from it becomes `<derive>`. Don't write three scenarios in prose; write
   one slider.
3. **Put the answer first.** State, then the number or recommendation, then
   the controls beside what they change, then detail.
4. **Compose behaviors, don't imitate them.** Tabs, dialogs, menus, selects
   and sliders come from UI SDK and already handle focus and keyboard. Build
   the visual parts yourself from `<box>`, `<row>`, `<grid>`, `<card>`, CSS
   and SVG.
5. **Name a thing once you repeat it.** A card you write three times becomes
   a `<define>`.
6. **Hand the decision back.** When the reader's choice needs the agent,
   call `send()` with a sentence that says what they chose.
7. **Check it.** Render it and read the warnings. See [Checking](#checking).

A complete interface, small enough to read in one go:

```iui
<state people={4} bill={86} tip={18} />
<derive total={bill * (1 + tip / 100)} each={total / people} />

<card padding={4} gap={4}>
  <row align="end">
    <box gap={0}>
      <text size="sm" color="muted">Each person pays</text>
      <text size="4xl" weight="bold" tabular><Number value={each} format="currency" digits={2} /></text>
    </box>
    <spacer />
    <text size="sm" color="muted">{currency(total, "USD", 2)} with tip</text>
  </row>

  <grid columns={2} gap={4}>
    <Field name="bill">
      <FieldLabel>Bill</FieldLabel>
      <NumberInput min={0} step={1} bind:value={bill}>
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Lower the bill" />
          <NumberInputControl />
          <NumberInputIncrement aria-label="Raise the bill" />
        </NumberInputGroup>
      </NumberInput>
    </Field>
    <Field name="people">
      <FieldLabel>People</FieldLabel>
      <NumberInput min={1} max={30} bind:value={people}>
        <NumberInputGroup>
          <NumberInputDecrement aria-label="Fewer people" />
          <NumberInputControl />
          <NumberInputIncrement aria-label="More people" />
        </NumberInputGroup>
      </NumberInput>
    </Field>
  </grid>

  <SegmentedControl aria-label="Tip" bind:value={tip}>
    <SegmentedControlIndicator />
    {#each [0, 15, 18, 20, 25] as option (option)}
      <SegmentedControlItem value={option}>{option}%</SegmentedControlItem>
    {/each}
  </SegmentedControl>

  <Button variant="solid" on:click={send("Request " + currency(each, "USD", 2) + " from each person", { people, total })}>
    Request the money
  </Button>
</card>
```

What that shows: state declared once, a derived answer that leads, UI SDK
parts nested the way their docs nest them, `bind:` instead of handlers, a
loop, formatting helpers, and `send()` to give the turn back to the agent.

## The language in one screen

| Write | To |
| --- | --- |
| `<state name={value} />` | Remember something. Add `persist` to keep it between visits. |
| `<derive name={expression} />` | Compute from state. Recomputed when what it reads changes. |
| `<query id="tasks" tool="listTasks" input={{ status }} />` | Read from a tool. `tasks.data`, `tasks.loading`, `tasks.error`. Reloads when its input changes. |
| `{expression}` | Print a value. JavaScript expressions, with helpers such as `sumBy`, `currency`, `percent`, `date`. |
| `bind:value={name}` | Connect a control to state, both ways. Also `bind:checked`, `bind:open`, `bind:pressed`, `bind:page`. |
| `on:click={count += 1; toast("Added")}` | Run statements on an event. |
| `{#if a} … {:else if b} … {:else} … {/if}` | Show one of several things. |
| `{#each items as item, i (item.id)} … {:else} … {/each}` | Repeat. Writing to `item` writes to state. |
| `class:active={cond}`, `style:width="{pct}%"` | Toggle a class, set one style. |
| `<style> .bar { … } </style>` | CSS for this interface only. Use the design's variables. |
| `<define name="PlanCard" props="plan">…<slot />…</define>` | Make a component, then use `<PlanCard plan={p} />`. |
| `send`, `call`, `refetch`, `reset`, `toast`, `copy`, `open` | Actions available in handlers. |

[references/language.md](references/language.md) has every rule, the
primitives and their props, the preset widgets (`Chart`, `Stat`, `Number`,
`DataTable`, `CodeBlock`, `Skeleton`) and the craft rules.

## Mistakes that cost the most

| Mistake | What happens | Instead |
| --- | --- | --- |
| A part outside its parent, such as `<TabsTab>` without `<Tabs>` | That block fails and shows an error | Nest parts as in [references/components.md](references/components.md) |
| Wrapping the reply in a code fence | It shows as code | Write the markup directly |
| `onclick="…"`, `<script>`, `<iframe>`, imports | Dropped | `on:click={…}` with the built-in actions |
| Assigning to a `<derive>` value | A warning, nothing changes | Assign to the state it is computed from |
| A literal `{` in prose | Read as an expression | Write `\{` |
| `on:click` on a component callback, or `on:valueChange` on HTML | Never fires | DOM names on HTML (`on:click`, `on:keydown`); callback names without `on` on components (`on:valueChange`) |
| A new card for every sentence, or cards inside cards | Noise | One idea per card; group a control with what it changes |
| Hard-coded colors and pixel spacing | Ignores the design, breaks in dark mode | Color names and spacing tokens from the design |
| Emoji as icons | Inconsistent and unlabelled | `<icon name="…" />` (Lucide names) |
| Everything in state as text | Nothing can be computed | Numbers as numbers, lists as lists, then `<derive>` |

## Checking

Never hand over markup you haven't rendered.

- **In this repository:** `pnpm dev`, open the playground, press Inspect and
  paste the markup into the Markup tab. Problems show in the Events tab.
  Check it at Phone width and in dark mode.
- **In a test:** render `<IntelligentUI source={markup} onWarning={…} />`
  with `@testing-library/react`, then assert there is no `.iui-error`
  element and no warning. `packages/react/test/guide.test.tsx` does this
  for every example in the system prompt.
- **While streaming:** cut the markup at arbitrary points and render each
  prefix with `streaming`. Nothing should throw, and what is on screen
  should make sense. `apps/playground/test/demos.test.tsx` does this.

A block that fails renders an error in place and the rest still shows, so
one mistake never costs the whole answer. It still counts as a failure.
