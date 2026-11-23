/**
 * Makes CSS written by a model safe to add to a page: it can only style the
 * surface it belongs to, can't load anything from the network, and can't
 * cover the rest of the page.
 */

const GROUP_RULES = new Set(["media", "container", "supports", "starting-style"])
const URL_CALL = /url\(\s*(["']?)([^"')]*)\1\s*\)/gi
const ROOT_SELECTOR = /(^|,)\s*(?::root|html|body)(?=[\s,.:#[>+~]|$)/g

interface Statement {
  prelude: string
  /** Undefined for statements that end in `;` instead of a block. */
  block?: string
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "")
}

/** Index after the string that starts at `start`. */
function skipString(css: string, start: number): number {
  const quote = css[start]
  let i = start + 1
  while (i < css.length) {
    if (css[i] === "\\") i += 2
    else if (css[i] === quote || css[i] === "\n") return i + 1
    else i++
  }
  return i
}

/** Splits CSS into its top-level statements. Unclosed blocks are dropped. */
function statements(css: string): Statement[] {
  const out: Statement[] = []
  let start = 0
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      i = skipString(css, i)
    } else if (ch === ";") {
      out.push({ prelude: css.slice(start, i).trim() })
      i++
      start = i
    } else if (ch === "}") {
      i++
      start = i
    } else if (ch === "{") {
      let depth = 1
      let j = i + 1
      while (j < css.length && depth > 0) {
        const inner = css[j]
        if (inner === '"' || inner === "'") {
          j = skipString(css, j)
          continue
        }
        if (inner === "{") depth++
        else if (inner === "}") depth--
        j++
      }
      if (depth !== 0) return out
      out.push({
        prelude: css.slice(start, i).trim(),
        block: css.slice(i + 1, j - 1),
      })
      i = j
      start = i
    } else {
      i++
    }
  }
  return out
}

const NAME_CHARACTER = /^[A-Za-z0-9_-]$/

/**
 * A backslash escape spells any character of a name, so to a browser
 * `u\72l(` is `url(` and `f\69xed` is `fixed`. Escapes that spell a letter,
 * a digit, `-` or `_` are written out here, so the checks read the names the
 * browser reads. Quoted strings are left as they are.
 */
function plainNames(css: string): string {
  if (!css.includes("\\")) return css
  let out = ""
  let i = 0
  while (i < css.length) {
    const ch = css[i] as string
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i)
      out += css.slice(i, end)
      i = end
    } else if (ch === "\\") {
      const hex = /^[0-9a-f]{1,6}/i.exec(css.slice(i + 1, i + 7))?.[0]
      const point = hex ? Number.parseInt(hex, 16) : Number.NaN
      const spelled = hex
        ? point <= 0x7f
          ? String.fromCharCode(point)
          : ""
        : (css[i + 1] ?? "")
      if (NAME_CHARACTER.test(spelled)) {
        i += 1 + (hex ? hex.length : 1)
        // One space after a hexadecimal escape only ends it.
        if (hex && /[ \t\n\r\f]/.test(css[i] ?? "")) i++
        out += spelled
      } else {
        out += css.slice(i, i + 2)
        i += 2
      }
    } else {
      out += ch
      i++
    }
  }
  return out
}

const POSITION = /^(?:static|relative|absolute|sticky|inherit|initial|unset|revert|revert-layer)$/i

/**
 * A `position` that can't pin an element to the window. Only the keywords
 * are let through, since `var()` and `attr()` can stand for `fixed`.
 */
function safePosition(value: string): string {
  const [keyword = "", ...rest] = value.split(/\s*!\s*/)
  return POSITION.test(keyword) ? value : ["absolute", ...rest].join(" !")
}

