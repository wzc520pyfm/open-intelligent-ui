/**
 * Makes CSS written by a model safe to add to a page: it can only style the
 * surface it belongs to, can't load anything from the network, and can't pin
 * anything to the window.
 *
 * The checks hold only if this file reads the text the way a browser does:
 * where a string ends, what a backslash escapes, where a `url()` ends. A
 * string the browser doesn't see is a place to hide a `url()`, and a brace
 * the browser doesn't see ends the surface's rule early.
 */

const GROUP_RULES = new Set(["media", "container", "supports", "starting-style"])
const ROOT_SELECTOR = /(^|,)\s*(?::root|html|body)(?=[\s,.:#[>+~]|$)/g

interface Statement {
  prelude: string
  /** Undefined for statements that end in `;` instead of a block. */
  block?: string
}

/** A browser turns these into a line feed and a replacement character before it reads CSS. */
function normalize(css: string): string {
  return css.replace(/\r\n?|\f/g, "\n").replace(/\0/g, "\uFFFD")
}

/**
 * Removes comments, and markup left around the CSS, until none is left:
 * taking one out can join the halves of another. A quoted string is kept as
 * written, so `content: "/* note *\/"` still shows its text.
 */
function stripComments(css: string): string {
  let out = css
  for (;;) {
    const next = withoutComments(out)
    if (next === out) return out
    out = next
  }
}

/** Index after the string that starts at `start`. A line break ends a string. */
function skipString(css: string, start: number): number {
  const quote = css[start]
  let i = start + 1
  while (i < css.length) {
    if (css[i] === "\\") i += 2
    else if (css[i] === quote || css[i] === "\n") return i + 1
    else i++
  }
  return css.length
}

/**
 * Index after the string or the escape that starts at `i`, or `i` when
 * neither does. `\"` and `\{` are characters of a name, not syntax.
 */
function skipOpaque(css: string, i: number): number {
  const ch = css[i]
  if (ch === "\\") return Math.min(i + 2, css.length)
  if (ch === '"' || ch === "'") return skipString(css, i)
  return i
}

function withoutComments(css: string): string {
  let out = ""
  let start = 0
  let i = 0
  const code = (end: number) => css.slice(start, end).replace(/<\/?style[^>]*>?|<!--|-->/gi, "")
  while (i < css.length) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i)
      out += code(i) + css.slice(i, end)
      start = i = end
    } else if (ch === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2)
      out += code(i)
      start = i = end === -1 ? css.length : end + 2
    } else {
      i += ch === "\\" ? 2 : 1
    }
  }
  return out + code(css.length)
}

