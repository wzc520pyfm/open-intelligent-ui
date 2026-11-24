import { isDark, luminance } from "./color"
import type { Design, MotionToken, TypographyToken } from "./design"

export interface DesignCssOptions {
  /** Selector of the element the variables are set on. */
  selector: string
}

type Fallback = string | ((resolved: Map<string, string>) => string)

interface ColorRole {
  role: string
  /** Token names that fill this role, most specific first. */
  from: string[]
  fallback: Fallback
}

const mix = (a: string, percent: number, b: string) =>
  `color-mix(in oklab, var(--iui-color-${a}) ${percent}%, var(--iui-color-${b}))`

/**
 * The colors every surface can rely on, whatever names a DESIGN.md uses.
 * A role takes the first token it finds; otherwise it is derived.
 */
const COLOR_ROLES: ColorRole[] = [
  {
    role: "background",
    from: ["background", "canvas", "bg", "neutral", "surface"],
    fallback: "#ffffff",
  },
  {
    role: "foreground",
    from: ["foreground", "on-background", "on-surface", "text", "ink", "on-neutral"],
    fallback: (resolved) =>
      isDark(resolved.get("background")) ? "#f4f4f5" : "#18181b",
  },
  {
    role: "surface",
    from: ["surface", "surface-container", "card", "surface-bright"],
    fallback: "var(--iui-color-background)",
  },
  {
    role: "muted",
    from: [
      "muted",
      "surface-secondary",
      "surface-container-low",
      "surface-variant",
      "surface-container-high",
      "subtle",
    ],
    fallback: mix("foreground", 6, "background"),
  },
  {
    role: "muted-foreground",
    from: [
      "muted-foreground",
      "on-surface-variant",
      "text-secondary",
      "text-muted",
      "on-muted",
    ],
    fallback: mix("foreground", 62, "background"),
  },
  {
    role: "border",
    from: ["border", "outline-variant", "outline", "divider", "stroke"],
    fallback: mix("foreground", 14, "background"),
  },
  {
    role: "primary",
    from: ["primary", "brand", "accent", "tertiary"],
    fallback: "var(--iui-color-foreground)",
  },
  {
    role: "primary-foreground",
    from: ["primary-foreground", "on-primary"],
    fallback: (resolved) => contrastWith(resolved.get("primary"), resolved),
  },
  {
    role: "accent",
    from: ["accent", "tertiary", "secondary"],
    fallback: "var(--iui-color-primary)",
  },
  {
    role: "accent-foreground",
    from: ["accent-foreground", "on-accent", "on-tertiary", "on-secondary"],
    fallback: (resolved) => contrastWith(resolved.get("accent"), resolved),
  },
  {
    role: "secondary",
    from: ["secondary"],
    fallback: "var(--iui-color-muted-foreground)",
  },
  { role: "success", from: ["success", "positive"], fallback: "#16a34a" },
  { role: "warning", from: ["warning", "caution"], fallback: "#d97706" },
  {
    role: "danger",
    from: ["danger", "error", "destructive", "negative", "critical"],
    fallback: "#dc2626",
  },
  { role: "info", from: ["info", "informative"], fallback: "#2563eb" },
  { role: "ring", from: ["ring", "focus"], fallback: "var(--iui-color-primary)" },
  { role: "chart-1", from: ["chart-1"], fallback: "var(--iui-color-primary)" },
  {
    role: "chart-2",
    from: ["chart-2"],
    fallback: (resolved) =>
      resolved.get("accent") === resolved.get("primary")
        ? mix("primary", 50, "background")
        : "var(--iui-color-accent)",
  },
  { role: "chart-3", from: ["chart-3"], fallback: "var(--iui-color-info)" },
  { role: "chart-4", from: ["chart-4"], fallback: "var(--iui-color-success)" },
  { role: "chart-5", from: ["chart-5"], fallback: "var(--iui-color-warning)" },
  { role: "chart-6", from: ["chart-6"], fallback: "var(--iui-color-danger)" },
]

/** Names every surface can use for `color`, `background` and `border`. */
export const COLOR_ROLE_NAMES = COLOR_ROLES.map((item) => item.role)

/**
 * Whether a design's `muted` is a color for text. Some designs give the
 * name to quiet text, others to a quiet background. A background sits
 * close to the page; text has to stand off from it to be read.
 */
function mutedIsText(colors: Record<string, string>): boolean {
  if (!Object.hasOwn(colors, "muted") || Object.hasOwn(colors, "muted-foreground")) return false
  const muted = luminance(colors.muted)
  const page = luminance(colors.background ?? colors.canvas ?? colors.bg ?? "#ffffff")
  if (muted === null || page === null) return false
  // The cube root is close to how light a color looks.
  return Math.abs(Math.cbrt(muted) - Math.cbrt(page)) > 0.25
}

