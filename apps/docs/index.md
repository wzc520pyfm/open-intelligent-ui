---
layout: home
title: Open Intelligent UI
titleTemplate: Let the model write the interface

hero:
  name: Open Intelligent UI
  text: Let the model write the interface
  tagline: A model writes Markdown mixed with tags. The renderer turns that stream into a live surface with state, data and motion. Behaviors come from UI SDK, the look from your DESIGN.md.
  actions:
    - theme: brand
      text: Get started
      link: /guide/start
    - theme: alt
      text: The markup
      link: /guide/markup
    - theme: alt
      text: GitHub
      link: https://github.com/wzc520pyfm/open-intelligent-ui

features:
  - title: Authored, not picked from a catalog
    details: The model composes layout primitives, 55 UI SDK behaviors, charts, inline SVG and scoped CSS. What it can build is not limited to the components someone registered.
    link: /guide/markup
  - title: Your design system
    details: Pass a DESIGN.md, yours or one written for another library. Its tokens become CSS variables and its guidance goes into the prompt. Four designs come with the package.
    link: /guide/design
  - title: Your components, charts and motion
    details: Register components with declared props, draw charts with ECharts, G2 or Recharts, play motion with Motion or GSAP. The prompt is written from the same definitions the renderer uses.
    link: /guide/components
  - title: Checked before it is shown
    details: A checker reads a reply the way the renderer would and names each mistake by line. Its message goes back to the model, which fixes its own reply.
    link: /guide/correctness
  - title: State and data without a model call
    details: The markup declares state, reads your tools with a query and writes with a call. Dragging a slider or saving a row doesn't cost a turn.
    link: /guide/data
  - title: Five renderers, one markup
    details: React, Vue, Svelte, Solid and Web Components draw the same reply. Markup is interpreted as data and never run as code.
    link: /guide/start
---

## A reply, drawn

This is what a model writes, and what a reader gets. Drag the slider, switch the design, or stream it again to watch it arrive.

```iui live designs
<state saved={1800} goal={12000} monthly={400} />
<derive
  months={ceil(max(goal - saved, 0) / monthly)}
  share={min((saved + monthly * 12) / goal, 1)}
/>

**You reach {currency(goal)} in {months} months.** A year from now you would be {percent(share)} of the way.

<card padding={4}>
  <row gap={4} wrap>
    <svg viewBox="0 0 80 80" width="96" role="img" aria-label="{percent(share)} of the goal after a year">
      <circle cx="40" cy="40" r="32" fill="none" stroke="var(--iui-color-muted)" stroke-width="8" />
      <circle class="ring" cx="40" cy="40" r="32" fill="none" stroke="var(--iui-color-accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="{share * 201} 201" transform="rotate(-90 40 40)" />
      <text x="40" y="45" text-anchor="middle" font-size="14" font-weight="600" fill="var(--iui-color-foreground)">{percent(share)}</text>
    </svg>
    <box flex={1} minWidth={220} gap={3}>
      <Slider min={50} max={1500} step={50} bind:value={monthly}>
        <row><text size="sm" color="muted">Set aside each month</text><spacer /><text size="sm" weight="medium" tabular>{currency(monthly)}</text></row>
        <SliderControl><SliderTrack><SliderIndicator /><SliderThumb aria-label="Monthly amount" /></SliderTrack></SliderControl>
      </Slider>
      <Button variant="solid" on:click={send("Set up a monthly transfer of " + currency(monthly), { monthly, months })}>Start saving {currency(monthly)} a month</Button>
    </box>
  </row>
</card>

<style>
  .ring { transition: stroke-dasharray var(--iui-motion-layout-duration) var(--iui-motion-layout-easing); }
</style>
```

- `<state>` and `<derive>` are what the interface remembers and what it computes from that.
- `<Slider>` is a UI SDK behavior. `bind:value` connects it to state, so dragging updates the sentence, the ring and the button without a model call.
- The ring is not a component. It is SVG the model drew, colored and timed with the design's tokens.
- `send()` hands the reader's decision back to the model, with the numbers they chose.
