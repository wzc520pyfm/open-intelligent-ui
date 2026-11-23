import { camel, capitalize, type PropsDialect } from "@open-intelligent-ui/core/renderer"

/**
 * DOM events markup is likely to name. On a component these are listened for
 * on its element, so `keyDown` and `keydown` both have to become `onKeydown`.
 */
const DOM_EVENTS = new Set([
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

function domEvent(name: string): string {
  let event = name.toLowerCase().replace(/-/g, "")
  if (event === "doubleclick") event = "dblclick"
  // Markup's `change` means what React's does: every edit, not only the
  // committed one. The DOM calls that `input`.
  if (event === "change") event = "input"
  // Vue reads `onKeyDown` as the event `key-down`; a DOM event is one word.
  return `on${capitalize(event)}`
}

function eventProp(name: string, kind: string): string {
  if (kind === "html" || kind === "svg") return domEvent(name)
  // A component's own events keep their case: `valueChange` is `onValueChange`.
  if (kind !== "component" && DOM_EVENTS.has(name.toLowerCase().replace(/-/g, ""))) {
    return domEvent(name)
  }
  return `on${capitalize(camel(name))}`
}

/** How Vue names props: attributes as the DOM spells them, `class`, `onKeydown`. */
export const vueDialect: PropsDialect = {
  className: "class",
  html: (lower) => {
    // An attribute, not the live property, so it only sets the starting value.
    if (lower === "defaultvalue") return "^value"
    if (lower === "defaultchecked") return "^checked"
    return lower
  },
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
    if (argument === "open") return "onToggle"
    if (argument === "value" && tag !== "select") return "onInput"
    return "onChange"
  },
}
