---
name: motion
description: Designs, implements and reviews motion in an interface so that it explains what changed instead of decorating. Use when adding animation to IUI markup or to CSS in a product, when an interface feels abrupt, janky, slow or over-animated, when choosing durations and easings, when choreographing how content arrives, and when checking animation in a real browser frame by frame before calling it done.
---

# Motion

Motion has one job: to explain a change. Something arrived, something left,
a value moved, a thing went from here to there. When an animation doesn't
explain a change, remove it. Restraint is what makes the few moments that
do move feel precise.

Working code is not the finish line. An animation is done when you have
watched it and it reads as intended.

## Work in this order

1. **Analyze.** List the changes on the screen: what appears, leaves,
   moves, resizes, changes value, responds to the pointer. Mark the ones the
   reader could miss or misread without motion. Those are the candidates.
   Everything else stays still.
2. **Design.** For each candidate, name what the motion says ("this card
   went to Done", "this total is the result"), then pick the pattern, the
   token and the order from the tables below.
3. **Implement.** In IUI markup, use the motion props
   ([references/markup.md](references/markup.md)). In CSS, use the motion
   tokens. Don't write durations as numbers.
4. **Preview.** Run it in a real browser. Capture frames
   ([Watch it](#watch-it)).
5. **Review.** Go through [the checklist](#review-checklist) with the frames
   in front of you, including fast repeated input and reduced motion.
6. **Polish.** Change one thing at a time (duration, easing, distance,
   delay), capture again, compare.

## What changed decides what moves

| The change | The motion | Token |
| --- | --- | --- |
| Content arrives | Fade in and rise 10px. A group enters in sequence, 40–60ms apart, important first. | `surface-enter` |
| Content leaves | Fade out, a little movement, no delay. Faster than it came. | `surface-exit` |
| A control responds (hover, press, toggle, select) | Color or opacity. At most 1–2px of movement. | `state-change` |
| A panel opens from a trigger | Grow and fade from the trigger's side, not from the center of the screen. | `surface-enter` / `surface-exit` |
| A thing changes place or size | It travels there. Its neighbors make room at the same time. | `layout` |
| A value changes | The number counts to it; the bar grows to it. No flash. | `layout` |
| The result lands, a goal is reached | One slightly larger entrance with a touch of overshoot. Once per screen. | `emphasis` |
| Something is live (recording, loading) | A quiet loop, for as long as it is true. | none (loop) |
| Typing, keyboard navigation, things done a hundred times a day | Nothing, or under 100ms. | none / `state-change` |

## Tokens

Timing lives in the design system, in the `motion` section of DESIGN.md,
so every surface in a product moves the same way.

| Token | Default | Curve | In CSS |
| --- | --- | --- | --- |
| `state-change` | 120ms | `cubic-bezier(0.2, 0, 0, 1)` | `var(--iui-motion-state-change-duration)` / `-easing` |
| `surface-enter` | 260ms | `cubic-bezier(0.16, 1, 0.3, 1)` decelerating | `var(--iui-motion-surface-enter-duration)` / `-easing` |
| `surface-exit` | 160ms | `cubic-bezier(0.4, 0, 1, 1)` accelerating | `var(--iui-motion-surface-exit-duration)` / `-easing` |
| `layout` | 320ms | `cubic-bezier(0.2, 0, 0, 1)` | `var(--iui-motion-layout-duration)` / `-easing` |
| `emphasis` | 520ms | `cubic-bezier(0.34, 1.4, 0.64, 1)` slight overshoot | `var(--iui-motion-emphasis-duration)` / `-easing` |

```css
.bar {
  transition: width var(--iui-motion-layout-duration) var(--iui-motion-layout-easing);
}
.chip {
  transition: background-color var(--iui-motion-state-change-duration) var(--iui-motion-state-change-easing);
}
```

A design may change the values (a calm editorial design is slower than a
dense operations console) but not the roles. If the product has no motion
tokens yet, add these five before animating anything.

## Principles

| Principle | In practice |
| --- | --- |
| **Purpose** | Say what the motion tells the reader. If you can't, cut it. |
| **Continuity** | A state change never teleports. What is on screen before and after is connected: it fades, grows, or travels. |
| **Natural pace** | Things arriving decelerate. Things leaving accelerate. Things moving between two places ease at both ends. Linear is for spinners and progress only. |
| **Hierarchy** | The important element moves first and furthest. Supporting elements follow, smaller. |
| **Stagger** | Groups enter in sequence, not at once. Keep the whole sequence under about 400ms; cap the delay after the first dozen items. |
| **Interruptible** | The reader can act at any moment. A second click mid-animation reverses or retargets it; it never queues, and never blocks input. |
| **Cheap to draw** | Animate `opacity`, `translate`, `scale`, `rotate`. Animate `width` or `height` only when the size is the data. Prefer short travel (about 10px on enter). |
| **Respect preferences** | With reduced motion, nothing travels. Changes apply at once or cross-fade. |
| **Consistency** | The same kind of change moves the same way everywhere. That is what the tokens are for. |

## Implementing

**In IUI markup.** Blocks already fade and rise as they stream in, UI SDK
dialogs, popovers, tabs and accordions already animate, charts grow and
numbers count. Add only what is listed in
[references/markup.md](references/markup.md): `motion`, `delay`, `stagger`,
`show`, `morph`.

**In CSS.**

- Prefer transitions to keyframes for anything the reader toggles. A
  transition reverses from where it is; a keyframe animation restarts.
- Enter with `@starting-style`, or with UI SDK's `[data-starting-style]` and
  `[data-ending-style]` on its parts:

  ```css
  [data-slot="popover-content"] {
    transition:
      opacity var(--iui-motion-surface-enter-duration) var(--iui-motion-surface-enter-easing),
      scale var(--iui-motion-surface-enter-duration) var(--iui-motion-surface-enter-easing);
    transform-origin: var(--transform-origin);
  }
  [data-slot="popover-content"]:is([data-starting-style], [data-ending-style]) {
    opacity: 0;
    scale: 0.96;
  }
  ```

- Keep travel short: 8–16px for entrances, 4px for exits. Scale from 0.96
  or more, never from 0.
- Set `transform-origin` to where the thing came from.
- Leave `will-change` alone unless a capture shows dropped frames.
- Wrap anything that travels in
  `@media (prefers-reduced-motion: no-preference)`, or make the reduced
  version a plain opacity change.

**Moving between two places.** Use the View Transitions API (`morph` in
markup does this). Name only elements that are fully visible, one element
per name, and keep the element the reader acted on above the others.

## Watch it

You can't judge motion from code. `scripts/capture.mjs` plays an
interaction in Chrome with animations slowed down, saves the frames and a
contact sheet, and lists what was animating.

```bash
node scripts/capture.mjs --url http://127.0.0.1:5173 \
  --click 'button[aria-label="Move forward"]' \
  --within ".board" --out ./motion
```

Then open `motion/sheet.png` and read it left to right. It needs
`playwright-core` and a Chrome on the machine; every option is described at
the top of the script. Useful variations:

- `--before <selector>` clicks through to the right screen first.
- No `--click` captures the page loading, for entrance choreography.
- `--slow 8 --frames 12` when a 120ms transition needs a closer look.
- `--reduced` runs it with reduced motion. Nothing should travel.
- `--scheme dark` checks the other color scheme.

`report.json` lists each animation with its duration, easing and
properties, the total layout shift, and notes on likely problems: layout
properties being animated, anything over 600ms, linear movement, endless
loops, movement that survives reduced motion.

For fast repeated input, run the capture twice with the same `--click`
given two or three times; the frames should show the motion retargeting,
not restarting from the beginning.

## Review checklist

Look at the frames and answer each one.

- **First frame.** Is anything visible in its final place before it
  animates (a flash), or missing space it will need (a jump)?
- **Middle frames.** Does anything overlap wrongly, clip, show through
  another layer, or stretch its text?
- **Last frame.** Is it identical to the settled state? Nothing left
  half-transparent or offset?
- **Direction.** Does each thing come from, and go to, somewhere that makes
  sense (a menu from its button, a card toward its new column)?
- **Order.** Does the eye land on the most important thing first?
- **Exit.** Does leaving take less time than arriving? Does it leave at
  all, or just vanish?
- **Interrupt.** Click again halfway. Does it reverse smoothly?
- **Repeat.** Do it ten times quickly. Still pleasant, or already tiresome?
  If tiresome, shorten it or remove it.
- **Layout shift.** Did content below jump? Reserve the space or use
  `translate`.
- **Reduced motion.** Nothing travels, nothing loops, everything still works.
- **Count.** How many things moved? If the answer is "everything", cut.

## Don't

- Animate on every keystroke, scroll tick or hover of a large area.
- Bounce, spin or pulse something that isn't live status or the one result.
- Use more than one emphasis on a screen.
- Make the reader wait for an entrance before they can click.
- Fade in text the reader is already reading.
- Animate `top`, `left`, `margin`, `width` or `height` to move or reveal
  something; use `translate`, `scale` or `clip-path`.
- Stagger a long list item by item; the last row arrives seconds late.
- Mix curves and durations chosen by feel for each component.
