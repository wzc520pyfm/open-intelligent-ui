import { describe, expect, test } from "vitest"
import {
  describeDesignTokens,
  designToCss,
  loadsNothing,
  parseDesign,
  parseInlineStyle,
  safeStyleValue,
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

  test("keeps token references as variables and reports broken ones", () => {
    expect(design.components["button-primary"]).toEqual({
      backgroundColor: "var(--iui-color-tertiary)",
      textColor: "var(--iui-color-surface)",
      rounded: "var(--iui-radius-md)",
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
    has("--iui-c-button-primary-background: var(--iui-color-tertiary);")
    has("--iui-c-button-primary-radius: var(--iui-radius-md);")
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
    const loading = parseDesign(
      "---\ncolors:\n  primary: \"image-set('https://x.dev/a.png' 1x)\"\n  ok: \"#fff\"\n---"
    )
    expect(loading.colors).toEqual({ ok: "#fff" })
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

/**
 * Reads CSS the way a browser's tokenizer does, written apart from the code
 * under test: the text outside strings, the address of every `url()`, and
 * where the nesting returns to the top level.
 */
function asBrowser(css: string): { code: string; addresses: string[]; closes: number[] } {
  let code = ""
  const addresses: string[] = []
  const closes: number[] = []
  let depth = 0
  let i = 0
  const string = (): string => {
    const quote = css[i]
    let text = ""
    for (i++; i < css.length && css[i] !== quote && css[i] !== "\n"; i++) {
      if (css[i] === "\\") text += css[++i] ?? ""
      else text += css[i]
    }
    i++
    return text
  }
  while (i < css.length) {
    const ch = css[i] as string
    if (ch === "\\") {
      code += css.slice(i, i + 2)
      i += 2
    } else if (ch === '"' || ch === "'") {
      string()
    } else if (/^url\($/i.test(css.slice(i, i + 4)) && !/[\w-]/.test(css[i - 1] ?? "")) {
      i += 4
      while (/\s/.test(css[i] ?? "")) i++
      if (css[i] === '"' || css[i] === "'") {
        addresses.push(string())
      } else {
        const end = css.indexOf(")", i)
        addresses.push(css.slice(i, end === -1 ? css.length : end).trim())
        i = end === -1 ? css.length : end + 1
      }
    } else {
      if (ch === "{") depth++
      else if (ch === "}" && --depth === 0) closes.push(i)
      code += ch
      i++
    }
  }
  return { code, addresses, closes }
}

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
    expect(dropped).toEqual(["@import none", "@font-face"])
    const opens = css.split("{").length
    const closes = css.split("}").length
    expect(opens).toBe(closes)
    expect(css.startsWith(".s {")).toBe(true)
  })

  test("a name spelled with escapes is read as the browser reads it", () => {
    const { css } = scopeCss(
      String.raw`.a { position: f\69xed; pos\69tion: fixed; POSITION: f\000069 xed }
.b { background: u\72l(https://x.dev/a.png); mask: \75rl(https://x.dev/b.png); cursor: \url(https://x.dev/c.png) }
.c { background: \69mage-set("https://x.dev/d.png" 1x) }
.sm\:flex { content: "\201C u\72l(" }`,
      ".s"
    )
    expect(css).not.toMatch(/fixed/i)
    expect(css).toContain(".a { position: absolute; position: absolute; POSITION: absolute }")
    expect(css).toContain(".b { background: none; mask: none; cursor: none }")
    expect(css).toContain('.c { background: none("https://x.dev/d.png" 1x) }')
    expect(css).toContain(String.raw`.sm\:flex { content: "\201C u\72l(" }`)
  })

  test("position takes a keyword, since var() and attr() can stand for fixed", () => {
    const { css } = scopeCss(
      `.a { --p: fixed; position: var(--p) }
.b { position: attr(data-p type(*)) }
.c { position: fixed !important; background-position: center }
.d { position: sticky; top: 0 }
.e { position:relative }
@supports (position: sticky) { .f { position: absolute } }`,
      ".s"
    )
    expect(css).toContain(".a { --p: fixed; position: absolute(--p) }")
    expect(css).toContain(".b { position: absolute(data-p type(*)) }")
    expect(css).toContain(".c { position: absolute !important; background-position: center }")
    expect(css).toContain(".d { position: sticky; top: 0 }")
    expect(css).toContain(".e { position:relative }")
    expect(css).toContain("@supports (position: sticky) {\n.f { position: absolute }\n}")
  })

  test("a selector that names the surface or starts from a sibling stays inside it", () => {
    const guard = ":where(.s, .s *)"
    const scoped = (css: string) => scopeCss(css, ".s").css
    expect(scoped(".app:has(&) .sidebar { display: none }")).toBe(
      `.s {\n.app:has(&) .sidebar${guard} { display: none }\n}`
    )
    expect(scoped("body:has(&) .sidebar { display: none }")).toBe(
      `.s {\n&:has(&) .sidebar${guard} { display: none }\n}`
    )
    expect(scoped("+ .next, & ~ *, :not(&) { color: red }")).toBe(
      `.s {\n+ .next${guard}, & ~ *${guard}, :not(&)${guard} { color: red }\n}`
    )
    expect(scoped("& + .next::before, .a + .b:before { content: 'x' }")).toBe(
      `.s {\n& + .next${guard}::before, .a + .b${guard}:before { content: 'x' }\n}`
    )
    expect(scoped(":scope .page { color: red }")).toBe(`.s {\n:scope .page${guard} { color: red }\n}`)
    // What already means "inside the surface" is left as written.
    expect(scoped("&, & .a, &:hover > b, .a .b::after, .a:has(> img) { color: red }")).toBe(
      ".s {\n&, & .a, &:hover > b, .a .b::after, .a:has(> img) { color: red }\n}"
    )
  })

  test("rules nested in a rule are held to the surface as well", () => {
    const { css, dropped } = scopeCss(
      `.card { color: red; body:has(&) #app { display: none } &:hover { color: blue } + .next { margin: 0 }
  @media (width > 600px) { & ~ * { opacity: 0 } gap: 4px }
  @scope (body) { .page { display: none } }
  background: url(https://x.dev/a.png) }`,
      ".s"
    )
    const guard = ":where(.s, .s *)"
    expect(css).toBe(
      [
        ".s {",
        ".card {",
        "color: red;",
        `body:has(&) #app${guard} { display: none }`,
        "&:hover { color: blue }",
        `+ .next${guard} { margin: 0 }`,
        "@media (width > 600px) {",
        `& ~ *${guard} { opacity: 0 }`,
        "gap: 4px;",
        "}",
        "background: none;",
        "}",
        "}",
      ].join("\n")
    )
    expect(dropped).toEqual(["@scope (body)"])
  })

  test("a brace the browser doesn't count can't end the surface's rule", () => {
    const cases = [
      String.raw`.a { --x: \{ } } .page { display: none }`,
      String.raw`.a { color: red\} } .page { display: none }`,
      `.a { background: url(x"y) } } .page { display: none } .b { --z: " }`,
      ".a { background: url(#a } .x { .y { --y: ) } } .page { display: none }",
      ".a { --x: url(#a{) } .page { display: none } }",
      '.a { --x: "a\r } } .page { display: none } .b { --y: " }',
      ".a { } } } .page { display: none }",
    ]
    for (const input of cases) {
      const { css } = scopeCss(input, ".s")
      const { closes } = asBrowser(css)
      expect(closes, input).toEqual([css.length - 1])
    }
  })

  test("a string the browser doesn't see can't hide an address", () => {
    const cases = [
      String.raw`.a { --x: \" ; background: url(https://x.dev/1) ; --y: " }`,
      '.a { --x: "a\\\r\n" ; background: url(https://x.dev/2) ; --y: "" }',
      `.a { content: /${"/*"}*/* " */ ; background: url(https://x.dev/3) ; --x: /${"/*"}*/* " */ }`,
      '.a { background: url("https://x.dev/4)b") }',
      `.a { background: url('https://x.dev/5"b') }`,
      '.a { background: url("#x\\");background:url(https://x.dev/6") }',
      '.a { background: url("https://x.dev/7" fallback) }',
      ".a { background: url(https://x.dev/8",
      '.a { background: src("https://x.dev/9"), image("https://x.dev/10"), -webkit-image-set("https://x.dev/11" 1x) }',
      ".a { background: url(https://x.dev/12) } .b { mask: url(#m) }",
    ]
    for (const input of cases) {
      const { code, addresses } = asBrowser(scopeCss(input, ".s").css)
      for (const address of addresses) expect(address, input).toMatch(/^#/)
      expect(code, input).not.toMatch(/x\.dev|(?:src|image|image-set)\(/)
    }
    expect(scopeCss(".a { mask: url(data:image/png;base64,AA==) }", ".s").css).toBe(
      '.s {\n.a { mask: url("data:image/png;base64,AA==") }\n}'
    )
    expect(scopeCss('.a::before { content: "url(x) { ; }" }', ".s").css).toBe(
      '.s {\n.a::before { content: "url(x) { ; }" }\n}'
    )
  })

  test("text can't be put back together into a comment or a closing tag", () => {
    expect(scopeCss(`.a { color: red } /${"/*"}*/* .b { } */`, ".s").css).not.toContain("/*")
    expect(scopeCss(".a { color: red } </sty<style>le> .b { margin: 0 }", ".s").css).not.toMatch(
      /<\/?style/i
    )
    expect(scopeCss(String.raw`.a { color: red } </st\79le> .b { margin: 0 }`, ".s").css).not.toMatch(
      /<\/?style/i
    )
    expect(scopeCss("@media (400px <= width) { .a { margin: 0 } }", ".s").css).toContain(
      "@media (400px <= width)"
    )
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

  test("an inline style can't hide a name behind escapes, cssText or var()", () => {
    expect(
      parseInlineStyle(
        String.raw`position: f\69xed; background: u\72l(https://x.dev/a.png); background-image: image-set("https://x.dev/b.png" 1x); color: r\65 d; top: 0`
      )
    ).toEqual({ position: "absolute", color: "red", top: "0" })
    expect(parseInlineStyle("--p: fixed; position: var(--p); position: sticky !important")).toEqual({
      "--p": "fixed",
      position: "sticky !important",
    })
    expect(parseInlineStyle("position: var(--p)")).toEqual({ position: "absolute" })
    expect(safeStyleValue("cssText", "position: fixed; inset: 0")).toBeNull()
    expect(safeStyleValue("css-text", "position: fixed")).toBeNull()
    expect(safeStyleValue("position", "relative")).toBe("relative")
    expect(safeStyleValue("content", String.raw`"\201C"`)).toBe(String.raw`"\201C"`)
  })

  test("an inline value can't end its declaration and start another", () => {
    expect(safeStyleValue("color", "red;position:fixed;inset:0")).toBeNull()
    expect(safeStyleValue("--gap", "4px; position: fixed")).toBeNull()
    expect(safeStyleValue("content", '"a;b"')).toBe('"a;b"')
    expect(safeStyleValue("content", '"url(x)"')).toBe('"url(x)"')
    expect(parseInlineStyle('content: "a;b"; color: red')).toEqual({ content: '"a;b"', color: "red" })
    expect(parseInlineStyle(String.raw`--x: \"; position: fixed; --y: \"`)).toEqual({
      "--x": String.raw`\"`,
      position: "absolute",
      "--y": String.raw`\"`,
    })
    expect(parseInlineStyle('background: url("https://x.dev/a)b"); mask: url(#m)')).toEqual({
      mask: "url(#m)",
    })
    expect(parseInlineStyle('background: src("https://x.dev/a.png")')).toEqual({})
  })

  test("a value is checked for what it loads the way a browser reads it", () => {
    expect(loadsNothing("url(#paint)")).toBe(true)
    expect(loadsNothing('url("#a") , url( #b )')).toBe(true)
    expect(loadsNothing("translate(4 8) rotate(45)")).toBe(true)
    expect(loadsNothing("M0 0 L10 10")).toBe(true)
    expect(loadsNothing('"url(https://x.dev/a.png)"')).toBe(true)
    expect(loadsNothing("url(https://x.dev/a.svg#paint)")).toBe(false)
    expect(loadsNothing(String.raw`u\72l(https://x.dev/a.svg#paint)`)).toBe(false)
    expect(loadsNothing(String.raw`\75 rl(https://x.dev/a.svg#paint)`)).toBe(false)
    expect(loadsNothing('url("#a) url(https://x.dev/b.svg#p")')).toBe(true)
    expect(loadsNothing('url("#a") url(https://x.dev/b.svg#p)')).toBe(false)
    expect(loadsNothing("image-set('https://x.dev/c.png' 1x), auto")).toBe(false)
    expect(loadsNothing("url(#a")).toBe(false)
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