/** Splits CSS into its top-level statements. Unclosed blocks are dropped. */
function statements(css: string): Statement[] {
  const out: Statement[] = []
  let start = 0
  let i = 0
  while (i < css.length) {
    const next = skipOpaque(css, i)
    if (next !== i) {
      i = next
      continue
    }
    const ch = css[i]
    if (ch === ";") {
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
        const after = skipOpaque(css, j)
        if (after !== j) {
          j = after
          continue
        }
        if (css[j] === "{") depth++
        else if (css[j] === "}") depth--
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

/** Splits `text` at each `separator` that is not inside brackets or a string. */
function splitTop(text: string, separator: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  let i = 0
  while (i < text.length) {
    const next = skipOpaque(text, i)
    if (next !== i) {
      i = next
      continue
    }
    const ch = text[i]
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1)
    else if (ch === separator && depth === 0) {
      out.push(text.slice(start, i))
      start = i + 1
    }
    i++
  }
  out.push(text.slice(start))
  return out
}

/** Applies `change` to the parts of `css` that are not inside a quoted string. */
function outsideStrings(css: string, change: (code: string) => string): string {
  let out = ""
  let start = 0
  let i = 0
  while (i < css.length) {
    if (css[i] === '"' || css[i] === "'") {
      const end = skipString(css, i)
      out += change(css.slice(start, i)) + css.slice(i, end)
      start = i = end
    } else {
      i += css[i] === "\\" ? 2 : 1
    }
  }
  return out + change(css.slice(start))
}

/** What a bare `url(...)` may hold and still be read the same by this file and a browser. */
const BARE_URL = /^[^ \t\n\f\r"'()\\]*$/

/** What CSS counts as white space. A no-break space is not: in `url(\u00A0#a)` it is part of the address. */
const SPACE = /^[ \t\n\f\r]$/

/**
 * Replaces every `url(...)` that `allow` turns down with `none`. A call is
 * read the way a browser reads it, so a quoted address may hold `)` and a
 * bare one may hold a quote. A call that is not closed, or holds more than
 * an address, is turned down without asking.
 */
function mapUrls(css: string, allow: (target: string) => boolean): string {
  let out = ""
  let i = 0
  while (i < css.length) {
    const next = skipOpaque(css, i)
    if (next !== i) {
      out += css.slice(i, next)
      i = next
      continue
    }
    if (!/^url\($/i.test(css.slice(i, i + 4))) {
      out += css[i]
      i++
      continue
    }
    let j = i + 4
    while (SPACE.test(css[j] ?? "")) j++
    const quote = css[j]
    let target: string | null = null
    if (quote === '"' || quote === "'") {
      const end = skipString(css, j)
      if (css[end - 1] === quote && end - 1 > j) target = css.slice(j + 1, end - 1)
      j = end
      while (SPACE.test(css[j] ?? "")) j++
      if (css[j] !== ")") target = null
    } else {
      const start = j
      while (j < css.length && css[j] !== ")") j += css[j] === "\\" ? 2 : 1
      const bare = css.slice(start, j).replace(/[ \t\n\f\r]+$/, "")
      if (css[j] === ")" && BARE_URL.test(bare)) target = bare
    }
    // Whatever else the call holds goes with it.
    while (j < css.length && css[j] !== ")") {
      const after = skipOpaque(css, j)
      j = after === j ? j + 1 : after
    }
    j = Math.min(j + 1, css.length)
    if (target === null || !allow(target)) out += "none"
    // Quoted, a `;` or a brace in the address can't be taken for syntax.
    else if (quote !== '"' && quote !== "'" && /[;{}]/.test(target)) out += `url("${target}")`
    else out += css.slice(i, j)
    i = j
  }
  return out
}

const NAME_CHARACTER = /^[A-Za-z0-9_-]$/

/**
 * A backslash escape spells any character of a name, so to a browser
 * `u\72l(` is `url(` and `f\69xed` is `fixed`. Escapes that spell a letter,
 * a digit, `-` or `_` are written out here, so the checks read the names the
 * browser reads. Quoted strings are left as they are, and so is a digit that
 * starts a name: `.\31 23` is the class `123`, and `.123` is not a selector.
 */
function plainNames(css: string): string {
  if (!css.includes("\\")) return css
  let out = ""
  let i = 0
  // Where the next character falls in a name: at its start, after a first `-`, or further in.
  let at: "start" | "dash" | "in" = "start"
  while (i < css.length) {
    const ch = css[i] as string
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i)
      out += css.slice(i, end)
      i = end
      at = "start"
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
        if (hex && /[ \t\n]/.test(css[i] ?? "")) i++
        const digit = /[0-9]/.test(spelled)
        const beforeDigit = spelled === "-" && at === "start" && /[0-9]/.test(css[i] ?? "")
        if (at !== "in" && (digit || beforeDigit)) {
          out += `\\${spelled.charCodeAt(0).toString(16)} `
          at = "in"
        } else {
          out += spelled
          at = spelled === "-" && at === "start" ? "dash" : "in"
        }
      } else {
        out += css.slice(i, i + 2)
        i += 2
        at = "in"
      }
    } else {
      out += ch
      i++
      if (ch === "-") at = at === "start" ? "dash" : "in"
      else at = /[A-Za-z0-9_]/.test(ch) || ch > "\x7f" ? "in" : "start"
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

function localUrl(target: string): boolean {
  return target.startsWith("#") || /^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(target)
}

/** Functions other than `url()` that load what they name. A string is enough for them. */
const LOADING_CALL = /(^|[^\w-])(?:(?:-webkit-)?image-set|image|src)\s*\(/gi

/** Every `position` in `code` with a value that can't pin. The value runs to the end of its declaration. */
function safePositions(code: string): string {
  const lead = /(?:^|[;{\s(])position\s*:/gi
  let out = ""
  let from = 0
  for (let match = lead.exec(code); match; match = lead.exec(code)) {
    const start = match.index + match[0].length
    let end = start
    let depth = 0
    for (; end < code.length; end++) {
      const ch = code[end] as string
      if (ch === ";" || ch === "{" || ch === "}") break
      if (ch === "(") depth++
      else if (ch === ")" && depth-- === 0) break
    }
    const value = code.slice(start, end)
    const keyword = value.trim()
    out += code.slice(from, start) + (keyword ? value.replace(keyword, () => safePosition(keyword)) : value)
    from = lead.lastIndex = end
  }
  return out + code.slice(from)
}

/**
 * Declarations, or the condition of a group rule, with what they may not say
 * taken out. A condition like `@supports (position: sticky)` styles nothing,
 * so its `position` is left as asked.
 */
function cleanValues(css: string, declarations = true): string {
  return outsideStrings(css, (code) => {
    const safe = code
      .replace(LOADING_CALL, "$1none(")
      .replace(/expression\s*\(/gi, "none(")
      .replace(/@import\b[^;]*;?/gi, " ")
    return declarations
      ? safePositions(safe.replace(/(-moz-binding|behavior)\s*:/gi, "--blocked:"))
      : safe
  })
}

/**
 * The stylesheet with no `/*` and no tag left in it. Nothing above joins
 * text, but a comment or a closing tag that took shape anyway would be read
 * by the browser and not by the checks. Inside a quoted string the same
 * characters are written as escapes, so `content: "<b>"` still shows `<b>`.
 */
function seal(css: string): string {
  let out = ""
  let start = 0
  let i = 0
  const code = (end: number) =>
    css
      .slice(start, end)
      .replace(/\/\*/g, "/ *")
      .replace(/<(?=[/!a-z])/gi, "< ")
  while (i < css.length) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      const end = skipString(css, i)
      out += code(i)
      for (let j = i; j < end; j++) {
        const next = css[j] as string
        const escaped = next === "\\" && j + 1 < end ? (css[++j] as string) : ""
        if (next === "<" || escaped === "<") out += "\\3c "
        else if (next === "*" && out.endsWith("/")) out += "\\2a "
        else out += next + escaped
      }
      start = i = end
    } else {
      i += ch === "\\" ? 2 : 1
    }
  }
  return out + code(css.length)
}

/** A selector's own pseudo-element, which has to stay last. */
const PSEUDO_ELEMENT = /^:(?::|(?:before|after|first-line|first-letter)(?![\w-]))/i

/**
 * Adds `guard` to the element a selector styles: the last compound, ahead of
 * its pseudo-element.
 */
function guardSubject(selector: string, guard: string): string {
  let depth = 0
  let at = -1
  let i = 0
  while (i < selector.length) {
    const next = skipOpaque(selector, i)
    if (next !== i) {
      i = next
      continue
    }
    const ch = selector[i] as string
    if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1)
    else if (depth === 0) {
      if (/[\s>+~]/.test(ch)) at = -1
      else if (ch === ":" && at === -1 && PSEUDO_ELEMENT.test(selector.slice(i, i + 14))) at = i
    }
    i++
  }
  return at === -1 ? selector + guard : selector.slice(0, at) + guard + selector.slice(at)
}

/**
 * A selector nested in the surface's rule normally means "inside the
 * surface". It stops meaning that when it names the surface itself (`&`),
 * as in `body:has(&) .sidebar`, or starts from a sibling (`+ .next`). Those
 * get a guard that holds the styled element inside the surface.
 */
function scopeSelector(selector: string, scope: string, top: boolean): string {
  const guard = `:where(${scope}, ${scope} *)`
  // Directly in the surface's rule, `&` is the surface, which is what a page-level name stands for.
  const own = top ? selector.replace(ROOT_SELECTOR, (_match, lead: string) => `${lead} &`) : selector
  return splitTop(own, ",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const inside = /^&[^&+~]*$/.test(part) ? !/:scope/i.test(part) : !/[&+~]|:scope/i.test(part)
      return inside ? part : guardSubject(part, guard)
    })
    .join(", ")
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
  const source = mapUrls(plainNames(stripComments(normalize(css))), localUrl)

  // `level` counts the style rules around a statement, not the `@media` blocks.
  const walk = (parts: Statement[], level: number, bare: boolean): string[] => {
    const rules: string[] = []
    for (const { prelude, block } of parts) {
      if (!prelude) continue
      const name = atRuleName(prelude)
      if (block === undefined) {
        if (name || !prelude.includes(":")) dropped.push(prelude)
        // A stray declaration outside any rule applies to the surface itself.
        else rules.push(bare ? `& { ${cleanValues(prelude)}; }` : `${cleanValues(prelude)};`)
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
      // `@` with no name after it, and a custom property whose value is a block.
      if (name ? !GROUP_RULES.has(name) : /^(?:@|--)/.test(prelude)) {
        dropped.push(prelude)
        continue
      }
      const inner = statements(`${block};`)
      let body: string
      if (inner.some((part) => part.block !== undefined)) {
        body = `\n${walk(inner, name ? level : level + 1, false).join("\n")}\n`
      } else {
        const kept = inner.filter((part) => {
          if (!atRuleName(part.prelude)) return part.prelude !== ""
          dropped.push(part.prelude)
          return false
        })
        const stated = inner.filter((part) => part.prelude !== "").length
        body = cleanValues(kept.length === stated ? block : ` ${kept.map((part) => part.prelude).join("; ")} `)
      }
      const head = name ? cleanValues(prelude, false) : scopeSelector(prelude, scope, level === 0)
      rules.push(`${head} {${body}}`)
    }
    return rules
  }

  let body = walk(statements(source), 0, true).join("\n")
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
  return { css: seal([frames, scoped].filter(Boolean).join("\n")), dropped }
}

const LOADING_NAME = /(?:^|[^\w-])(?:(?:-webkit-)?image-set|image|src)\s*\(/i
const UNSAFE_DECLARATION = /expression\s*\(|@import|[<>{};]|\/\*/i

/** `value` without its strings, so a check reads only what the browser takes for syntax. */
function codeOf(value: string): string {
  let code = ""
  outsideStrings(value, (part) => {
    code += `${part} `
    return part
  })
  return code
}

/**
 * Whether `value`, read as CSS, loads nothing: every `url()` in it is a
 * fragment naming something in the page, like a gradient or a mask. For an
 * SVG presentation attribute, which is CSS in an attribute.
 */
export function loadsNothing(value: string): boolean {
  const plain = plainNames(normalize(value))
  if (mapUrls(plain, (target) => target.startsWith("#")) !== plain) return false
  return !LOADING_NAME.test(codeOf(plain))
}

/**
 * Reads an inline `style="..."` string into a style object. Custom properties
 * keep their names; other properties become camelCase.
 */
export function parseInlineStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of splitTop(normalize(style), ";")) {
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
  if (!loadsNothing(value)) return null
  const plain = plainNames(normalize(value))
  // A string holds anything; what is outside one must not end the declaration.
  if (UNSAFE_DECLARATION.test(codeOf(plain))) return null
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
