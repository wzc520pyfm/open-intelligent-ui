/** Layout and content primitives the renderer draws with design tokens. */
export const PRIMITIVE_TAGS = new Set([
  "box",
  "row",
  "grid",
  "grid-item",
  "card",
  "text",
  "title",
  "badge",
  "icon",
  "divider",
  "spacer",
  "image",
  "link",
  "list",
  "list-item",
])

/** Tags that declare state, data, styles or templates instead of drawing. */
export const DECLARATION_TAGS = new Set([
  "state",
  "derive",
  "query",
  "define",
  "slot",
  "style",
])

export const HTML_TAGS = new Set([
  "a",
  "abbr",
  "article",
  "aside",
  "b",
  "blockquote",
  "br",
  "button",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "li",
  "main",
  "mark",
  "meter",
  "nav",
  "ol",
  "option",
  "output",
  "p",
  "pre",
  "progress",
  "q",
  "s",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "wbr",
])

export const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "tspan",
  "textPath",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "marker",
  "symbol",
  "use",
  "desc",
  "filter",
  "feGaussianBlur",
  "feDropShadow",
  "feOffset",
  "feBlend",
  "feColorMatrix",
  "feComposite",
  "feFlood",
  "feMerge",
  "feMergeNode",
])

/** Parsed and then dropped, so their content never reaches the page. */
export const BLOCKED_TAGS = new Set([
  "script",
  "iframe",
  "object",
  "embed",
  "meta",
  "base",
  "frame",
  "frameset",
  "applet",
  "noscript",
  "template",
  "animate",
  "animateTransform",
  "animateMotion",
  "set",
  "foreignObject",
])

export const VOID_TAGS = new Set([
  "br",
  "hr",
  "img",
  "input",
  "col",
  "wbr",
  "divider",
  "spacer",
  "icon",
  "image",
  "slot",
  "state",
  "derive",
  "query",
])

/** Their content is kept as written: no tags, no expressions, no Markdown. */
export const RAW_TEXT_TAGS = new Set(["style", "pre"])

export function isComponentName(name: string): boolean {
  const first = name.charCodeAt(0)
  return first >= 65 && first <= 90
}

/** Whether `<name` starts a tag rather than being text such as `a < b`. */
export function isKnownTag(name: string): boolean {
  return (
    isComponentName(name) ||
    PRIMITIVE_TAGS.has(name) ||
    DECLARATION_TAGS.has(name) ||
    HTML_TAGS.has(name) ||
    SVG_TAGS.has(name) ||
    BLOCKED_TAGS.has(name)
  )
}
