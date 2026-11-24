import { describe, expect, test } from "vitest"
import {
  colorSources,
  defineLibrary,
  describeDesignTokens,
  designFromCss,
  designToCss,
  librarySpec,
  luminance,
  parseDesign,
  validateLibrary,
} from "../src"
import { buildSystemPrompt } from "../src/prompt"
// HeroUI's DESIGN.md as HeroUI publishes it: no token YAML, its variables in a table.
import HEROUI from "../../../design/third-party/heroui.DESIGN.md?raw"

const css = (design: Parameters<typeof designToCss>[0]) => designToCss(design, { selector: ".x" })

describe("a DESIGN.md written for another library", () => {
  const design = parseDesign(HEROUI)

  test("is read for the CSS variables it documents, in both schemes", () => {
    expect(design.name).toBe("HeroUI Default Theme")
    expect(design.source).toBe("css-variables")
    expect(design.colors).toMatchObject({
      background: "oklch(0.9702 0 0)",
      foreground: "oklch(0.2103 0.0059 285.89)",
      // A value that names another token takes that token's value.
      surface: "white",
      "surface-foreground": "oklch(0.2103 0.0059 285.89)",
      accent: "oklch(0.6204 0.195 253.83)",
      border: "oklch(90% 0.004 286.32)",
      // "black at 50%".
      backdrop: "color-mix(in srgb, black 50%, transparent)",
    })
    expect(design.darkColors).toMatchObject({
      background: "oklch(12% 0.005 285.823)",
      "surface-foreground": "oklch(0.9911 0 0)",
      warning: "oklch(0.8203 0.1388 76.34)",
    })
    // "same as light" is no override.
    expect(design.darkColors.accent).toBeUndefined()
    expect(design.darkColors.success).toBeUndefined()
    // `--radius: 0.5rem` and `--spacing: 0.25rem`, given in the prose.
    expect(design.rounded).toEqual({ md: "0.5rem", field: "calc(0.5rem * 1.5)" })
    expect(design.spacing).toEqual({ unit: "0.25rem" })
  })

  test("says which colors it only names", () => {
    expect(design.issues).toContain('--accent-foreground: "snow" refers to something this design gives no value for')
    expect(design.colors["accent-foreground"]).toBeUndefined()
  })

  test("fills the roles from its own vocabulary", () => {
    const sheet = css(design)
    // Its `muted` is a color for text, so it is the muted foreground, and a quiet surface is the muted background.
    expect(sheet).toContain("--iui-color-muted-foreground: oklch(0.5517 0.0138 285.94);")
    expect(sheet).toContain("--iui-color-muted: var(--iui-color-surface-secondary);")
    expect(sheet).not.toContain("--iui-color-muted: oklch(0.5517")
    expect(sheet).toContain("--iui-color-primary: var(--iui-color-accent);")
    // Light text on its blue, measured from oklch.
    expect(sheet).toContain("--iui-color-primary-foreground: #ffffff;")
    expect(sheet).toContain("color-scheme: light;")
    expect(sheet).toContain("--iui-radius-md: 0.5rem;")
    expect(sheet).toContain("--iui-radius-lg: calc(var(--iui-radius-md) * 1.5);")
    expect(sheet).toContain("--iui-space-unit: 0.25rem;")
    const dark = sheet.slice(sheet.indexOf('[data-iui-scheme="dark"]'))
    expect(dark).toContain("--iui-color-background: oklch(12% 0.005 285.823);")
    expect(dark).toContain("--iui-color-muted-foreground: oklch(70.5% 0.015 286.067);")
    expect(dark).toContain("color-scheme: dark;")
  })

  test("options name what it leaves out, and keep another library's setup from the model", () => {
    const tidy = parseDesign(HEROUI, {
      tokens: {
        colors: { eclipse: "oklch(0.2103 0.0059 285.89)", snow: "oklch(0.9911 0 0)" },
        motion: { "surface-enter": { duration: "200ms" } },
      },
      roles: { muted: "default" },
      prose: { omit: ["Setup", /^source of truth$/i] },
    })
    expect(tidy.issues).toEqual([])
    expect(tidy.colors["accent-foreground"]).toBe("oklch(0.9911 0 0)")
    expect(tidy.darkColors["field-background"]).toBe("oklch(0.2103 0.0059 285.89)")
    expect(tidy.motion["surface-enter"]).toEqual({ duration: "200ms" })
    expect(tidy.prose).not.toContain("@import")
    expect(tidy.prose).not.toContain("## Setup")
    expect(tidy.prose).not.toContain("Source of Truth")
    expect(tidy.prose).toContain("## Design Direction")
    expect(tidy.prose).toContain("## Colors")
    const sheet = css(tidy)
    expect(sheet).toContain("--iui-color-muted: var(--iui-color-default);")
    // The text that goes with the token that fills a role.
    expect(sheet).toContain("--iui-color-primary-foreground: var(--iui-color-accent-foreground);")
    expect(sheet).toContain("--iui-motion-surface-enter-duration: 200ms;")

    const rewritten = parseDesign(HEROUI, { prose: (prose) => prose.split("\n## ")[0] as string })
    expect(rewritten.prose.startsWith("# HeroUI Default Theme")).toBe(true)
    expect(rewritten.prose).not.toContain("## ")
  })

  test("a role that isn't one, or a token the design lacks, is reported and not used", () => {
    const wrong = parseDesign(HEROUI, { roles: { muted: "nowhere", banner: "accent" } })
    expect(wrong.roles).toBeUndefined()
    expect(wrong.issues).toContain("roles.muted: the design has no color named nowhere")
    expect(wrong.issues).toContain("roles.banner is not a role")
  })

  test("the prompt lists the tokens that exist here and sets the other library's words aside", () => {
    const prompt = buildSystemPrompt({ design })
    expect(prompt).toContain("# Design system: HeroUI Default Theme")
    expect(prompt).toContain("accent (oklch(0.6204 0.195 253.83))")
    expect(prompt).toContain("muted-foreground is the design's `muted`")
    // The name means the role here, so the token is not offered under it.
    expect(prompt).not.toContain("muted (oklch(0.5517")
    expect(prompt).toContain("This guidance was written for another component library.")
    expect(prompt).toContain("Use one strong accent for primary actions")
    // A design written to the format gets no such note.
    expect(buildSystemPrompt({})).not.toContain("written for another component library")
  })

  test("travels in a library, as written or as read", () => {
    const tidy = parseDesign(HEROUI, { prose: { omit: ["Setup"] } })
    const spec = JSON.parse(JSON.stringify(librarySpec(defineLibrary({ design: tidy }))))
    expect(buildSystemPrompt({ library: spec })).toBe(buildSystemPrompt({ design: tidy }))
    expect(buildSystemPrompt({ library: defineLibrary({ design: HEROUI }) })).toBe(buildSystemPrompt({ design: HEROUI }))
    expect(validateLibrary(defineLibrary({ design: HEROUI })).filter((issue) => issue.startsWith("design:"))).toHaveLength(7)
    expect(validateLibrary(defineLibrary({ design: "# Notes\n\nNo tokens here." }))).toEqual([
      "design: no color tokens were found, so the built-in colors are used",
    ])
  })
})