/**
 * Which of a design's color tokens fills each role, and which tokens are
 * `shadowed`: named like a role that another token fills, so the name
 * means the role and the token can't be reached by it.
 */
export function colorSources(design: Pick<Design, "colors" | "roles">): {
  sources: Map<string, string>
  shadowed: Set<string>
} {
  const { colors, roles } = design
  const has = (name: string | undefined): name is string => name !== undefined && Object.hasOwn(colors, name)
  const text = mutedIsText(colors)
  const sources = new Map<string, string>()
  for (const { role, from } of COLOR_ROLES) {
    const chosen = roles?.[role]
    if (has(chosen)) {
      sources.set(role, chosen)
      continue
    }
    const candidates = text
      ? role === "muted"
        ? from.filter((name) => name !== "muted")
        : role === "muted-foreground"
          ? [...from, "muted"]
          : from
      : from
    let source = candidates.find(has)
    if (source === undefined && role.endsWith("-foreground")) {
      // The text for a role comes with the token that fills the role: `accent-foreground` for `accent`.
      const filled = sources.get(role.slice(0, -"-foreground".length))
      source = [`${filled}-foreground`, `on-${filled}`].find(has)
    }
    if (source !== undefined) sources.set(role, source)
  }
  const shadowed = new Set<string>()
  for (const role of COLOR_ROLE_NAMES) {
    if (has(role) && sources.get(role) !== role) shadowed.add(role)
  }
  return { sources, shadowed }
}

const TYPOGRAPHY_ROLES: [role: string, from: string[]][] = [
  ["body", ["body-md", "body", "body-medium", "paragraph", "base", "body-lg"]],
  ["small", ["body-sm", "caption", "small", "body-small", "label-sm"]],
  ["label", ["label-md", "label", "label-medium", "label-lg", "button"]],
  ["display", ["headline-display", "display", "display-lg", "display-md", "hero"]],
  ["h1", ["headline-lg", "h1", "heading-1", "headline-large", "headline", "title-lg"]],
  ["h2", ["headline-md", "h2", "heading-2", "headline-medium", "title-lg"]],
  ["h3", ["headline-sm", "h3", "heading-3", "headline-small", "title-md", "title"]],
  ["h4", ["title-sm", "h4", "heading-4", "title-small", "label-lg"]],
  ["code", ["code", "mono", "code-md", "label-mono"]],
]

const RADIUS_SCALE: [name: string, ratio: number][] = [
  ["sm", 0.6],
  ["md", 1],
  ["lg", 1.5],
  ["xl", 2.2],
]

const SPACING_DEFAULTS: [name: string, units: number][] = [
  ["xs", 1],
  ["sm", 2],
  ["md", 4],
  ["lg", 6],
  ["xl", 8],
  ["2xl", 12],
]

const MOTION_DEFAULTS: Record<string, Required<MotionToken>> = {
  "state-change": {
    duration: "120ms",
    delay: "0ms",
    timingFunction: "cubic-bezier(0.2, 0, 0, 1)",
  },
  "surface-enter": {
    duration: "260ms",
    delay: "0ms",
    timingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
  },
  "surface-exit": {
    duration: "160ms",
    delay: "0ms",
    timingFunction: "cubic-bezier(0.4, 0, 1, 1)",
  },
  layout: {
    duration: "320ms",
    delay: "0ms",
    timingFunction: "cubic-bezier(0.2, 0, 0, 1)",
  },
  emphasis: {
    duration: "520ms",
    delay: "0ms",
    timingFunction: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  },
  /** `duration` is the pause between one item and the next. */
  stagger: { duration: "40ms", delay: "0ms", timingFunction: "linear" },
}

const SERIF = /serif|georgia|garamond|times|playfair|merriweather|lora|fraunces|newsreader|baskerville|caslon|didot|bodoni/i
const MONO = /mono|code|courier|consolas|menlo/i

function contrastWith(
  color: string | undefined,
  resolved: Map<string, string>
): string {
  const value = luminance(color)
  if (value === null) {
    // Not a hex color we can measure: assume the surface colors contrast.
    return isDark(resolved.get("foreground")) ? "#ffffff" : "#18181b"
  }
  return value < 0.4 ? "#ffffff" : "#18181b"
}

function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase()
}

