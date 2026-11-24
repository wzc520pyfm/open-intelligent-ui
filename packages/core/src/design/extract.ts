import { isColor } from "./color"

/**
 * Reading a design that keeps its tokens as CSS custom properties rather
 * than in the YAML the DESIGN.md format gives them: a theme stylesheet, or
 * a DESIGN.md that documents its variables in tables.
 */

type Tree = { [key: string]: unknown }

/** What a set of custom properties says, by color mode. */
export interface Variables {
  light: Map<string, string>
  dark: Map<string, string>
}

const newVariables = (): Variables => ({ light: new Map(), dark: new Map() })

type Mode = "light" | "dark" | "skip"

const DARK_WORD = /(?<![\w-])dark(?![\w-])/i
const LIGHT_WORD = /(?<![\w-])(?:light|default)(?![\w-])/i
const ROOT = /(?:^|,)\s*(?::root|html|body|:host|\*)\s*(?:,|$)/

/** Which values the declarations of a rule give, from what opens it. */
function modeOf(prelude: string, parent: Mode): Mode {
  const text = prelude.trim()
  if (parent !== "light") return parent
  if (text.startsWith("@")) {
    if (/prefers-color-scheme\s*:\s*dark/i.test(text)) return "dark"
    // A layer, a container or a breakpoint doesn't change which theme this is. Keyframes hold no tokens.
    return /^@(?:theme|layer|media|supports|container|scope)\b/i.test(text) ? "light" : "skip"
  }
  if (DARK_WORD.test(text)) return "dark"
  // A theme is set where the page starts. A component's own variables are no part of it.
  return ROOT.test(text) || LIGHT_WORD.test(text) ? "light" : "skip"
}

/**
 * The custom properties a theme stylesheet declares. `:root`, `html` and
 * Tailwind's `@theme` give the light values; a rule whose selector names
 * `dark`, or a dark media query, gives the dark ones. Rules for anything
 * else are not the theme and are passed over.
 */
export function readCssVariables(css: string, into: Variables = newVariables()): Variables {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const modes: Mode[] = ["light"]
  let piece = ""
  let depth = 0
  let quote = ""
  const declare = () => {
    const match = /^\s*(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+?)\s*(?:!important\s*)?$/.exec(piece)
    const mode = modes.at(-1)
    if (match && mode !== "skip") (mode === "dark" ? into.dark : into.light).set((match[1] as string).slice(2), match[2] as string)
    piece = ""
  }
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = ""
      piece += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      piece += ch
    } else if (ch === "(") {
      depth++
      piece += ch
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1)
      piece += ch
    } else if (depth > 0) {
      piece += ch
    } else if (ch === "{") {
      modes.push(modeOf(piece, modes.at(-1) ?? "light"))
      piece = ""
    } else if (ch === "}") {
      declare()
      if (modes.length > 1) modes.pop()
    } else if (ch === ";") {
      declare()
    } else piece += ch
  }
  declare()
  return into
}

/** Splits a table cell or a list of values at the commas outside parentheses and code. */
function splitList(text: string): string[] {
  const out: string[] = []
  let piece = ""
  let depth = 0
  let code = false
  for (const ch of text) {
    if (ch === "`") code = !code
    else if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    if (ch === "," && depth === 0 && !code) {
      out.push(piece)
      piece = ""
    } else piece += ch
  }
  out.push(piece)
  return out.map((item) => item.replace(/`/g, "").trim()).filter(Boolean)
}

function cells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, "").replace(/\|$/, "")
  const out: string[] = []
  let piece = ""
  let code = false
  for (let at = 0; at < inner.length; at++) {
    const ch = inner[at] as string
    if (ch === "\\" && inner[at + 1] === "|") {
      piece += "|"
      at++
    } else if (ch === "`") {
      code = !code
      piece += ch
    } else if (ch === "|" && !code) {
      out.push(piece.trim())
      piece = ""
    } else piece += ch
  }
  out.push(piece.trim())
  return out
}

const LIGHT_COLUMN = /^(?:light|light mode|value|default|default value)$/i
const DARK_COLUMN = /^(?:dark|dark mode)$/i

/**
 * The custom properties a Markdown document gives values for: in `css`
 * code blocks, in tables with a column of variables beside a `Light` (or
 * `Value`) column and maybe a `Dark` one, and as `--name: value` in inline
 * code.
 */