describe("a file with token YAML", () => {
  test("is read from the YAML alone, whatever its tables say", () => {
    const design = parseDesign(
      '---\ncolors:\n  primary: "#112233"\n---\n\n| Variable | Light |\n| --- | --- |\n| `--primary` | `#ff0000` |\n\nThe base is `--radius: 2px`.'
    )
    expect(design.source).toBe("tokens")
    expect(design.colors).toEqual({ primary: "#112233" })
    expect(design.rounded).toEqual({})
  })

  test("takes the same options", () => {
    const design = parseDesign('---\ncolors:\n  ink: "#111111"\n  paper: "#fafafa"\n  brand: "#0055ff"\n---\n\n## Use\n\nBe brief.\n\n## Install\n\nnpm i x', {
      tokens: { colors: { brand: "#ff5500", dark: { paper: "#101010" } }, rounded: { md: "2px" } },
      roles: { background: "paper", foreground: "ink" },
      prose: { omit: ["install"] },
    })
    expect(design.colors.brand).toBe("#ff5500")
    expect(design.darkColors).toEqual({ paper: "#101010" })
    expect(design.prose).toBe("## Use\n\nBe brief.")
    const sheet = css(design)
    expect(sheet).toContain("--iui-color-background: var(--iui-color-paper);")
    expect(sheet).toContain("--iui-color-foreground: var(--iui-color-ink);")
    expect(sheet).toContain("--iui-radius-md: 2px;")
  })
})

