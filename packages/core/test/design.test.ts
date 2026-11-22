import { describe, expect, test } from "vitest"
import {
  describeDesignTokens,
  designToCss,
  parseDesign,
  parseInlineStyle,
  safeUrl,
  scopeCss,
} from "../src/design"

const DESIGN = `---
version: alpha
name: Daylight Prestige
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
  light:
    surface: "#FFFFFF"
    on-surface: "#1A1C1E"
  dark:
    surface: "#14161A"
    on-surface: "#ECEEF1"
    neutral: "#0C0D10"
typography:
  headline-lg:
    fontFamily: Public Sans
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.02em
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label-caps:
    fontFamily: Space Grotesk
    fontSize: 12px
    letterSpacing: 0.1em
rounded:
  md: 4px
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
motion:
  state-change:
    duration: 100ms
    timingFunction: ease-out
  page-transition:
    duration: 400ms
    delay: 50ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.light.surface}"
    rounded: "{rounded.md}"
    padding: 12px
    typography: "{typography.label-caps}"
  button-primary-hover:
    backgroundColor: "{colors.missing}"
---

## Overview

Calm, editorial, precise.

## Colors

- **Tertiary (#B8422E):** the only driver for interaction.
`

describe("DESIGN.md", () => {
  const design = parseDesign(DESIGN)

  test("reads tokens and prose", () => {
    expect(design.name).toBe("Daylight Prestige")
    expect(design.colors).toEqual({
      primary: "#1A1C1E",
      secondary: "#6C7278",
      tertiary: "#B8422E",
      neutral: "#F7F5F2",
      surface: "#FFFFFF",
      "on-surface": "#1A1C1E",
    })
    expect(design.darkColors).toEqual({
      surface: "#14161A",
      "on-surface": "#ECEEF1",
      neutral: "#0C0D10",
    })
    expect(design.typography["headline-lg"]).toEqual({
      fontFamily: "Public Sans",
      fontSize: "32px",
      fontWeight: "600",
      lineHeight: "1.15",
      letterSpacing: "-0.02em",
    })
    expect(design.motion["page-transition"]).toEqual({
      duration: "400ms",
      delay: "50ms",
      timingFunction: "cubic-bezier(0.2, 0, 0, 1)",
    })
    expect(design.prose.startsWith("## Overview")).toBe(true)
  })

  test("resolves references and reports broken ones", () => {
    expect(design.components["button-primary"]).toEqual({
      backgroundColor: "#B8422E",
      textColor: "#FFFFFF",
      rounded: "4px",
      padding: "12px",
      typography: {
        fontFamily: "Space Grotesk",
        fontSize: "12px",
        letterSpacing: "0.1em",
      },
    })
    expect(design.components["button-primary-hover"]).toEqual({})
    expect(design.issues).toEqual(["Reference {colors.missing} points to nothing"])
  })

  test("writes CSS variables with roles filled in", () => {
    const css = designToCss(design, { selector: ".x" })
    const has = (line: string) => expect(css).toContain(line)
    has("--iui-color-tertiary: #B8422E;")
    has("--iui-color-background: var(--iui-color-neutral);")
    has("--iui-color-foreground: var(--iui-color-on-surface);")
    has("--iui-color-accent: var(--iui-color-tertiary);")
    has("--iui-color-primary-foreground: #ffffff;")
    has("--iui-color-border: color-mix(in oklab, var(--iui-color-foreground) 14%, var(--iui-color-background));")
    has("color-scheme: light;")
    has('--iui-font-h1-family: "Public Sans", ui-sans-serif')
    has("--iui-font-h1-size: 32px;")
    has("--iui-font-body-line: 1.6;")
    has('.x [data-type="label-caps"] { font-family: "Space Grotesk"')
    has("--iui-radius-md: 4px;")
    has("--iui-radius-lg: calc(var(--iui-radius-md) * 1.5);")
    has("--iui-space-unit: 8px;")
    has("--iui-space-md: calc(var(--iui-space-unit) * 4);")
    has("--iui-motion-state-change-duration: 100ms;")
    has("--iui-motion-state-change-easing: ease-out;")
    has("--iui-motion-surface-enter-duration: 260ms;")
    has("--iui-motion-page-transition-delay: 50ms;")
    has("--iui-c-button-primary-background: #B8422E;")
    has("--iui-c-button-primary-radius: 4px;")
    has("--iui-c-button-primary-font-size: 12px;")
    has("--iui-c-button-primary-letter-spacing: 0.1em;")
    has('.x[data-iui-scheme="dark"] {\n  --iui-color-surface: #14161A;')
    has('@media (prefers-color-scheme: dark) {\n.x[data-iui-scheme="auto"] {')
  })

  test("an empty design still gives a complete theme", () => {
    const css = designToCss(parseDesign(""), { selector: ".x" })
    expect(css).toContain("--iui-color-background: #ffffff;")
    expect(css).toContain("--iui-color-foreground: #18181b;")
    expect(css).toContain("--iui-color-primary: var(--iui-color-foreground);")
    expect(css).toContain("--iui-color-primary-foreground: #ffffff;")
    expect(css).toContain("--iui-radius-md: 10px;")
    expect(css).toContain("--iui-space-unit: 4px;")
  })

  test("a dark design gets light text and a dark color scheme", () => {
    const css = designToCss(
      parseDesign('---\ncolors:\n  background: "#0b0d12"\n  primary: "#9EF0C0"\n---'),
      { selector: ".x" }
    )
    expect(css).toContain("--iui-color-foreground: #f4f4f5;")
    expect(css).toContain("--iui-color-primary-foreground: #18181b;")
    expect(css).toContain("color-scheme: dark;")
  })

  test("values that could break out of a declaration are refused", () => {
    const unsafe = parseDesign(
      '---\ncolors:\n  primary: "red; } body { display: none"\n  accent: "url(https://x.dev/a.png)"\n  ok: "oklch(60% 0.2 250)"\n---'
    )
    expect(unsafe.colors).toEqual({ ok: "oklch(60% 0.2 250)" })
    expect(unsafe.issues).toHaveLength(2)
  })

  test("tokens may also live in yaml blocks in the body", () => {
    const interleaved = parseDesign(
      "## Colors\n\n```yaml\ncolors:\n  primary: '#ff0000'\n```\n\n```yaml\nunrelated: true\n```\n"
    )
    expect(interleaved.colors).toEqual({ primary: "#ff0000" })
  })

  test("lists token names for the prompt", () => {
    expect(describeDesignTokens(design)).toContain(
      "- Motion: state-change (100ms ease-out), page-transition (400ms cubic-bezier(0.2, 0, 0, 1))"
    )
  })
})

