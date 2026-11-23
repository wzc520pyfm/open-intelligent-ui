import type { AtRule, Plugin } from "postcss"
import selectorParser from "postcss-selector-parser"

const SITE_LAYERS = new Set(["theme", "base", "components", "utilities"])
const GUARD = ":where(:not(.iui-root, .iui-root *))"
const LEGACY_PSEUDO_ELEMENTS = new Set([":before", ":after", ":first-line", ":first-letter"])

function isPseudoElement(node: selectorParser.Node): boolean {
  return (
    node.type === "pseudo" &&
    (node.value.startsWith("::") || LEGACY_PSEUDO_ELEMENTS.has(node.value.toLowerCase()))
  )
}

/** The root element is never inside a surface, and `&` stands for an element already dealt with. */
function needsNoGuard(node: selectorParser.Node): boolean {
  return (
    node.type === "nesting" ||
    (node.type === "tag" && node.value.toLowerCase() === "html") ||
    (node.type === "pseudo" && (node.value === ":root" || node.value === ":host"))
  )
}

const processor = selectorParser((list) => {
  list.each((selector) => {
    let start = 0
    selector.each((node, index) => {
      if (node.type === "combinator") start = index + 1
    })
    const subject = selector.nodes.slice(start)
    if (subject.length === 0 || subject.some(needsNoGuard)) return
    const guard = selectorParser.pseudo({ value: GUARD })
    const pseudoElement = subject.find(isPseudoElement)
    if (!pseudoElement) {
      selector.append(guard)
      return
    }
    // Space between the guard and the pseudo-element would read as "any descendant".
    guard.spaces.before = pseudoElement.spaces.before
    pseudoElement.spaces.before = ""
    selector.insertBefore(pseudoElement, guard)
  })
})

/**
 * Makes a selector match only outside a generated surface. What is added
 * sits in `:where()`, so the selector's specificity stays what it was.
 */
export function outsideSurfaces(selector: string): string {
  return processor.processSync(selector)
}

/**
 * The site is drawn with Tailwind and HeroUI, whose reset and class names
 * (`.card`, `.button`, `svg { display: block }`) would otherwise reach into a
 * generated surface and change how it looks. Every selector in their layers
 * is rewritten to stop where a surface begins, so a surface looks the way it
 * does on a bare page.
 */
export const keepSiteStylesOutOfSurfaces: Plugin = {
  postcssPlugin: "keep-site-styles-out-of-surfaces",
  Once(root) {
    root.each((layer) => {
      if (layer.type !== "atrule" || layer.name !== "layer" || !SITE_LAYERS.has(layer.params)) return
      layer.walkRules((rule) => {
        const parent = rule.parent
        if (parent?.type === "atrule" && /keyframes$/.test((parent as AtRule).name)) return
        rule.selector = outsideSurfaces(rule.selector)
      })
    })
  },
}