describe("a design in a Markdown table", () => {
  test("values that could load something or leave the declaration are refused", () => {
    const design = parseDesign(
      [
        "| Token | Value |",
        "| --- | --- |",
        "| `--background` | `#ffffff` |",
        "| `--accent` | `color-mix(in srgb, url(https://x.dev/a.png) 50%, red)` |",
        "| `--danger` | `rgb(0 0 0); } body { display: none` |",
        "| `--radius` | `4px; background: url(https://x.dev)` |",
      ].join("\n")
    )
    expect(design.colors).toEqual({ background: "#ffffff" })
    expect(design.rounded).toEqual({})
    expect(css(design)).not.toContain("url(")
  })

  test("a table without a column of variables is left alone", () => {
    const design = parseDesign("| Role | Light |\n| --- | --- |\n| Canvas | `#ffffff` |")
    expect(design.colors).toEqual({})
    expect(design.source).toBeUndefined()
  })
})

describe("designFromCss", () => {
  const THEME = `
@import "tailwindcss";
@custom-variant dark (&:is(.dark *));

:root {
  /* the page */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: var(--background);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --radius: 0.625rem;
  --sidebar-width: 16rem;
  --hero: url(https://x.dev/hero.png);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --border: oklch(1 0 0 / 10%);
}

@theme inline {
  --color-brand: #0055ff;
  --radius-lg: var(--radius);
  --radius-sm: calc(var(--radius) - 4px);
  --font-sans: "Inter", sans-serif;
  --font-mono: "JetBrains Mono";
  --spacing: 0.25rem;
  --spacing-4: 1rem;
}

.card { color: var(--foreground); --not-a-token: 1; }
`

  test("reads a theme stylesheet: :root and @theme for light, .dark for dark", () => {
    const design = designFromCss(THEME, { name: "Acme", prose: "Lead with the number." })
    expect(design.name).toBe("Acme")
    expect(design.source).toBe("css-variables")
    expect(design.issues).toEqual([])
    expect(design.colors).toEqual({
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      primary: "oklch(0.205 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
      border: "oklch(0.922 0 0)",
      "chart-1": "oklch(0.646 0.222 41.116)",
      brand: "#0055ff",
    })
    expect(design.darkColors).toEqual({
      background: "oklch(0.145 0 0)",
      foreground: "oklch(0.985 0 0)",
      primary: "oklch(0.922 0 0)",
      "primary-foreground": "oklch(0.205 0 0)",
      border: "oklch(1 0 0 / 10%)",
      // `--card` follows `--background` into the dark scheme.
      card: "oklch(0.145 0 0)",
    })
    expect(design.rounded).toEqual({ md: "0.625rem", lg: "0.625rem", sm: "calc(0.625rem - 4px)" })
    expect(design.spacing).toEqual({ unit: "0.25rem" })
    expect(design.typography).toEqual({
      body: { fontFamily: '"Inter", sans-serif' },
      code: { fontFamily: '"JetBrains Mono"' },
    })
    expect(design.prose).toBe("Lead with the number.")

    const sheet = css(design)
    // Here `muted` is a background, as its own foreground says.
    expect(sheet).toContain("--iui-color-muted: oklch(0.97 0 0);")
    expect(sheet).toContain("--iui-color-danger: var(--iui-color-destructive);")
    expect(sheet).toContain("--iui-color-surface: var(--iui-color-card);")
    expect(sheet).toContain('--iui-font-sans: "Inter", sans-serif;')
    expect(sheet).not.toContain("url(")
    expect(buildSystemPrompt({ design })).toContain("Lead with the number.")
  })

  test("reads the bare HSL triples older themes keep, and a dark media query", () => {
    const design = designFromCss(`
      :root { --background: 0 0% 100%; --primary: 222.2 47.4% 11.2%; --ring: 215 20.2% 65.1% / 0.5; }
      @media (prefers-color-scheme: dark) { :root { --background: 224 71% 4%; } }
      [data-theme="dark"] { --primary: 210 40% 98%; }
      .darker { --primary: red; }
    `)
    expect(design.colors).toEqual({
      background: "hsl(0 0% 100%)",
      primary: "hsl(222.2 47.4% 11.2%)",
      ring: "hsl(215 20.2% 65.1% / 0.5)",
    })
    expect(design.darkColors).toEqual({ background: "hsl(224 71% 4%)", primary: "hsl(210 40% 98%)" })
    expect(css(design)).toContain("--iui-color-primary-foreground: #ffffff;")
  })

  test("a variable that points nowhere is not a token; one that should have been is reported", () => {
    const design = designFromCss(":root { --radius: var(--missing); --tw-shadow: var(--tw-other); --color-brand: var(--nope, #123456); }")
    expect(design.rounded).toEqual({})
    expect(design.colors).toEqual({ brand: "#123456" })
    expect(design.issues).toEqual(['--radius: "var(--missing)" refers to something this design gives no value for'])
  })

  test("takes roles and tokens like parseDesign, and never throws on what isn't CSS", () => {
    const design = designFromCss(":root { --ink: #111; --paper: #fff; }", {
      roles: { foreground: "ink", background: "paper" },
      tokens: { colors: { accent: "#0055ff" } },
    })
    expect(colorSources(design).sources.get("foreground")).toBe("ink")
    expect(design.colors.accent).toBe("#0055ff")
    expect(designFromCss("}}}{ not css ((( --x: ;").colors).toEqual({})
    expect(designFromCss(undefined as unknown as string).colors).toEqual({})
  })
})

