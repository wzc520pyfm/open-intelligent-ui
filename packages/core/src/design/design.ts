import { parse as parseYaml } from "yaml"
import { readCssVariables, readMarkdownVariables, tokensFromVariables, type Variables } from "./extract"
import { COLOR_ROLE_NAMES, colorSources } from "./variables"

export interface TypographyToken {
  fontFamily?: string
  fontSize?: string
  fontWeight?: string
  lineHeight?: string
  letterSpacing?: string
  fontFeature?: string
  fontVariation?: string
}

export interface MotionToken {
  duration?: string
  delay?: string
  timingFunction?: string
}

/** A DESIGN.md file, read into tokens plus the prose that explains them. */
export interface Design {
  name?: string
  description?: string
  /** Color tokens by name. Grouped tokens are joined with `-`. */
  colors: Record<string, string>
  /** Overrides from `colors.dark`, applied in the dark scheme. */
  darkColors: Record<string, string>
  typography: Record<string, TypographyToken>
  rounded: Record<string, string>
  spacing: Record<string, string>
  motion: Record<string, MotionToken>
  /** Component tokens with references resolved. */
  components: Record<string, Record<string, string | TypographyToken>>
  /** The Markdown body: the design rationale the model reads. */
  prose: string
  /** Problems found while reading the file. */
  issues: string[]
  /**
   * Which of the design's color tokens fills a role, where the design's
   * own names don't say: `{ "muted-foreground": "muted" }`.
   */
  roles?: Record<string, string>
  /**
   * How the tokens were found: written as DESIGN.md tokens, or gathered
   * from the CSS custom properties of a design made for another library.
   */
  source?: "tokens" | "css-variables"
}

/** Token groups as a DESIGN.md writes them in its front matter. */
export interface DesignTokens {
  /** Colors by name. `dark` holds the values that differ in the dark scheme. */
  colors?: Record<string, unknown>
  typography?: Record<string, unknown>
  rounded?: Record<string, unknown>
  spacing?: Record<string, unknown>
  motion?: Record<string, unknown>
  components?: Record<string, unknown>
}

export interface DesignOptions {
  /**
   * Tokens laid over what the file declares, in the shape of its front
   * matter. The place for what a design leaves out, such as motion, and
   * for a color it only names: `{ colors: { snow: "#fcfcfc" } }`.
   */
  tokens?: DesignTokens
  /**
   * Which color token fills a role, for a design whose names mean
   * something else: `{ "muted-foreground": "muted", muted: "surface-secondary" }`.
   * The roles are `COLOR_ROLE_NAMES`.
   */
  roles?: Record<string, string>
  /**
   * What the model reads of the design's prose. `omit` drops sections by
   * their heading, such as the install steps of another library; a
   * function rewrites the prose whole.
   */
  prose?: { omit?: readonly (string | RegExp)[] } | ((prose: string) => string)
}

export interface CssDesignOptions extends Omit<DesignOptions, "prose"> {
  name?: string
  description?: string
  /** Guidance for the model, in Markdown: what the stylesheet can't say. */
  prose?: string
}

type Tree = { [key: string]: unknown }

const FRONT_MATTER = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/
const YAML_BLOCK = /```ya?ml[ \t]*\n([\s\S]*?)\n```/g
const TOKEN_KEYS = [
  "colors",
  "typography",
  "rounded",
  "spacing",
  "motion",
  "components",
]
const REFERENCE = /^\{([A-Za-z0-9_.-]+)\}$/
const UNSAFE_VALUE = /[;{}<>\\]|@import|\/\*/i
const CALL = /(?:url|image-set|image|src|expression)\s*\(/i
const QUOTED = /"[^"\n]*"|'[^'\n]*'/g

function isTree(value: unknown): value is Tree {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function merge(target: Tree, source: Tree): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key]
    if (isTree(current) && isTree(value)) merge(current, value)
    else target[key] = value
  }
}

