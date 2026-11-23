import { camel, capitalize, type PropsDialect } from "@open-intelligent-ui/core/renderer"

/** Attributes whose React prop isn't the attribute name. */
const REACT_NAMES: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  readonly: "readOnly",
  minlength: "minLength",
  maxlength: "maxLength",
  inputmode: "inputMode",
  autocomplete: "autoComplete",
  spellcheck: "spellCheck",
  datetime: "dateTime",
  colspan: "colSpan",
  rowspan: "rowSpan",
  referrerpolicy: "referrerPolicy",
  defaultvalue: "defaultValue",
  defaultchecked: "defaultChecked",
  viewbox: "viewBox",
  "xlink:href": "href",
}

/** DOM event names whose React prop isn't just the capitalized name. */
const EVENT_NAMES: Record<string, string> = {
  dblclick: "onDoubleClick",
  doubleclick: "onDoubleClick",
  keydown: "onKeyDown",
  keyup: "onKeyUp",
  keypress: "onKeyPress",
  mousedown: "onMouseDown",
  mouseup: "onMouseUp",
  mouseenter: "onMouseEnter",
  mouseleave: "onMouseLeave",
  mousemove: "onMouseMove",
  mouseover: "onMouseOver",
  mouseout: "onMouseOut",
  pointerdown: "onPointerDown",
  pointerup: "onPointerUp",
  pointerenter: "onPointerEnter",
  pointerleave: "onPointerLeave",
  pointermove: "onPointerMove",
  pointercancel: "onPointerCancel",
  touchstart: "onTouchStart",
  touchend: "onTouchEnd",
  touchmove: "onTouchMove",
  contextmenu: "onContextMenu",
  dragstart: "onDragStart",
  dragend: "onDragEnd",
  dragover: "onDragOver",
  dragenter: "onDragEnter",
  dragleave: "onDragLeave",
  animationend: "onAnimationEnd",
  transitionend: "onTransitionEnd",
}

/** The React prop for a DOM event, e.g. `keydown` to `onKeyDown`. */
export function eventProp(name: string, dom = true): string {
  if (dom && Object.hasOwn(EVENT_NAMES, name.toLowerCase())) {
    return EVENT_NAMES[name.toLowerCase()] as string
  }
  return `on${capitalize(camel(name))}`
}

/** The React prop for an attribute written the way the DOM spells it. */
export function attributeProp(name: string): string {
  if (Object.hasOwn(REACT_NAMES, name)) return REACT_NAMES[name] as string
  if (name.startsWith("aria-") || name.startsWith("data-")) return name
  return name.includes("-") ? camel(name) : name
}

/** How React names props: camelCase attributes, `className`, `onKeyDown`. */
export const reactDialect: PropsDialect = {
  className: "className",
  html: (lower, written) => REACT_NAMES[lower] ?? written,
  svg: (lower, written) =>
    REACT_NAMES[lower] ??
    (written.includes("-") || written.includes(":") ? camel(written) : written),
  prop: (name) => (name === "for" ? "htmlFor" : name),
  // The host's own components name their events themselves.
  event: (name, kind) => eventProp(name, kind !== "component"),
  handler: (name) => name,
  bindEvent: (_tag, argument) => (argument === "open" ? "onToggle" : "onChange"),
}