export function fontStack(family: string): string {
  if (family.includes(",")) return family
  const name = /^["'].*["']$/.test(family) ? family : `"${family}"`
  if (MONO.test(family)) {
    return `${name}, ui-monospace, "SF Mono", Menlo, Consolas, monospace`
  }
  if (SERIF.test(family) && !/sans/i.test(family)) {
    return `${name}, ui-serif, Georgia, serif`
  }
  return `${name}, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`
}

function typographyDeclarations(token: TypographyToken): string[] {
  const out: string[] = []
  if (token.fontFamily) out.push(`font-family: ${fontStack(token.fontFamily)}`)
  if (token.fontSize) out.push(`font-size: ${token.fontSize}`)
  if (token.fontWeight) out.push(`font-weight: ${token.fontWeight}`)
  if (token.lineHeight) out.push(`line-height: ${token.lineHeight}`)
  if (token.letterSpacing) out.push(`letter-spacing: ${token.letterSpacing}`)
  if (token.fontFeature) out.push(`font-feature-settings: ${token.fontFeature}`)
  if (token.fontVariation) {
    out.push(`font-variation-settings: ${token.fontVariation}`)
  }
  return out
}

function typographyVariables(prefix: string, token: TypographyToken): string[] {
  const out: string[] = []
  if (token.fontFamily) out.push(`${prefix}-family: ${fontStack(token.fontFamily)}`)
  if (token.fontSize) out.push(`${prefix}-size: ${token.fontSize}`)
  if (token.fontWeight) out.push(`${prefix}-weight: ${token.fontWeight}`)
  if (token.lineHeight) out.push(`${prefix}-line: ${token.lineHeight}`)
  if (token.letterSpacing) out.push(`${prefix}-tracking: ${token.letterSpacing}`)
  return out
}

const COMPONENT_PROPERTIES: Record<string, string> = {
  backgroundColor: "background",
  textColor: "color",
  rounded: "radius",
}

/**
 * Turns a DESIGN.md into CSS custom properties.
 *
 * - `--iui-color-<name>` for every color token, plus the roles in
 *   `COLOR_ROLE_NAMES`, which always exist.
 * - `--iui-font-<role>-family|size|weight|line|tracking` for text roles, and a
 *   `[data-type="<level>"]` rule for every typography level.
 * - `--iui-radius-<name>`, `--iui-space-<name>` and `--iui-space-unit`.
 * - `--iui-motion-<name>-duration|delay|easing`.
 * - `--iui-c-<component>-<property>` for component tokens.
 */
export function designToCss(design: Design, options: DesignCssOptions): string {
  const { selector } = options
  const base: string[] = []
  const rules: string[] = []

  // Colors
  const resolved = new Map<string, string>()
  const { sources, shadowed } = colorSources(design)
  for (const [name, value] of Object.entries(design.colors)) {
    if (!shadowed.has(name)) base.push(`--iui-color-${kebab(name)}: ${value}`)
  }
  for (const { role, fallback } of COLOR_ROLES) {
    const source = sources.get(role)
    if (source !== undefined) {
      resolved.set(role, design.colors[source] as string)
      if (source !== role) {
        // A shadowed token has no variable of its own to point at.
        base.push(
          shadowed.has(source)
            ? `--iui-color-${role}: ${design.colors[source]}`
            : `--iui-color-${role}: var(--iui-color-${kebab(source)})`
        )
      }
      continue
    }
    const value = typeof fallback === "function" ? fallback(resolved) : fallback
    const reference = /^var\(--iui-color-([a-z0-9-]+)\)$/.exec(value)
    resolved.set(role, reference ? (resolved.get(reference[1] as string) ?? value) : value)
    base.push(`--iui-color-${role}: ${value}`)
  }
  base.push(`color-scheme: ${isDark(resolved.get("background")) ? "dark" : "light"}`)

  // Typography
  for (const [role, from] of TYPOGRAPHY_ROLES) {
    const source = from.find((name) => Object.hasOwn(design.typography, name))
    if (source === undefined) continue
    const token = design.typography[source] as TypographyToken
    base.push(...typographyVariables(`--iui-font-${role}`, token))
  }
  const family = (role: string) => {
    const [, from] = TYPOGRAPHY_ROLES.find(([name]) => name === role) ?? []
    const source = from?.find((name) => design.typography[name]?.fontFamily)
    return source ? design.typography[source]?.fontFamily : undefined
  }
  const sans = family("body")
  const heading = family("h1") ?? family("display") ?? family("h2")
  const mono = family("code")
  if (sans) base.push(`--iui-font-sans: ${fontStack(sans)}`)
  if (heading) base.push(`--iui-font-heading: ${fontStack(heading)}`)
  if (mono) base.push(`--iui-font-mono: ${fontStack(mono)}`)
  for (const [name, token] of Object.entries(design.typography)) {
    const declarations = typographyDeclarations(token)
    if (declarations.length === 0) continue
    rules.push(
      `${selector} [data-type="${kebab(name)}"] { ${declarations.join("; ")}; }`
    )
  }

  // Radius
  for (const [name, value] of Object.entries(design.rounded)) {
    base.push(`--iui-radius-${kebab(name)}: ${value}`)
  }
  const anchor = RADIUS_SCALE.find(([name]) => Object.hasOwn(design.rounded, name))
  for (const [name, ratio] of RADIUS_SCALE) {
    if (Object.hasOwn(design.rounded, name)) continue
    if (anchor) {
      const factor = Number((ratio / anchor[1]).toFixed(3))
      base.push(`--iui-radius-${name}: calc(var(--iui-radius-${anchor[0]}) * ${factor})`)
    } else {
      base.push(`--iui-radius-${name}: ${Math.round(ratio * 10)}px`)
    }
  }
  if (!Object.hasOwn(design.rounded, "none")) base.push("--iui-radius-none: 0px")
  if (!Object.hasOwn(design.rounded, "full")) base.push("--iui-radius-full: 9999px")

  // Spacing
  const unit = design.spacing.unit ?? "4px"
  if (!Object.hasOwn(design.spacing, "unit")) base.push(`--iui-space-unit: ${unit}`)
  for (const [name, value] of Object.entries(design.spacing)) {
    base.push(`--iui-space-${kebab(name)}: ${value}`)
  }
  for (const [name, units] of SPACING_DEFAULTS) {
    if (Object.hasOwn(design.spacing, name)) continue
    base.push(`--iui-space-${name}: calc(var(--iui-space-unit) * ${units})`)
  }

  // Motion
  const motion: Record<string, MotionToken> = { ...MOTION_DEFAULTS }
  for (const [name, token] of Object.entries(design.motion)) {
    motion[name] = { ...MOTION_DEFAULTS[name], ...token }
  }
  for (const [name, token] of Object.entries(motion)) {
    const prefix = `--iui-motion-${kebab(name)}`
    base.push(`${prefix}-duration: ${token.duration ?? "200ms"}`)
    base.push(`${prefix}-delay: ${token.delay ?? "0ms"}`)
    base.push(`${prefix}-easing: ${token.timingFunction ?? "ease"}`)
  }

  // Components
  for (const [name, component] of Object.entries(design.components)) {
    for (const [key, value] of Object.entries(component)) {
      const prefix = `--iui-c-${kebab(name)}`
      if (typeof value === "string") {
        base.push(`${prefix}-${COMPONENT_PROPERTIES[key] ?? kebab(key)}: ${value}`)
      } else {
        base.push(
          ...typographyVariables(`${prefix}-font`, value).map((line) =>
            line.replace("-font-line:", "-line-height:").replace("-font-tracking:", "-letter-spacing:")
          )
        )
      }
    }
  }

  const block = (target: string, lines: string[]) =>
    `${target} {\n${lines.map((line) => `  ${line};`).join("\n")}\n}`
  const out = [block(selector, base)]

  const dark = Object.entries(design.darkColors)
    .filter(([name]) => !shadowed.has(name))
    .map(([name, value]) => `--iui-color-${kebab(name)}: ${value}`)
  if (Object.keys(design.darkColors).length) {
    // Roles derived from measured colors have to be measured again.
    const darkResolved = new Map<string, string>()
    for (const { role, fallback } of COLOR_ROLES) {
      const source = sources.get(role)
      if (source !== undefined) {
        const value = design.darkColors[source]
        darkResolved.set(role, value ?? (design.colors[source] as string))
        if (value !== undefined && source !== role && shadowed.has(source)) {
          dark.push(`--iui-color-${role}: ${value}`)
        }
        continue
      }
      const value =
        typeof fallback === "function" ? fallback(darkResolved) : fallback
      const reference = /^var\(--iui-color-([a-z0-9-]+)\)$/.exec(value)
      darkResolved.set(
        role,
        reference ? (darkResolved.get(reference[1] as string) ?? value) : value
      )
      if (typeof fallback === "function" && value !== fallback(resolved)) {
        dark.push(`--iui-color-${role}: ${value}`)
      }
    }
  }
  if (dark.length) {
    dark.push("color-scheme: dark")
    out.push(block(`${selector}[data-iui-scheme="dark"]`, dark))
    out.push(
      `@media (prefers-color-scheme: dark) {\n${block(
        `${selector}[data-iui-scheme="auto"]`,
        dark
      )}\n}`
    )
  }
  out.push(...rules)
  return out.join("\n")
}