/** Whether a token value is safe to write into a stylesheet. */
export function isSafeCssValue(value: string): boolean {
  if (value.length > 300 || UNSAFE_VALUE.test(value)) return false
  // A quoted name like "Image (Text)" is only text. A quote left open would
  // take in whatever the stylesheet says after the value.
  const code = value.replace(QUOTED, " ")
  return !/["']/.test(code) && !CALL.test(code)
}

const VARIABLE_GROUPS: Record<string, string> = {
  colors: "color",
  rounded: "radius",
  spacing: "space",
}

function tokenVariable(value: unknown): string | null {
  if (typeof value !== "string") return null
  const reference = REFERENCE.exec(value.trim())
  if (!reference) return null
  const [group, ...rest] = (reference[1] as string).split(".")
  const prefix = VARIABLE_GROUPS[group as string]
  if (!prefix || rest.length === 0) return null
  if (group === "colors" && (rest[0] === "light" || rest[0] === "dark")) rest.shift()
  const name = rest
    .join("-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase()
  return name ? `var(--iui-${prefix}-${name})` : null
}

/** Drops the sections of a Markdown document whose heading is one of `headings`, with what is under them. */
function omitSections(markdown: string, headings: readonly (string | RegExp)[]): string {
  const kept: string[] = []
  let skipping = 0
  let fenced = false
  for (const line of markdown.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced
    const heading = fenced ? null : /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const level = (heading[1] as string).length
      const title = heading[2] as string
      if (skipping && level <= skipping) skipping = 0
      if (!skipping && headings.some((item) => (typeof item === "string" ? item.trim().toLowerCase() === title.toLowerCase() : item.test(title)))) {
        skipping = level
      }
    }
    if (!skipping) kept.push(line)
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

/** The colors a caller named, for a document that refers to them without a value. */
function knownColors(tokens: DesignTokens | undefined): { light: Record<string, string>; dark: Record<string, string> } {
  const known = { light: {} as Record<string, string>, dark: {} as Record<string, string> }
  const colors = tokens?.colors
  if (!isTree(colors)) return known
  for (const [name, value] of Object.entries(colors)) {
    if (typeof value === "string") known.light[name] = value
    else if (isTree(value) && (name === "light" || name === "dark")) {
      for (const [inner, color] of Object.entries(value)) {
        if (typeof color === "string") known[name][inner] = color
      }
    }
  }
  return known
}

/**
 * Reads a DESIGN.md. Tokens come from its YAML front matter and YAML
 * blocks; a file that has none, written for another component library, is
 * read for the CSS custom properties it documents instead.
 *
 * ```ts
 * const design = parseDesign(source, {
 *   roles: { "muted-foreground": "muted", muted: "surface-secondary" },
 *   prose: { omit: ["Setup", "Source of Truth"] },
 * })
 * ```
 */
export function parseDesign(source: string, options: DesignOptions = {}): Design {
  const design: Design = {
    colors: {},
    darkColors: {},
    typography: {},
    rounded: {},
    spacing: {},
    motion: {},
    components: {},
    prose: "",
    issues: [],
  }
  const text = source.replace(/\r\n?/g, "\n")
  const tree: Tree = {}
  const read = (yaml: string, where: string) => {
    try {
      const parsed: unknown = parseYaml(yaml)
      if (isTree(parsed)) merge(tree, parsed)
    } catch (error) {
      design.issues.push(
        `${where}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  let body = text
  const front = FRONT_MATTER.exec(text)
  if (front) {
    read(front[1] as string, "Front matter")
    body = text.slice(front[0].length)
  }
  for (const block of body.matchAll(YAML_BLOCK)) {
    const yaml = block[1] as string
    if (TOKEN_KEYS.some((key) => new RegExp(`^${key}:`, "m").test(yaml))) {
      read(yaml, "YAML block")
    }
  }
  design.prose = body.trim()
  if (typeof options.prose === "function") design.prose = String(options.prose(design.prose) ?? "").trim()
  else if (options.prose?.omit?.length) design.prose = omitSections(design.prose, options.prose.omit)

  if (TOKEN_KEYS.some((key) => isTree(tree[key]))) design.source = "tokens"
  else {
    const found = tokensFromVariables(readMarkdownVariables(body), knownColors(options.tokens), design.issues, true)
    if (Object.keys(found).length) {
      merge(tree, found)
      design.source = "css-variables"
    }
  }
  fill(design, tree, options)
  return design
}

/**
 * Makes a design from a theme stylesheet: the custom properties of
 * `:root` (and Tailwind's `@theme`) are the light values, those of a
 * `.dark` or `[data-theme="dark"]` rule or a dark media query the dark
 * ones. Colors, radius, spacing and font families are taken; the rest of
 * the stylesheet is not used.
 *
 * ```ts
 * const design = designFromCss(themeCss, { name: "Acme", prose: guidelines })
 * ```
 */
export function designFromCss(css: string, options: CssDesignOptions = {}): Design {
  const design: Design = {
    colors: {},
    darkColors: {},
    typography: {},
    rounded: {},
    spacing: {},
    motion: {},
    components: {},
    prose: (options.prose ?? "").trim(),
    issues: [],
    source: "css-variables",
  }
  if (options.name) design.name = options.name
  if (options.description) design.description = options.description
  const variables: Variables = readCssVariables(String(css ?? "").replace(/\r\n?/g, "\n"))
  const tree: Tree = tokensFromVariables(variables, knownColors(options.tokens), design.issues)
  fill(design, tree, options)
  return design
}

/** Fills a design's token groups from a tree shaped like the front matter. */
function fill(design: Design, tree: Tree, options: Pick<DesignOptions, "tokens" | "roles">): void {
  if (isTree(options.tokens)) {
    // A copy, so resolving references never writes into what the caller passed.
    merge(tree, JSON.parse(JSON.stringify(options.tokens)) as Tree)
  }
  if (typeof tree.name === "string") design.name ??= tree.name
  if (typeof tree.description === "string") design.description ??= tree.description

  const resolve = (value: unknown, depth = 0): unknown => {
    if (typeof value !== "string") return value
    const reference = REFERENCE.exec(value.trim())
    if (!reference) return value
    if (depth > 10) {
      design.issues.push(`Reference ${value} loops`)
      return undefined
    }
    let target: unknown = tree
    for (const part of (reference[1] as string).split(".")) {
      target = isTree(target) ? target[part] : undefined
    }
    if (target === undefined) {
      design.issues.push(`Reference ${value} points to nothing`)
      return undefined
    }
    return resolve(target, depth + 1)
  }

  const scalar = (value: unknown, path: string): string | undefined => {
    const resolved = resolve(value)
    if (typeof resolved !== "string" && typeof resolved !== "number") {
      return undefined
    }
    const out = String(resolved).trim()
    if (!isSafeCssValue(out)) {
      design.issues.push(`${path} has a value that can't be used in CSS`)
      return undefined
    }
    return out
  }

  const flatten = (
    group: unknown,
    path: string,
    out: Record<string, string>,
    prefix = ""
  ) => {
    if (!isTree(group)) return
    for (const [key, value] of Object.entries(group)) {
      const name = prefix ? `${prefix}-${key}` : key
      if (isTree(value)) {
        flatten(value, path, out, name)
      } else {
        const resolved = scalar(value, `${path}.${name}`)
        if (resolved !== undefined) out[name] = resolved
      }
    }
  }

  if (isTree(tree.colors)) {
    const { light, dark, ...shared } = tree.colors
    flatten(shared, "colors", design.colors)
    flatten(light, "colors.light", design.colors)
    flatten(dark, "colors.dark", design.darkColors)
  }
  flatten(tree.rounded, "rounded", design.rounded)
  flatten(tree.spacing, "spacing", design.spacing)

  const typography = (value: unknown, path: string): TypographyToken => {
    const token: TypographyToken = {}
    if (!isTree(value)) return token
    for (const key of [
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "letterSpacing",
      "fontFeature",
      "fontVariation",
    ] as const) {
      const resolved = scalar(value[key], `${path}.${key}`)
      if (resolved !== undefined) token[key] = resolved
    }
    return token
  }
  const collectTypography = (group: unknown, prefix = "") => {
    if (!isTree(group)) return
    for (const [key, value] of Object.entries(group)) {
      if (!isTree(value)) continue
      const name = prefix ? `${prefix}-${key}` : key
      const isLevel = Object.values(value).some((item) => !isTree(item))
      if (isLevel) design.typography[name] = typography(value, `typography.${name}`)
      else collectTypography(value, name)
    }
  }
  collectTypography(tree.typography)

  if (isTree(tree.motion)) {
    for (const [name, value] of Object.entries(tree.motion)) {
      if (!isTree(value)) continue
      const token: MotionToken = {}
      for (const key of ["duration", "delay", "timingFunction"] as const) {
        const resolved = scalar(value[key], `motion.${name}.${key}`)
        if (resolved !== undefined) token[key] = resolved
      }
      design.motion[name] = token
    }
  }

  if (isTree(tree.components)) {
    for (const [name, value] of Object.entries(tree.components)) {
      if (!isTree(value)) continue
      const component: Record<string, string | TypographyToken> = {}
      for (const [key, raw] of Object.entries(value)) {
        const resolved = resolve(raw)
        // A reference to a color, radius or spacing token stays a reference,
        // so a component follows its token into dark mode.
        const variable = tokenVariable(raw)
        if (variable && !isTree(resolved) && resolved !== undefined) {
          component[key] = variable
          continue
        }
        if (isTree(resolved)) {
          component[key] = typography(resolved, `components.${name}.${key}`)
        } else {
          const text = scalar(resolved, `components.${name}.${key}`)
          if (text !== undefined) component[key] = text
        }
      }
      design.components[name] = component
    }
  }

  if (isTree(options.roles)) {
    const roles: Record<string, string> = {}
    for (const [role, token] of Object.entries(options.roles)) {
      if (typeof token !== "string") continue
      if (!COLOR_ROLE_NAMES.includes(role)) design.issues.push(`roles.${role} is not a role`)
      else if (!Object.hasOwn(design.colors, token)) design.issues.push(`roles.${role}: the design has no color named ${token}`)
      else roles[role] = token
    }
    if (Object.keys(roles).length) design.roles = roles
  }
}

/**
 * The token names a model may use, as a short list for the system prompt.
 * The prose of the DESIGN.md says how to use them.
 */
export function describeDesignTokens(design: Design): string {
  const lines: string[] = []
  const list = (label: string, names: string[]) => {
    if (names.length) lines.push(`- ${label}: ${names.join(", ")}`)
  }
  // A token another one stands in for under its name can't be asked for by that name.
  const { sources, shadowed } = colorSources(design)
  list(
    "Colors",
    Object.entries(design.colors)
      .filter(([name]) => !shadowed.has(name))
      .map(([name, value]) => `${name} (${value})`)
  )
  list(
    "Color roles filled by another of the design's colors",
    [...sources]
      .filter(([role, token]) => role !== token && (shadowed.has(token) || design.roles?.[role] === token))
      .map(([role, token]) => `${role} is the design's \`${token}\``)
  )
  list(
    "Typography levels",
    Object.entries(design.typography).map(([name, token]) =>
      [name, token.fontSize && `(${token.fontSize})`].filter(Boolean).join(" ")
    )
  )
  list(
    "Radius",
    Object.entries(design.rounded).map(([name, value]) => `${name} (${value})`)
  )
  list(
    "Spacing",
    Object.entries(design.spacing).map(([name, value]) => `${name} (${value})`)
  )
  list(
    "Motion",
    Object.entries(design.motion).map(([name, token]) =>
      `${name} (${[token.duration, token.timingFunction].filter(Boolean).join(" ")})`
    )
  )
  list("Component tokens", Object.keys(design.components))
  return lines.join("\n")
}
