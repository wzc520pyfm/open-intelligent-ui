---
version: alpha
name: Noir
description: A premium dark-first system for showcase surfaces. Deep charcoal, luminous blue, soft glass depth and generous radii.
colors:
  light:
    background: "#f3f4f6"
    surface: "#ffffff"
    foreground: "#0c0d10"
    muted: "#e8eaee"
    muted-foreground: "#5c6370"
    border: "#d5d9e0"
    primary: "#0c0d10"
    on-primary: "#ffffff"
    accent: "#2f6bfd"
    on-accent: "#ffffff"
    success: "#0f9f6e"
    warning: "#c47a0a"
    danger: "#e11d48"
    info: "#2f6bfd"
    chart-1: "#2f6bfd"
    chart-2: "#14b8a6"
    chart-3: "#8b5cf6"
    chart-4: "#f59e0b"
    chart-5: "#ec4899"
    chart-6: "#64748b"
  dark:
    background: "#07080a"
    surface: "#12141a"
    foreground: "#f4f5f7"
    muted: "#1c1f28"
    muted-foreground: "#9aa3b2"
    border: "#2a2f3a"
    primary: "#f4f5f7"
    on-primary: "#07080a"
    accent: "#4d8cff"
    on-accent: "#061018"
    success: "#34d399"
    warning: "#fbbf24"
    danger: "#fb7185"
    info: "#4d8cff"
    chart-1: "#4d8cff"
    chart-2: "#2dd4bf"
    chart-3: "#a78bfa"
    chart-4: "#fbbf24"
    chart-5: "#f472b6"
    chart-6: "#94a3b8"
typography:
  display:
    fontFamily: Inter
    fontSize: 2.75rem
    fontWeight: 650
    lineHeight: 1.08
    letterSpacing: -0.035em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.875rem
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: -0.025em
  headline-md:
    fontFamily: Inter
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.35
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
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
spacing:
  unit: 4px
motion:
  state-change:
    duration: 160ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-enter:
    duration: 300ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  surface-exit:
    duration: 180ms
    timingFunction: cubic-bezier(0.4, 0, 1, 1)
  layout:
    duration: 360ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
  emphasis:
    duration: 350ms
    timingFunction: cubic-bezier(0.22, 1, 0.36, 1)
components:
  card:
    backgroundColor: "{colors.dark.surface}"
    rounded: "{rounded.lg}"
    padding: 18px
  button-primary:
    backgroundColor: "{colors.dark.primary}"
    textColor: "{colors.dark.on-primary}"
    rounded: "{rounded.md}"
---

## Overview

Noir is the showcase look: deep charcoal ground, luminous blue accent, soft
glass depth and generous radii. It is meant for dashboards, editorial cards
and polished forms that should feel premium without becoming busy. Prefer
dark; light mode keeps the same structure on a cool grey page.

## Colors

- **Ground.** Near-black charcoal (`#07080a`). Surfaces sit one step up
  (`#12141a`) so cards read as panels without harsh contrast.
- **Ink.** Near-white foreground; muted text stays soft grey so hierarchy
  stays calm.
- **Accent.** A bright blue marks selection, primary series and focus. Use
  it sparingly: one accent moment per group.
- **Status.** Emerald, amber and rose carry meaning only. Pair each with a
  word or icon.
- **Charts.** Blue first, then teal, violet, amber, pink. Use the order as
  written so series stay distinct.

## Typography

Inter throughout. Display and headlines are tight and heavy; body stays
relaxed at 15px. Tabular figures for every comparable number. JetBrains Mono
only for code and identifiers.

## Layout

Breathing room. 16–20px inside cards, 16–24px between sections. Prefer a
two-column split (prose left, visuals right) for showcase surfaces, and a
2–4 column grid for comparable items. Dense tables and charts take full
width of their panel.

## Elevation & Depth

Cards feel slightly glassy: a soft border, a quiet shadow on elevated
panels, and backgrounds that sit above the page. Reserve stronger shadows
for floating chrome (pill nav, menus, dialogs). Avoid nested cards.

## Shapes

Generous radii: 8px for chips and inputs, 12px for buttons, 16px for cards,
24px for large panels and dialogs. Pill shapes (`full`) for floating nav and
status chips.

## Motion & Micro-interaction

Motion should feel silky and deliberate — still purposeful, never decorative.

- **state-change** (160ms): hover, press, toggle. Color, opacity, a 1px lift.
- **surface-enter** (300ms, `cubic-bezier(0.22, 1, 0.36, 1)`): content
  arrives with a soft blur-in or a short rise (≈10px). Stagger siblings
  50–60ms apart; keep a whole group under ~400ms.
- **surface-exit** (180ms, accelerating): leave faster than enter.
- **layout** (360ms): panel swaps, shared-element moves, progress fills.
- **emphasis** (350ms, same expo-out curve): one moment per surface — a
  board popping in, a chip landing on a chart.

Prefer `show={…}` over `{#if}` when the reader opens and closes panels so
enter and exit stay animated. Numbers count; charts grow from the baseline.
Floating pill navigation should cross-fade its active pill with layout
tokens. Reduced-motion preferences collapse travel to an instant cross-fade.

## Components

- **Card.** Surface color, soft border, 16px radius, 18px padding. Use
  `elevated` for the one panel that should float.
- **Primary button.** Near-white (dark) or near-black (light) fill with
  high-contrast text. One per view.
- **Secondary button.** Transparent with a hairline border.
- **Badge / chip.** Soft tint, pill radius, short label.
- **Segmented control / pill nav.** Muted track, solid white (or ink)
  indicator that slides with the layout token.
- **Input.** Muted fill, soft border, 12px radius; accent ring on focus.

## Voice & Content Strategy

Calm, specific, short. Lead with the number or the recommendation. Section
titles name the content ("Ad Spend vs Sales"), not the layout ("Overview").
Status words stay short: "Paid", "Overdue", "Growing".

## Do's and Don'ts

- Do leave air between sections; density belongs inside tables and charts.
- Do stagger groups of three to six cards on first paint.
- Do use `show` for view switches so panels enter and leave together.
- Don't wrap the whole reply in one card.
- Don't nest cards or stack competing accents.
- Don't animate more than one emphasis moment on a surface.
