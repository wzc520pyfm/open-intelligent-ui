import type { ChatMessage, LiveSettings } from "./live"
import { streamChat } from "./live"
import { type DesignAssessment, assessDesign, extractDesignSource } from "./studio"

/**
 * What a model needs to write a DESIGN.md this page can wear. The shape
 * matches the designs that ship with the package. Font families are the ones
 * the playground loads; a name it doesn't load would not show up.
 */
export const DESIGN_AUTHOR_PROMPT = `You write DESIGN.md files for Open Intelligent UI. A DESIGN.md is YAML front matter plus Markdown. The renderer turns the tokens into CSS variables. The prose is given to the model that later writes the interface, so it has to say how the tokens are used.

Reply with one DESIGN.md and nothing else. No code fence. No introduction. No closing note.

The user's message may include a screenshot, a request, and a DESIGN.md that is already applied. Follow the request. When there is a screenshot, match its color, type, density, corners, and depth. If a file is already applied and the request changes it, keep what the request does not change. If the request is a new design, write a new file. Write the prose in the same language as the user's request.

Use this shape. The values are an example, not a design to copy:

---
version: alpha
name: A short name
description: One sentence on the one idea that decides the rest.
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
    success: "#7dcca0"
    warning: "#e0b15a"
    danger: "#f0918a"
    info: "#8eb4d9"
    chart-1: "#e2775f"
    chart-2: "#8eb4d9"
    chart-3: "#e0b15a"
    chart-4: "#7dcca0"
    chart-5: "#d09bc8"
    chart-6: "#a79f8d"
typography:
  display:
    fontFamily: Fraunces
    fontSize: 2.75rem
    fontWeight: 560
    lineHeight: 1.05
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Fraunces
    fontSize: 1.75rem
    fontWeight: 560
    lineHeight: 1.15
  headline-md:
    fontFamily: Fraunces
    fontSize: 1.3125rem
    fontWeight: 560
    lineHeight: 1.25
  headline-sm:
    fontFamily: Source Serif 4
    fontSize: 1.0625rem
    fontWeight: 560
    lineHeight: 1.35
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
    fontSize: 0.75rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.01em
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: 2px
  md: 4px
  lg: 8px
  xl: 12px
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

Who it is for, and the one idea that decides the rest.

## Colors

How the ground, the accent, and the status colors are used. A status color is for state, and it comes with a word.

## Typography

Which family is for headlines, body, labels, and code, and when numbers are tabular.

## Layout

Density, gaps, and what is a card versus a table.

## Elevation & Depth

Borders, shadows, or neither.

## Shapes

How round the corners are, and what stays square.

## Motion & Micro-interaction

Which motion token is for which kind of change. Nothing loops unless it reports a live status.

## Components

How cards, buttons, badges, and tables look here.

## Voice & Content Strategy

How the interface speaks.

## Do's and Don'ts

Three or four concrete rules.

Token rules:

- Colors are hex. Give every key in the example, in both light and dark. Dark is its own scheme, not a filter on the light one.
- \`muted\` is a quiet background. \`muted-foreground\` is secondary text. \`on-primary\` and \`on-accent\` are the text on those fills.
- Font families are only Inter, Space Grotesk, Source Serif 4, Fraunces, or JetBrains Mono. The page loads those and no others. Do not name a font file, a URL, or another family.
- Durations are milliseconds. Easing is a cubic-bezier or a keyword such as linear.
- A token value is plain CSS. No url(), no @import, no HTML, no semicolon.
- A component value that points at another token uses the brace form in the example.
- Keep the file under 220 lines.`

export function designRepair(assessment: DesignAssessment): string {
  const problems = assessment.issues.length
    ? assessment.issues.map((issue) => `- ${issue}`).join("\n")
    : "- The file is not a usable DESIGN.md."
  return `This DESIGN.md can't be used yet.\n${problems}\nReply with the whole DESIGN.md and nothing else. No code fence.`
}

/**
 * Streams a DESIGN.md, and while the file is not usable as specified, sends
 * it back with what the check found. The same loop the interface uses.
 */
export async function askDesign(options: {
  settings: LiveSettings
  messages: ChatMessage[]
  signal?: AbortSignal
  fetch?: typeof fetch
  repairs?: number
  onText: (source: string) => void
  onReasoning?: (chunk: string) => void
  onRound?: (assessment: DesignAssessment, round: number, willRepair: boolean) => void
}): Promise<{ source: string; assessment: DesignAssessment; rounds: number }> {
  const repairs = options.repairs ?? 2
  let messages = options.messages
  for (let round = 0; ; round++) {
    let raw = ""
    for await (const part of streamChat({
      ...options.settings,
      messages,
      signal: options.signal,
      fetch: options.fetch,
      onReasoning: options.onReasoning,
    })) {
      raw += part
      options.onText(extractDesignSource(raw))
    }
    const source = extractDesignSource(raw)
    const assessment = assessDesign(source)
    const willRepair = !assessment.ok && round < repairs
    options.onRound?.(assessment, round, willRepair)
    if (!willRepair) return { source, assessment, rounds: round + 1 }
    messages = [
      ...options.messages,
      { role: "assistant", content: source },
      { role: "user", content: designRepair(assessment) },
    ]
  }
}
