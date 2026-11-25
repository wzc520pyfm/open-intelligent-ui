# Motion

Motion explains what changed. The renderer decides which element moves and when: as a block arrives in the stream, when a panel is shown or hidden, when state moves an element from one place to another. The design decides how long and with which easing. What plays the animation can be replaced.

## Built in

Without configuration, motion is CSS. Blocks fade and rise in as they are written, UI SDK popups and tabs animate, charts grow in, and `<Number>` and `<Stat>` count to new values. Markup adds motion with five attributes.

| Attribute | Does |
| --- | --- |
| `motion="…"` | How an element enters: `fade`, `rise`, `drop`, `scale`, `slide-left`, `slide-right`, `blur`, `pop`. `none` turns the default off |
| `motion="draw"` | Draws the stroke of an SVG `<path>`, `<line>` or `<circle>` |
| `motion="pulse\|spin\|float"` | Loops, for live status only |
| `stagger` | On a parent, brings its children in one after another. `stagger={80}` sets the pause in milliseconds |
| `show={condition}` | Enters when the condition turns true and leaves, animated, when it turns false |
| `morph="name"` | A shared identity: the element glides between two places when state moves it |
| `delay={120}` | Waits, in milliseconds |

```iui live
<state view="stats" order={["Design", "Build", "Ship"]} />

<row gap={2} wrap>
  <SegmentedControl aria-label="View" bind:value={view}>
    <SegmentedControlIndicator />
    <SegmentedControlItem value="stats">Stagger</SegmentedControlItem>
    <SegmentedControlItem value="panel">Show and hide</SegmentedControlItem>
    <SegmentedControlItem value="morph">Morph</SegmentedControlItem>
  </SegmentedControl>
</row>

<grid columns={3} gap={3} stagger show={view == "stats"}>
  <Stat label="Visitors" value={18420} delta={0.08} />
  <Stat label="Sign-ups" value={612} delta={0.21} />
  <Stat label="Paid" value={87} delta={-0.04} />
</grid>

<card padding={4} gap={2} show={view == "panel"} motion="blur">
  <row gap={2}><icon name="circle-check" color="success" /><text weight="medium" motion="pop">Deployed in 42 seconds</text></row>
  <svg viewBox="0 0 200 40" height="40" role="img" aria-label="Build time trend">
    <path motion="draw" d="M4 30 C40 8, 70 34, 100 20 S160 6, 196 14" fill="none" stroke="var(--iui-color-accent)" stroke-width="2.5" stroke-linecap="round" />
  </svg>
</card>

<box gap={2} show={view == "morph"}>
  <row gap={2} wrap>
    {#each order as step (step)}
      <card padding={3} morph="step-{step}"><text weight="medium">{step}</text></card>
    {/each}
  </row>
  <row><Button on:click={order = order.toReversed()}>Reverse the order</Button></row>
</box>
```

Durations and easings come from the design's `motion` tokens: `state-change`, `surface-enter`, `surface-exit`, `layout` and `emphasis`. CSS the model writes uses the same tokens, as `var(--iui-motion-layout-duration)` and `var(--iui-motion-layout-easing)`. `prefers-reduced-motion` is honored without the model or the host doing anything. Without an adapter, `morph` uses View Transitions; a browser without them swaps the elements in place.

## Using your motion library

A motion adapter goes in the [library](./components#one-library-two-readers). The renderer still decides what moves and when, and the adapter moves it. Markup doesn't change, and streaming arrival, removal after an exit and reduced motion are not the adapter's concern.

```ts
import { defineLibrary } from "@open-intelligent-ui/core"
import { gsapAdapter, motionAdapter, waapiAdapter } from "@open-intelligent-ui/core/motion"

import { animate } from "motion"
defineLibrary({ motion: motionAdapter(animate) })                                       // Motion (motion.dev)

import gsap from "gsap"
defineLibrary({ motion: gsapAdapter(gsap, { eases: { emphasis: "back.out(1.7)" } }) })  // GSAP

defineLibrary({ motion: waapiAdapter() })                                               // Web Animations API
```

| Adapter | Character |
| --- | --- |
| `motionAdapter(animate, { transitions })` | `pop` and `morph` use springs by default. `transitions` overrides by kind, for example `{ enter: { type: "spring", bounce: 0.2 } }`; `false` keeps the design's easing |
| `gsapAdapter(gsap, { eases })` | Follows the design's bezier curves exactly by default. `eases` swaps in GSAP's own by kind |
| `waapiAdapter()` | Moves like the built-in CSS, driven by script, with no dependency. Useful for adding presets |

Durations and easings still come from the design, so changing the engine doesn't change the rhythm. With an adapter, `morph` uses FLIP by default (the engine moves the element from its old place to its new one); `morph: "view-transition"` leaves it to the browser. The adapters were written and checked against Motion 14 and GSAP 3.

## Your own presets

Every adapter takes `presets`: a name, a description for the model, and keyframes. The prompt's motion section lists them, so the model can write `motion="flip-in"`.

```ts
motionAdapter(animate, {
  presets: {
    "flip-in": {
      description: "Turns into view. For a result that was just revealed; once per reply at most.",
      keyframes: { opacity: [0, 1], rotate: [-8, 0], scale: [0.9, 1] },
      token: "emphasis",
      transition: { type: "spring", bounce: 0.35 },   // handed to the engine as it is
    },
  },
})
```

Keyframes are engine-neutral numbers: `opacity`, `x`, `y`, `scale`, `rotate`, `blur`, `strokeDashoffset`. Markup refers to a preset by name. It can't write keyframes, durations or engine options.

## Another motion library

The whole contract is one `animate` function: play these keyframes on this element with this timing, and say when it is over.

```ts
import { createMotionAdapter, cssKeyframes } from "@open-intelligent-ui/core/motion"
import { animate } from "animejs"

const anime = createMotionAdapter({
  name: "Anime.js",
  animate(element, keyframes, timing) {
    const animation = animate(element, {
      ...cssKeyframes(keyframes),
      duration: timing.duration,
      delay: timing.delay,
      loop: timing.repeat,
      alternate: timing.alternate,
    })
    return { finished: animation.then(), cancel: () => animation.revert() }
  },
})
```

`timing` has the kind (`enter`, `exit`, `emphasis`, `draw`, `layout`, `loop`), the preset's name, milliseconds, the CSS easing and its bezier control points. Two optional flags describe the engine:

- `startsOnPaint`: whether the engine's clock starts on the frame the element is first painted, as CSS and the Web Animations API do. For an engine timed by script it doesn't, so the renderer hides an entering element until the page has painted once. Default `false`.
- `writesStyle`: whether the engine leaves inline styles on the element. When true, the renderer restores the element after an entrance. Default `true`.

## Designing motion

The repository has a motion skill for agents, `skills/motion`, with rules for which change gets which motion and a way to review an animation frame by frame. The short version is in the prompt: animate `opacity`, `translate`, `scale` and `rotate`; keep travel short; one emphasis per interface; nothing loops unless it reports live status; never make the reader wait for an animation before they can act.
