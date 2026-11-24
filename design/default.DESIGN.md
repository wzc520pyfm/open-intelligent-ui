---
version: alpha
name: Paper
description: A quiet, neutral system for generated surfaces. Content first, one accent, soft depth.
colors:
  light:
    background: "#fbfbfa"
    surface: "#ffffff"
    foreground: "#1c1c1a"
    muted: "#f1f1ef"
    muted-foreground: "#6b6b66"
    border: "#e4e4e0"
    primary: "#1c1c1a"
    on-primary: "#ffffff"
    accent: "#2f6feb"
    on-accent: "#ffffff"
    success: "#17834a"
    warning: "#b86a00"
    danger: "#d1343b"
    info: "#2f6feb"
    chart-1: "#2f6feb"
    chart-2: "#12a594"
    chart-3: "#e5933a"
    chart-4: "#8e5fd6"
    chart-5: "#dc5a7a"
    chart-6: "#7a8794"
  dark:
    background: "#131312"
    surface: "#1b1b1a"
    foreground: "#ededeb"
    muted: "#262624"
    muted-foreground: "#a1a19b"
    border: "#30302d"
    primary: "#ededeb"
    on-primary: "#131312"
    accent: "#6ea0ff"
    on-accent: "#0b1220"
    success: "#4cc38a"
    warning: "#f0a23b"
    danger: "#ff6369"
    info: "#6ea0ff"
    chart-1: "#6ea0ff"
    chart-2: "#3fcfbd"
    chart-3: "#f0a85a"
    chart-4: "#b08cf0"
    chart-5: "#f07f9c"
    chart-6: "#9aa7b4"
typography:
  display:
    fontFamily: Inter
    fontSize: 2.5rem
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.3125rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.4
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 18px
spacing:
  unit: 4px
motion:
  state-change:
    duration: 120ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-enter:
    duration: 260ms
    timingFunction: cubic-bezier(0.16, 1, 0.3, 1)
  surface-exit:
    duration: 160ms
    timingFunction: cubic-bezier(0.4, 0, 1, 1)
  layout:
    duration: 320ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  emphasis:
    duration: 520ms
    timingFunction: cubic-bezier(0.34, 1.4, 0.64, 1)
components:
  card:
    backgroundColor: "{colors.light.surface}"
    rounded: "{rounded.lg}"
    padding: 16px
  button-primary:
    backgroundColor: "{colors.light.primary}"
    textColor: "{colors.light.on-primary}"
    rounded: "{rounded.md}"
---

## Overview

Paper is the default look of Open Intelligent UI. It is meant to disappear:
generated surfaces sit inside someone else's product, so the system stays
neutral and lets content, numbers and one accent color carry the page.

The mood is a well-set printed report. Warm off-white ground, near-black ink,
hairline borders, and depth only where something floats above the page.

## Colors

- **Background and surface.** The page is a warm off-white; cards and controls
  are a step brighter so they read as raised without a shadow.
- **Foreground.** Near-black ink for text and for primary buttons. A primary
  button is the single most important action on a surface; use one.
- **Accent.** Blue marks what is interactive or selected: links, focus rings,
  the active series in a chart. Never use it for decoration.
- **Status colors** (success, warning, danger, info) carry meaning only. Pair
  each with a word or an icon, never color alone.
- **Chart colors** are ordered by how different they look next to each other.
  Use them in order; a single series uses `chart-1`.

## Typography

One family, Inter, at four heading sizes and two body sizes. Headings are
tight and heavy; body text is relaxed. Numbers in tables and stats use tabular
figures so columns line up. JetBrains Mono is for code and identifiers only.

Keep to two weights on a surface: regular for reading, semibold for emphasis.

## Layout

Spacing steps are multiples of 4px. Inside a card use 16px padding and 12px
between items; between cards and sections use 16–24px. Prefer a single column
for reading and a 2–4 column grid for comparable items. Let dense data
(tables, charts) take the full width.

## Elevation & Depth

Flat by default. Cards are separated from the page by a hairline border, not a
shadow. Shadows are reserved for things that float: menus, popovers, dialogs
and toasts.

## Shapes

Small radii for small things (6px for badges and inputs), 8px for buttons,
12px for cards, 18px for dialogs. Avatars and status dots are circles.

## Motion & Micro-interaction

Motion explains what changed; it never performs.

- **state-change** (120ms): hover, press, toggle, selection. Color and opacity
  only.
- **surface-enter** (260ms, decelerating): content arriving. Fade in and rise
  10px. Streamed blocks enter one after another as they arrive.
- **surface-exit** (160ms, accelerating): content leaving. Faster than it came.
- **layout** (320ms): things changing size or place, such as a panel opening.
- **emphasis** (520ms, slight overshoot): one moment per surface at most, such
  as a result landing or a goal being reached.

Numbers count to their new value; charts grow from the baseline. When the
viewer prefers reduced motion, everything becomes an instant cross-fade.

## Components

- **Card.** Surface color, hairline border, 12px radius, 16px padding.
- **Primary button.** Ink background, white text, 8px radius. One per view.
- **Secondary button.** Surface background with a border.
- **Badge.** Soft tint of its status color with matching text.
- **Input.** Surface background, border, 8px radius; the border turns accent
  on focus with a soft ring.

## Voice & Content Strategy

Plain, specific and short. Labels are nouns ("Budget"), actions are verbs
("Add stop"). Lead with the answer, then the evidence. Numbers carry units.
Empty states say what will appear and how to make it appear.

## Do's and Don'ts

- Do lead with the single most useful number or decision.
- Do group related controls and results in one card.
- Do keep one primary action per surface.
- Don't use more than one accent color.
- Don't nest cards inside cards.
- Don't animate more than one thing at a time for emphasis.