export function readMarkdownVariables(markdown: string): Variables {
  const found = newVariables()
  const prose = markdown.replace(/```([A-Za-z]*)[ \t]*\n([\s\S]*?)\n```/g, (_block, language: string, code: string) => {
    if (/^(?:s?css|less)$/i.test(language)) readCssVariables(code, found)
    return ""
  })

  const lines = prose.split("\n")
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] as string
    const rule = lines[at + 1]
    if (!line.trim().startsWith("|") || !rule || !/^\s*\|?\s*:?-{3,}/.test(rule)) continue
    const head = cells(line)
    const rows: string[][] = []
    let next = at + 2
    while (next < lines.length && (lines[next] as string).trim().startsWith("|")) {
      rows.push(cells(lines[next] as string))
      next++
    }
    at = next - 1
    const light = head.findIndex((name) => LIGHT_COLUMN.test(name))
    const dark = head.findIndex((name) => DARK_COLUMN.test(name))
    const names = head.findIndex((_name, column) => rows.some((row) => /`--[A-Za-z0-9_-]+`/.test(row[column] ?? "")))
    if (names < 0 || light < 0) continue
    for (const row of rows) {
      const variables = [...(row[names] ?? "").matchAll(/`--([A-Za-z0-9_-]+)`/g)].map((match) => match[1] as string)
      const values = splitList(row[light] ?? "")
      const darkValues = dark < 0 ? [] : splitList(row[dark] ?? "")
      variables.forEach((name, index) => {
        const value = values[index]
        if (value !== undefined) found.light.set(name, value)
        const darkValue = darkValues[index]
        if (darkValue !== undefined) found.dark.set(name, darkValue)
      })
    }
  }

  for (const match of prose.matchAll(/`--([A-Za-z0-9_-]+)\s*:\s*([^`]+?);?`/g)) {
    const name = match[1] as string
    if (!found.light.has(name)) found.light.set(name, (match[2] as string).trim())
  }
  return found
}

const BARE_HSL = /^-?[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%(?:\s*\/\s*[\d.]+%?)?$/
const WORD = /^[A-Za-z][A-Za-z0-9_-]*$/
const LENGTH = /^(?:-?[\d.]+(?:px|rem|em|%)?|calc\(.+\))$/

const SIZES = new Set(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "full"])

/** The name a radius or spacing variable gets: `--radius` is the base, `--radius-lg` is `lg`. */
function scaleName(name: string, word: RegExp, base: string): string {
  const rest = name
    .replace(word, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
  return rest || base
}

/**
 * Sorts custom properties into the token groups of a DESIGN.md: colors by
 * what their value is, radius, spacing and font families by what they are
 * called. What is neither is left out. `known` holds colors the document
 * refers to by name without giving a value.
 */
export function tokensFromVariables(
  variables: Variables,
  known: { light: Record<string, string>; dark: Record<string, string> },
  issues: string[],
  /** True for a document, where a value may be another token's bare name: `foreground`. */
  words = false
): Tree {
  const colorName = (name: string) => name.replace(/^colors?-/, "")
  const lookup = (name: string, mode: "light" | "dark"): string | undefined => {
    const own = (mode === "dark" ? variables.dark.get(name) : undefined) ?? variables.light.get(name)
    if (own !== undefined) return own
    const given = (mode === "dark" ? known.dark[name] : undefined) ?? known.light[name]
    return given
  }

  /** A value with what it refers to written out, or null when it refers to nothing known. */
  const resolve = (raw: string, mode: "light" | "dark", depth = 0): string | null => {
    if (depth > 8) return null
    let value = raw.trim()
    const faded = /^(.+?)\s+at\s+([\d.]+)%$/i.exec(value)
    if (faded) {
      const base = resolve(faded[1] as string, mode, depth + 1)
      return base && isColor(base) ? `color-mix(in srgb, ${base} ${faded[2]}%, transparent)` : null
    }
    if (words && WORD.test(value) && !isColor(value)) {
      const target = lookup(value, mode) ?? lookup(colorName(value), mode)
      return target === undefined ? null : resolve(target, mode, depth + 1)
    }
    let missing = false
    value = value.replace(/var\(\s*--([A-Za-z0-9_-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_all, name: string, fallback?: string) => {
      const target = lookup(name, mode)
      const written = target === undefined ? (fallback ? resolve(fallback, mode, depth + 1) : null) : resolve(target, mode, depth + 1)
      if (written === null) missing = true
      return written ?? ""
    })
    if (missing || /var\(/.test(value)) return null
    return BARE_HSL.test(value) ? `hsl(${value})` : value
  }

  const colors: Tree = {}
  const dark: Tree = {}
  const rounded: Tree = {}
  const spacing: Tree = {}
  const typography: Tree = {}

  const RADIUS = /(?:^|-)(?:radius|rounded)(?:-|$)/
  const SPACING = /(?:^|-)(?:spacing|space)(?:-|$)/
  for (const [name, raw] of variables.light) {
    const font = /^font-(?:(sans|body|base)|(mono|code)|heading|display|serif)$/.exec(name)
    if (font) {
      typography[font[1] ? "body" : font[2] ? "code" : "h1"] = { fontFamily: raw.trim() }
      continue
    }
    const value = resolve(raw, "light")
    if (value === null) {
      // A stylesheet is full of variables that are no token; only what would have been one is worth a note.
      if (words || RADIUS.test(name) || SPACING.test(name) || /^colors?-/.test(name)) {
        issues.push(`--${name}: "${raw}" refers to something this design gives no value for`)
      }
      continue
    }
    if (isColor(value)) {
      colors[colorName(name)] = value
    } else if (RADIUS.test(name) && LENGTH.test(value)) {
      rounded[scaleName(name, RADIUS, "md")] = value
    } else if (SPACING.test(name) && LENGTH.test(value)) {
      const key = scaleName(name, SPACING, "unit")
      // Tailwind numbers its steps; only named sizes are roles here.
      if (key === "unit" || SIZES.has(key)) spacing[key] = value
    }
  }
  for (const [name, raw] of variables.dark) {
    if (/^same as light$/i.test(raw.trim())) continue
    const key = colorName(name)
    if (!Object.hasOwn(colors, key)) continue
    const value = resolve(raw, "dark")
    if (value === null) {
      if (words) issues.push(`--${name} (dark): "${raw}" refers to something this design gives no value for`)
      continue
    }
    if (isColor(value) && value !== colors[key]) dark[key] = value
  }
  // A color that follows another follows it into the dark scheme too.
  for (const [name, raw] of variables.light) {
    const key = colorName(name)
    if (!Object.hasOwn(colors, key) || Object.hasOwn(dark, key) || variables.dark.has(name)) continue
    const value = resolve(raw, "dark")
    if (value !== null && isColor(value) && value !== colors[key]) dark[key] = value
  }

  const tree: Tree = {}
  if (Object.keys(colors).length) tree.colors = Object.keys(dark).length ? { ...colors, dark } : colors
  if (Object.keys(rounded).length) tree.rounded = rounded
  if (Object.keys(spacing).length) tree.spacing = spacing
  if (Object.keys(typography).length) tree.typography = typography
  return tree
}
