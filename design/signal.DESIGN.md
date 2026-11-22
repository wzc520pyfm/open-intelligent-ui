---
version: alpha
name: Signal
description: A dense, technical system for operations surfaces. Dark first, mono labels, a lime signal color.
colors:
  light:
    background: "#f4f5f7"
    surface: "#ffffff"
    foreground: "#0f1419"
    muted: "#e9ebef"
    muted-foreground: "#5b6572"
    border: "#d7dbe2"
    primary: "#0f1419"
    on-primary: "#ffffff"
    accent: "#4f46e5"
    on-accent: "#ffffff"
    success: "#0f8a5f"
    warning: "#b45309"
    danger: "#dc2626"
    info: "#0e7490"
    chart-1: "#4f46e5"
    chart-2: "#0e9f6e"
    chart-3: "#d97706"
    chart-4: "#db2777"
    chart-5: "#0891b2"
    chart-6: "#64748b"
  dark:
    background: "#0a0c10"
    surface: "#11151b"
    foreground: "#e6eaf0"
    muted: "#1a2029"
    muted-foreground: "#8a95a5"
    border: "#232b37"
    primary: "#c6f432"
    on-primary: "#0a0c10"
    accent: "#c6f432"
    on-accent: "#0a0c10"
    success: "#3ddc97"
    warning: "#fbbf24"
    danger: "#ff5c5c"
    info: "#38bdf8"
    chart-1: "#c6f432"
    chart-2: "#38bdf8"
    chart-3: "#fbbf24"
    chart-4: "#f472b6"
    chart-5: "#a78bfa"
    chart-6: "#8a95a5"
typography:
  display:
    fontFamily: Space Grotesk
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 1.1875rem
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.4
  body-md:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.04em
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 4px
  md: 6px
  lg: 10px
  xl: 14px
spacing:
  unit: 4px
motion:
  state-change:
    duration: 90ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-enter:
    duration: 180ms
    timingFunction: cubic-bezier(0.16, 1, 0.3, 1)
  surface-exit:
    duration: 110ms
    timingFunction: cubic-bezier(0.4, 0, 1, 1)
  layout:
    duration: 220ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  emphasis:
    duration: 360ms
    timingFunction: cubic-bezier(0.34, 1.56, 0.64, 1)
components:
  card:
    backgroundColor: "{colors.dark.surface}"
    rounded: "{rounded.lg}"
    padding: 14px
  button-primary:
    backgroundColor: "{colors.dark.primary}"
    textColor: "{colors.dark.on-primary}"
    rounded: "{rounded.md}"
---

## Overview

Signal is for people who watch systems: operations consoles, queues,
incident views. It is dense, exact and fast. In the dark it is a near-black
console with one lime signal color; in the light it is a cool grey ledger
with an indigo accent.

## Colors

- **Ground.** Near-black blue in the dark, cool grey in the light. Surfaces
  are one step up from the ground.
- **Signal.** Lime (dark) or indigo (light) marks the primary action and
  the live series. It is never used for decoration.
- **Status.** Green, amber, red and cyan are reserved for state: healthy,
  degraded, failing, informational. A status color always comes with a word.
- **Charts.** The signal color first, then cyan and amber.

## Typography

Headlines in Space Grotesk, body in Inter at 14px, and labels in JetBrains
Mono: small, uppercase-friendly, slightly tracked. Every number that can be
compared is tabular.

## Layout

Dense. 12–16px inside cards, 12px between them. Grids of three or four
columns on wide screens. Tables are the default way to show a collection;
cards are for single entities.

## Elevation & Depth

No shadows in the dark; surfaces are separated by a one-pixel border one
step lighter than the ground. Popovers get a border and a tight shadow.

## Shapes

Small radii (4–10px). Badges are compact rectangles with a status dot.

## Motion & Micro-interaction

Fast and exact. State changes take 90ms; content arrives in 180ms with a
short rise. The only emphasis is a quick overshoot on a value that just
changed. Live indicators may pulse; nothing else loops.

## Components

- **Cards** carry a border, no shadow, and a mono label at the top.
- **Primary buttons** use the signal color with dark text.
- **Badges** use the dot variant for status.
- **Tables** are compact, with mono headers and right-aligned numbers.

## Voice & Content Strategy

Terse and factual, like a log line a person can read. Lead with the state
("3 failing", "Queue clear"). Use the reader's units and identifiers.
No greetings, no adjectives.

## Do's and Don'ts

- Do show status as a word plus a color.
- Do right-align and tabulate numbers.
- Don't use the signal color for more than one element in a group.
- Don't use large type for anything but the one headline figure.
- Don't add decorative illustration.
