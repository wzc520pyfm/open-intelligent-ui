import { parse as parseYaml } from "yaml"

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
const UNSAFE_VALUE = /[;{}<>\\]|url\s*\(|@import|expression\s*\(|\/\*/i

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
  return value.length <= 300 && !UNSAFE_VALUE.test(value)
}

export function parseDesign(source: string): Design {
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
  if (typeof tree.name === "string") design.name = tree.name
  if (typeof tree.description === "string") design.description = tree.description

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

  return design
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
  list(
    "Colors",
    Object.entries(design.colors).map(([name, value]) => `${name} (${value})`)
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