function cleanValues(css: string): string {
  return plainNames(css)
    .replace(URL_CALL, (match, _quote, target: string) => {
      const url = target.trim()
      if (url.startsWith("#")) return match
      if (/^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(url)) return match
      return "none"
    })
    .replace(/image-set\s*\(/gi, "none(")
    .replace(/expression\s*\(/gi, "none(")
    .replace(/(-moz-binding|behavior)\s*:/gi, "--blocked:")
    .replace(/((?:^|[;{\s(])position\s*:)([^;{}()]*)/gi, (match, lead: string, value: string) => {
      const keyword = value.trim()
      return keyword ? lead + value.replace(keyword, safePosition(keyword)) : match
    })
    .replace(/@import\b[^;]*;?/gi, "")
}

function cleanSelector(selector: string): string {
  return selector
    .replace(ROOT_SELECTOR, (_match, lead: string) => `${lead} &`)
    .trim()
}

function atRuleName(prelude: string): string | null {
  const match = /^@([a-z-]+)/i.exec(prelude)
  return match ? (match[1] as string).toLowerCase() : null
}

export interface ScopedCss {
  css: string
  /** Rules that were removed, for diagnostics. */
  dropped: string[]
}

/**
 * Rewrites `css` so every rule applies only inside `scope`. Keyframes get a
 * name prefix so two surfaces can't overwrite each other's animations.
 */
export function scopeCss(css: string, scope: string, id = ""): ScopedCss {
  const dropped: string[] = []
  const keyframes: string[] = []
  const names = new Map<string, string>()
  const source = stripComments(css).replace(/<\/?style[^>]*>?|<!--|-->/gi, "")

  const walk = (text: string): string[] => {
    const rules: string[] = []
    for (const { prelude, block } of statements(text)) {
      if (!prelude) continue
      const name = atRuleName(prelude)
      if (block === undefined) {
        if (name || !prelude.includes(":")) dropped.push(prelude)
        // A stray declaration outside any rule applies to the surface itself.
        else rules.push(`& { ${cleanValues(prelude)}; }`)
        continue
      }
      if (name === "keyframes") {
        const original = prelude.replace(/^@keyframes\s+/i, "").trim()
        if (!/^[A-Za-z_][\w-]*$/.test(original)) {
          dropped.push(prelude)
          continue
        }
        const renamed = id ? `iui-${id}-${original}` : original
        names.set(original, renamed)
        keyframes.push(`@keyframes ${renamed} {${cleanValues(block)}}`)
        continue
      }
      if (name) {
        if (!GROUP_RULES.has(name)) {
          dropped.push(prelude)
          continue
        }
        if (name === "starting-style" && !/[{]/.test(block)) {
          rules.push(`${prelude} {${cleanValues(block)}}`)
          continue
        }
        rules.push(`${cleanValues(prelude)} {\n${walk(block).join("\n")}\n}`)
        continue
      }
      rules.push(`${cleanSelector(prelude)} {${cleanValues(block)}}`)
    }
    return rules
  }

  let body = walk(source).join("\n")
  let frames = keyframes.join("\n")
  for (const [original, renamed] of names) {
    if (original === renamed) continue
    const use = new RegExp(
      `(animation(?:-name)?\\s*:[^;{}]*?)(?<![\\w-])${original}(?![\\w-])`,
      "g"
    )
    body = body.replace(use, `$1${renamed}`)
    frames = frames.replace(use, `$1${renamed}`)
  }
  const scoped = body ? `${scope} {\n${body}\n}` : ""
  return { css: [frames, scoped].filter(Boolean).join("\n"), dropped }
}

const UNSAFE_DECLARATION = /url\s*\(|image-set\s*\(|expression\s*\(|@import|[<>{}]|\/\*/i

/**
 * Reads an inline `style="..."` string into a style object. Custom properties
 * keep their names; other properties become camelCase.
 */
export function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {}
  let depth = 0
  let start = 0
  const parts: string[] = []
  for (let i = 0; i < style.length; i++) {
    const ch = style[i]
    if (ch === "(") depth++
    else if (ch === ")") depth = Math.max(0, depth - 1)
    else if (ch === ";" && depth === 0) {
      parts.push(style.slice(start, i))
      start = i + 1
    }
  }
  parts.push(style.slice(start))
  for (const part of parts) {
    const colon = part.indexOf(":")
    if (colon === -1) continue
    const name = part.slice(0, colon).trim()
    const value = part.slice(colon + 1).trim()
    const safe = safeStyleValue(name, value)
    if (safe === null) continue
    out[styleKey(name)] = safe
  }
  return out
}

export function styleKey(name: string): string {
  if (name.startsWith("--")) return name
  return name
    .replace(/^-ms-/, "ms-")
    .replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())
}

/** Returns the value if it may be used for `property`, else null. */
export function safeStyleValue(property: string, value: string): string | null {
  if (!/^-{0,2}[A-Za-z][\w-]*$/.test(property)) return null
  // Not a property: assigning it rewrites the whole style from text.
  if (/^css-?text$/i.test(property)) return null
  if (!value || value.length > 2000) return null
  const plain = plainNames(value)
  const urlFree = plain.replace(URL_CALL, (match, _quote, target: string) =>
    target.trim().startsWith("#") ? "" : match
  )
  if (UNSAFE_DECLARATION.test(urlFree)) return null
  if (/^(-moz-binding|behavior)$/i.test(property)) return null
  if (/^position$/i.test(property)) return safePosition(plain.trim())
  return plain
}

const SAFE_PROTOCOL = /^(?:https?:|mailto:|tel:)/i
const HAS_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i

/**
 * Returns a URL that is safe to navigate to or load, or null. Relative URLs
 * and fragments are allowed; `javascript:` and other schemes are not.
 */
export function safeUrl(url: unknown, kind: "link" | "media" = "link"): string | null {
  if (typeof url !== "string") return null
  // Browsers ignore tabs and line breaks inside a scheme, so remove them first.
  const trimmed = url.replace(/[\u0000-\u001F\u007F]/g, "").trim()
  if (!trimmed) return null
  if (SAFE_PROTOCOL.test(trimmed)) {
    if (kind === "media" && !/^https?:/i.test(trimmed)) return null
    return trimmed
  }
  if (kind === "media" && /^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(trimmed)) {
    return trimmed
  }
  if (kind === "media" && /^blob:/i.test(trimmed)) return trimmed
  if (HAS_PROTOCOL.test(trimmed)) return null
  return trimmed
}
