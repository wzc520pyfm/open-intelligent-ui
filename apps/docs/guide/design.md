# Design

A design is a [DESIGN.md](https://github.com/google-labs-code/design.md): tokens for color, type, radius, spacing and motion, followed by prose that says how to use them. The renderer turns the tokens into CSS variables for the surface. The prompt gives the model the same tokens and the prose. One file decides how every reply looks.

## The designs that come with the package

Four complete designs are included, each with light and dark colors. Switch between them on the example; the markup doesn't change.

```iui live designs
<state range="month" rows={[
  { week: "W1", orders: 124 }, { week: "W2", orders: 151 }, { week: "W3", orders: 139 }, { week: "W4", orders: 182 }
]} />

<row gap={3} wrap>
  <title level={2}>Orders</title>
  <spacer />
  <SegmentedControl aria-label="Range" bind:value={range}>
    <SegmentedControlIndicator />
    <SegmentedControlItem value="week">Week</SegmentedControlItem>
    <SegmentedControlItem value="month">Month</SegmentedControlItem>
  </SegmentedControl>
</row>

<grid columns={3} gap={3}>
  <Stat label="Orders" value={sumBy(rows, "orders")} delta={0.12} caption="vs last month" />
  <Stat label="Average order" value={84.5} format="currency" delta={-0.03} />
  <card padding={4} gap={2}>
    <text size="sm" color="muted">Status</text>
    <row gap={2} wrap><badge color="success">On track</badge><badge color="warning">2 late</badge><badge color="danger">1 failed</badge></row>
    <row gap={2}><Button variant="solid">Review</Button><Button>Export</Button></row>
  </card>
</grid>

<card padding={4}>
  <Chart type="area" data={rows} x="week" y="orders" height={160} aria-label="Orders per week" />
</card>
```

| Design | Character |
| --- | --- |
| `paper` | The default. Quiet and neutral: content first, one accent, soft depth |
| `noir` | Dark first, for showcase surfaces: deep charcoal, luminous blue, generous radii |
| `heritage` | Editorial: serif headlines, cream paper, one terracotta accent, square corners |
| `signal` | Dense and technical, for operations surfaces: mono labels, a lime signal color |

```ts
import { noir } from "@open-intelligent-ui/core/designs"

<IntelligentUI source={text} design={noir} scheme="auto" />

buildSystemPrompt({ design: noir })
```

With no `design`, Paper is used. `scheme` is `light`, `dark` or `auto`, which follows the system.

## Your own DESIGN.md

Write the tokens as YAML at the top of the file and the guidance as Markdown below.

```md
---
name: Acme
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
    success: "#17834a"
    danger: "#d1343b"
    chart-1: "#2f6feb"
  dark:
    background: "#131312"
    # …
typography:
  headline-md: { fontFamily: Inter, fontSize: 1.3125rem, fontWeight: 600, lineHeight: 1.3 }
  body-md: { fontFamily: Inter, fontSize: 0.9375rem, fontWeight: 400, lineHeight: 1.6 }
rounded: { sm: 6px, md: 8px, lg: 12px }
spacing: { unit: 4px }
motion:
  surface-enter: { duration: 260ms, timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }
  emphasis: { duration: 520ms, timingFunction: "cubic-bezier(0.34, 1.4, 0.64, 1)" }
---

## Colors

Accent is for the one action that matters on a surface. Status colors are only for status.
```

```tsx
import design from "./acme.DESIGN.md?raw"

<IntelligentUI source={text} design={design} />
```

What the renderer reads:

| Tokens | Become |
| --- | --- |
| `colors` | `--iui-color-<name>`. The roles the stylesheet uses are `background`, `surface`, `foreground`, `muted`, `muted-foreground`, `border`, `primary`, `accent`, `success`, `warning`, `danger`, `info` and `chart-1` to `chart-6`, each with an `on-` pair |
| `typography` | `--iui-font-<role>-family`, `-size`, `-weight`, `-line` and `-tracking`, used by `<title>`, `<text>` and `variant="<name>"` |
| `rounded`, `spacing` | `--iui-radius-*`, `--iui-space-*` |
| `motion` | `--iui-motion-<name>-duration` and `-easing`, used by every entrance, exit and transition |
| `components` | `--iui-c-<component>-*`, for example the primary button's colors |

Fonts named in the design are used if the page has them. Load them yourself; the renderer doesn't fetch fonts. `pnpm design:lint` in the repository checks a file with the DESIGN.md CLI.

## A DESIGN.md written for another library

A company's design system often already has a DESIGN.md, written for its own component library. It usually has no token YAML, its color names mean something different, and its prose talks about another library's classes.

**Pass it as it is.** When the file has no token YAML, its tokens are read from the CSS variables it documents: tables of variables with light and dark values, inline `--name: value`, and `css` blocks. HeroUI's published DESIGN.md is read this way unchanged, and the playground has it in its design menu.

```ts
import heroui from "./heroui.DESIGN.md?raw"

defineLibrary({ design: heroui })
```

**Adjust what it leaves open.** `parseDesign` takes options and returns a design you pass in place of the text.

```ts
import { parseDesign } from "@open-intelligent-ui/core"

const design = parseDesign(heroui, {
  // Laid over the file's tokens: what it leaves out, or a color it only names.
  tokens: {
    colors: { snow: "oklch(0.9911 0 0)" },
    motion: { emphasis: { duration: "420ms", easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" } },
  },
  // Which of the design's colors fills which role, when the names differ.
  roles: { primary: "accent", "muted-foreground": "muted" },
  // Sections the model shouldn't read: another library's install steps.
  prose: { omit: ["Setup", "Source of Truth"] },
})
```

- **Roles.** A token with a role's name fills it. Common aliases are recognized: shadcn's `card` and `destructive`, Material's `on-primary`. Whether `muted` is a text color or a background in a given design is decided from its contrast with the page background. `colorSources(design)` returns which token each role ended up with.
- **Prose.** For a design written for another library, the prompt tells the model to take its direction on hierarchy, color, shape and tone, and that its class names and install steps don't apply here.
- **Problems.** Nothing throws. A value that can't be read, or isn't safe to write into CSS, is left out and listed in `design.issues`. `validateLibrary` reports those too.

## Only a stylesheet

With a theme stylesheet and no DESIGN.md (shadcn/ui, HeroUI, Tailwind `@theme`, your own variables), `designFromCss` reads the variables.

```ts
import { designFromCss } from "@open-intelligent-ui/core"
import theme from "./theme.css?raw"

const design = designFromCss(theme, {
  name: "Acme",
  prose: "Primary is for the one action that matters on a surface.",
})
```

Variables in `:root`, `html` and `@theme` are the light colors. Those in `.dark`, `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` are the dark ones. `oklch()`, `hsl()`, `color-mix()`, `var()` references and shadcn's bare HSL triples are understood.

## Where the design goes

Put the design in the [library](./components#one-library-two-readers) with everything else your product adds, so the renderer and the prompt can't disagree:

```ts
export const library = defineLibrary({ design, components, charts, motion })
```

The model is told to use design variables instead of fixed colors, and CSS it writes uses the same variables: `var(--iui-color-accent)`, `var(--iui-radius-md)`, `var(--iui-space-lg)`, `var(--iui-motion-layout-duration)`. A reply written under one design redraws correctly under another.
