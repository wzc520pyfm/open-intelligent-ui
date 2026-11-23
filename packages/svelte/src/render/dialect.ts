import { camel, capitalize, type PropsDialect } from "@open-intelligent-ui/core/renderer"

/**
 * DOM events markup is likely to name. On a component these are listened for
 * on its element, where Svelte spells them in lower case: `onkeydown`.
 */
export const DOM_EVENTS = new Set([
  "click",
  "dblclick",
  "input",
  "change",
  "submit",
  "reset",
  "focus",
  "blur",
  "focusin",
  "focusout",
  "keydown",
  "keyup",
  "keypress",
  "mousedown",
  "mouseup",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointerenter",
  "pointerleave",
  "pointermove",
  "pointercancel",
  "pointerover",
  "pointerout",
  "touchstart",
  "touchend",
  "touchmove",
  "touchcancel",
  "contextmenu",
  "wheel",
  "scroll",
  "dragstart",
  "dragend",
  "dragover",
  "dragenter",
  "dragleave",
  "drag",
  "drop",
  "animationstart",
  "animationend",
  "animationiteration",
  "transitionend",
  "load",
  "error",
  "toggle",
  "copy",
  "cut",
  "paste",
])

/** SVG attributes that really are camelCase. Everything else camelCase is JSX spelling. */
const SVG_NAMES = new Map(
  [
    "viewBox",
    "preserveAspectRatio",
    "pathLength",
    "gradientUnits",
    "gradientTransform",
    "spreadMethod",
    "patternUnits",
    "patternContentUnits",
    "patternTransform",
    "clipPathUnits",
    "maskUnits",
    "maskContentUnits",
    "markerWidth",
    "markerHeight",
    "markerUnits",
    "refX",
    "refY",
    "textLength",
    "lengthAdjust",
    "startOffset",
    "stdDeviation",
    "filterUnits",
    "primitiveUnits",
    "baseFrequency",
    "numOctaves",
    "tableValues",
    "kernelMatrix",
    "edgeMode",
    "xChannelSelector",
    "yChannelSelector",
    "surfaceScale",
    "diffuseConstant",
    "specularConstant",
    "specularExponent",
    "repeatCount",
    "repeatDur",
    "attributeName",
    "calcMode",
    "keyTimes",
    "keySplines",
    "keyPoints",
  ].map((name) => [name.toLowerCase(), name])
)

/** The DOM's name for an event however markup spells it: `keyDown`, `key-down`, `doubleClick`. */
function domEvent(name: string): string {
  const event = name.toLowerCase().replace(/-/g, "")
  if (event === "doubleclick") return "dblclick"
  return event
}

function eventProp(name: string, kind: string): string {
  const event = domEvent(name)
  // Markup's `change` means what React's does: every edit, not only the
  // committed one. The DOM calls that `input`.
  const heard = event === "change" ? "input" : event
  if (kind === "html" || kind === "svg") return `on${heard}`
  // The renderer's own parts and UI SDK read a DOM event under one
  // capitalized word, `onKeydown`; `componentProps` gives it the lower case
  // an element listens under. A component's own events keep their case:
  // `valueChange` is `onValueChange`.
  if (kind !== "component" && DOM_EVENTS.has(event)) return `on${capitalize(heard)}`
  return `on${capitalize(camel(name))}`
}

/** How Svelte names props: attributes as the DOM spells them, `class`, `onclick`. */
export const svelteDialect: PropsDialect = {
  className: "class",
  // Svelte reads `defaultvalue` as the `defaultValue` property, which sets
  // the starting value and leaves what was typed alone.
  html: (lower) => lower,
  svg: (lower, written) => {
    const known = SVG_NAMES.get(lower)
    if (known) return known
    if (written.includes("-") || written.includes(":")) return written
    return written.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  },
  prop: (name) => name,
  event: eventProp,
  handler: (name, kind) => eventProp(name.slice(2), kind),
  bindEvent: (tag, argument) => {
    if (argument === "open") return "ontoggle"
    if (argument === "value" && tag !== "select") return "oninput"
    return "onchange"
  },
  // UI SDK reports every change as `valueChange`, and so may a component of
  // the host's. One written with `$bindable` writes the prop instead;
  // `bind:value` asks `componentProps` to make the prop writable for it.
  bindProps: (argument) => [`on${capitalize(argument)}Change`, `bind:${argument}`],
}