describe("scoped CSS", () => {
  test("rules are nested under the surface", () => {
    const { css } = scopeCss(
      ".hero { color: var(--iui-color-primary); }\n.hero:hover > b { opacity: 0.8 }",
      '[data-s="1"]'
    )
    expect(css).toBe(
      '[data-s="1"] {\n.hero { color: var(--iui-color-primary); }\n.hero:hover > b { opacity: 0.8 }\n}'
    )
  })

  test("page-level selectors point at the surface instead", () => {
    const { css } = scopeCss(":root { --gap: 4px } body, html .a { margin: 0 }", ".s")
    expect(css).toBe(".s {\n& { --gap: 4px }\n&, & .a { margin: 0 }\n}")
  })

  test("keyframes move out and are renamed", () => {
    const { css } = scopeCss(
      "@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }\n.dot { animation: pulse 1s infinite; }\n.pulse { animation-name: pulse }",
      ".s",
      "a1"
    )
    expect(css).toBe(
      "@keyframes iui-a1-pulse { from { opacity: 0 } to { opacity: 1 } }\n.s {\n.dot { animation: iui-a1-pulse 1s infinite; }\n.pulse { animation-name: iui-a1-pulse }\n}"
    )
  })

  test("media and container queries are kept", () => {
    const { css } = scopeCss(
      "@media (max-width: 600px) { .grid { display: block } }\n@container (min-width: 30em) { .a { gap: 1px } }",
      ".s"
    )
    expect(css).toContain("@media (max-width: 600px) {\n.grid { display: block }\n}")
    expect(css).toContain("@container (min-width: 30em) {\n.a { gap: 1px }\n}")
  })

  test("network access and escapes are removed", () => {
    const { css, dropped } = scopeCss(
      `@import url("https://x.dev/a.css");
@font-face { font-family: X; src: url(https://x.dev/f.woff2) }
.a { background: url(https://x.dev/t.gif?q=1); mask: url(#m); position: fixed }
.b { background: url("data:image/png;base64,AAAA") }
} body { display: none } .c {
.d { color: red`,
      ".s"
    )
    expect(css).not.toContain("x.dev")
    expect(css).toContain(".a { background: none; mask: url(#m); position: absolute }")
    expect(css).toContain('.b { background: url("data:image/png;base64,AAAA") }')
    expect(css).not.toContain(".d")
    expect(dropped).toEqual(['@import url("https://x.dev/a.css")', "@font-face"])
    const opens = css.split("{").length
    const closes = css.split("}").length
    expect(opens).toBe(closes)
    expect(css.startsWith(".s {")).toBe(true)
  })

  test("a closing style tag can't end the stylesheet early", () => {
    const { css } = scopeCss(".a { color: red } </style><b>x</b>", ".s")
    expect(css).not.toContain("</style")
  })
})

describe("inline styles and URLs", () => {
  test("style strings become style objects", () => {
    expect(
      parseInlineStyle(
        "color: var(--iui-color-primary); font-size:14px; --gap: calc(1px * (2 + 1)); background-image: url(https://x.dev/a.png); position: fixed"
      )
    ).toEqual({
      color: "var(--iui-color-primary)",
      fontSize: "14px",
      "--gap": "calc(1px * (2 + 1))",
      position: "absolute",
    })
  })

  test("only safe URLs pass", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
    expect(safeUrl("/orders/1")).toBe("/orders/1")
    expect(safeUrl("#top")).toBe("#top")
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co")
    expect(safeUrl("javascript:alert(1)")).toBeNull()
    expect(safeUrl(" JaVa\nScript:alert(1)")).toBeNull()
    expect(safeUrl("data:text/html,<script>")).toBeNull()
    expect(safeUrl("data:image/png;base64,AAAA", "media")).toBe(
      "data:image/png;base64,AAAA"
    )
    expect(safeUrl("data:image/svg+xml,<svg>", "media")).toBeNull()
    expect(safeUrl("mailto:a@b.co", "media")).toBeNull()
    expect(safeUrl(42)).toBeNull()
  })
})