describe("color roles", () => {
  test("a `muted` that reads as text fills the muted foreground, in a dark design too", () => {
    const dark = parseDesign('---\ncolors:\n  background: "#0b0d12"\n  foreground: "#f4f4f5"\n  muted: "#9ca3af"\n---')
    expect(colorSources(dark).sources.get("muted-foreground")).toBe("muted")
    expect(colorSources(dark).shadowed.has("muted")).toBe(true)
    const quiet = parseDesign('---\ncolors:\n  background: "#ffffff"\n  foreground: "#111111"\n  muted: "#f1f5f9"\n---')
    expect(colorSources(quiet).sources.get("muted")).toBe("muted")
    expect(colorSources(quiet).shadowed.size).toBe(0)
    expect(describeDesignTokens(quiet)).not.toContain("Color roles filled")
  })

  test("luminance is read from the notations themes are written in", () => {
    expect(luminance("#ffffff")).toBeCloseTo(1, 3)
    expect(luminance("black")).toBe(0)
    expect(luminance("rgb(255 255 255 / 50%)")).toBeCloseTo(1, 3)
    expect(luminance("rgba(0, 0, 0, 0.5)")).toBe(0)
    expect(luminance("hsl(0 0% 100%)")).toBeCloseTo(1, 3)
    expect(luminance("hsl(220, 90%, 20%)")).toBeLessThan(0.1)
    expect(luminance("oklch(1 0 0)")).toBeCloseTo(1, 2)
    expect(luminance("oklch(12% 0.005 285.823)")).toBeLessThan(0.02)
    // The same blue, written two ways.
    expect(luminance("oklch(0.6204 0.195 253.83)")).toBeCloseTo(luminance("#0b82f0") as number, 1)
    expect(luminance("oklab(0.5 0 0)")).toBeCloseTo(0.125, 2)
    expect(luminance("color-mix(in srgb, red, blue)")).toBeNull()
    expect(luminance("var(--x)")).toBeNull()
    expect(luminance(undefined)).toBeNull()
  })
})
