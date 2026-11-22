---
version: alpha
name: Heritage
description: An editorial system. Serif headlines, cream paper, one terracotta accent, square corners.
colors:
  light:
    background: "#f7f3ea"
    surface: "#fffdf8"
    foreground: "#221f1a"
    muted: "#ece6d8"
    muted-foreground: "#6f675a"
    border: "#d9d1c0"
    primary: "#221f1a"
    on-primary: "#fffdf8"
    accent: "#b8422e"
    on-accent: "#fffdf8"
    success: "#3d7a4f"
    warning: "#a8691a"
    danger: "#a32b2b"
    info: "#2f5d8a"
    chart-1: "#b8422e"
    chart-2: "#2f5d8a"
    chart-3: "#c79a3b"
    chart-4: "#3d7a4f"
    chart-5: "#7a4b78"
    chart-6: "#8a8272"
  dark:
    background: "#17150f"
    surface: "#1f1c15"
    foreground: "#efe9da"
    muted: "#2a261d"
    muted-foreground: "#a79f8d"
    border: "#383325"
    primary: "#efe9da"
    on-primary: "#17150f"
    accent: "#e2775f"
    on-accent: "#1b0e0a"
    success: "#7fbf8f"
    warning: "#e0aa55"
    danger: "#e87878"
    info: "#86b0db"
    chart-1: "#e2775f"
    chart-2: "#86b0db"
    chart-3: "#e3c069"
    chart-4: "#7fbf8f"
    chart-5: "#c495c1"
    chart-6: "#a79f8d"
typography:
  display:
    fontFamily: Fraunces
    fontSize: 2.75rem
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Fraunces
    fontSize: 1.875rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Fraunces
    fontSize: 1.375rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Fraunces
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.35
  body-md:
    fontFamily: Source Serif 4
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.65
  body-sm:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.5
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.06em
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 2px
  md: 3px
  lg: 4px
  xl: 6px
spacing:
  unit: 4px
motion:
  state-change:
    duration: 140ms
    timingFunction: ease-out
  surface-enter:
    duration: 380ms
    timingFunction: cubic-bezier(0.2, 0.7, 0.2, 1)
  surface-exit:
    duration: 200ms
    timingFunction: ease-in
  layout:
    duration: 400ms
    timingFunction: cubic-bezier(0.2, 0.7, 0.2, 1)
  emphasis:
    duration: 600ms
    timingFunction: cubic-bezier(0.2, 0.7, 0.2, 1)
components:
  card:
    backgroundColor: "{colors.light.surface}"
    rounded: "{rounded.lg}"
    padding: 20px
  button-primary:
    backgroundColor: "{colors.light.accent}"
    textColor: "{colors.light.on-accent}"
    rounded: "{rounded.md}"
---

## Overview

Heritage reads like a well-edited magazine. Serif headlines carry authority,
cream paper keeps long reading comfortable, and a single terracotta accent
marks the one thing to act on. Nothing is rounded, nothing glows.

## Colors

- **Paper and ink.** Cream background, a lighter cream for cards, warm
  near-black text. Never pure white or pure black.
- **Terracotta accent.** Primary actions, the selected item and the lead
  series in a chart. One accent per view.
- **Status.** Muted green, ochre and brick. They appear only on status.
- **Charts.** Start with terracotta, then slate blue. Avoid more than four
  series; split the chart instead.

## Typography

Headlines are set in Fraunces, body in Source Serif 4, and small interface
text (labels, captions, table headers) in Inter. Labels are uppercase with
open tracking, like a magazine's section slugs. Figures in tables use
tabular numerals.

## Layout

A single reading column. Generous vertical rhythm: 24px between blocks, 20px
inside cards. Prefer a rule (a hairline divider) to a box when separating
sections. Two columns at most.

## Elevation & Depth

Flat. Cards are distinguished by a hairline border, not a shadow. Only
popovers and dialogs cast a shadow, and a soft one.

## Shapes

Square with barely softened corners (2–4px). Pills are not used; badges are
small rectangles.

## Motion & Micro-interaction

Slow and settled, like turning a page. Content fades up over about 380ms.
Nothing bounces. Hover changes color only. The emphasis entrance is a longer
fade, never a pop.

## Components

- **Cards** have a hairline border and no shadow.
- **Primary buttons** are terracotta with cream text. Secondary buttons are
  outlined in ink.
- **Tables** have a heavy rule above the header and hairlines between rows.
- **Pull figures.** A key number is set large in Fraunces with an uppercase
  label above it.

## Voice & Content Strategy

Write like an editor. Headlines state the finding ("Kyoto is cheaper in
March"), not the topic ("Price comparison"). Sentence case. No exclamation
marks. Numbers are precise and carry their unit.

## Do's and Don'ts

- Do lead with a headline that states the conclusion.
- Do use a divider between sections instead of nesting cards.
- Don't use more than one accent-colored element per view.
- Don't round corners or add shadows to cards.
- Don't use emoji.
