import { camel, capitalize, type PropsDialect } from "@open-intelligent-ui/core/renderer"

/** DOM events markup is likely to name. On a component these reach its element. */
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
  "beforeinput",
  "beforematch",
  "invalid",
])

/**
 * How UI SDK's Solid parts spell the events they handle themselves. A part
 * looks for the author's handler under exactly this name and runs it before
 * its own; under any other spelling the two would fight over one listener.
 */
const PART_EVENTS: Record<string, string> = {
  beforeinput: "onBeforeInput",
  beforematch: "onBeforeMatch",
  contextmenu: "onContextMenu",
  dblclick: "onDblClick",
  focusin: "onFocusIn",
  focusout: "onFocusOut",
  keydown: "onKeyDown",
  keyup: "onKeyUp",
  mousedown: "onMouseDown",
  pointerdown: "onPointerDown",
  pointerenter: "onPointerEnter",
  pointerleave: "onPointerLeave",
  pointermove: "onPointerMove",
  pointerup: "onPointerUp",
}

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

/** The DOM event markup means, in lower case. */
function domEvent(name: string): string {
  const event = name.toLowerCase().replace(/-/g, "")
  if (event === "doubleclick") return "dblclick"
  // Markup's `change` means what React's does: every edit, not only the
  // committed one. The DOM calls that `input`.
  if (event === "change") return "input"
  return event
}

function eventProp(name: string, kind: string): string {
  // Solid finds the event by lowering whatever follows `on`, so one spelling
  // per event is enough, and it is the one the primitives' views use.
  if (kind === "html" || kind === "svg") return `on${capitalize(domEvent(name))}`
  if (kind !== "component") {
    const event = domEvent(name)
    if (DOM_EVENTS.has(event)) {
      if (kind === "ui-sdk") return PART_EVENTS[event] ?? `on${capitalize(event)}`
      return `on${capitalize(event)}`
    }
  }
  // A component's own events keep their case: `valueChange` is `onValueChange`.
  return `on${capitalize(camel(name))}`
}

/** How Solid names props: attributes as the DOM spells them, `class`, `onClick`. */
export const solidDialect: PropsDialect = {
  className: "class",
  html: (lower) => {
    // Named apart from `value` and `checked`, which are the live properties.
    if (lower === "defaultvalue") return "defaultValue"
    if (lower === "defaultchecked") return "defaultChecked"
    return lower
  },
  svg: (lower, written) => {
    const known = SVG_NAMES.get(lower)
    if (known) return known
    if (written.includes("-") || written.includes(":")) return written
    return written.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
  },
  // Markup is written the way JSX for React is; Solid keeps the attribute's own name.
  prop: (name) => (name === "htmlFor" ? "for" : name),
  event: eventProp,
  handler: (name, kind) => eventProp(name.slice(2), kind),
  bindEvent: (tag, argument) => {
    if (argument === "open") return "onToggle"
    if (argument === "value" && tag !== "select") return "onInput"
    return "onChange"
  },
  bindProps: (argument) => [`on${capitalize(argument)}Change`],
}
