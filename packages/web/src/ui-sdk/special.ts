import { type Child, type ElementVNode, fragment, h, type Listener } from "../dom/node"
import { type Adopted, adopt } from "../dom/patch"
import { UI_SDK_ELEMENTS, type UiSdkElement } from "../registry/ui-sdk.generated"
import { nativeElement } from "../render/native"
import { drawElement, type Special } from "./adapter"

/**
 * The components the plain mapping doesn't cover: names with no custom
 * element of their own, and parts whose React form repeats or generates
 * children where the custom element wants them written out or templated.
 */

/** React draws these as the native element; the custom element around them finds it by tag. */
const native = (tag: string): Special => ({
  draw: (props, key) => nativeElement(tag, withoutFunctions(props), key, []),
  scoped: (props, key) => nativeElement(tag, withoutFunctions(props), key, []),
})

/** Handlers stay; any other function has no attribute to be. */
function withoutFunctions(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(props)) {
    if (typeof value !== "function" || /^on[A-Z]/.test(name)) out[name === "className" ? "class" : name] = value
  }
  return out
}

const WEEKS: UiSdkElement = { tag: "ui-calendar-weeks" }
const WEEKDAYS: UiSdkElement = { tag: "ui-calendar-weekdays" }
const DAYS_IN_WEEK = 7

/** Whether markup put anything inside a part. */
export const hasContent = (children: Child[]): boolean =>
  children.flat(Infinity as 1).some((child) => child !== null && child !== undefined && child !== false && child !== "")

/** Draws a part with the text React gives it when markup leaves it empty. */
const filled = (name: string, text: string): Special => ({
  draw: (props, key, children) =>
    drawElement(UI_SDK_ELEMENTS[name] as UiSdkElement, props, key, hasContent(children) ? children : [text]),
})

/** Draws a part with the role of the native element React renders it as. */
const withRole = (name: string, role: string): Special => ({
  draw: (props, key, children) =>
    drawElement(UI_SDK_ELEMENTS[name] as UiSdkElement, { role, ...props }, key, children),
})

const elementsOnly = (children: Child[]): Child[] =>
  children.flat(Infinity as 1).filter((child) => typeof child === "object" && child !== null)

/**
 * React's `Button` takes the press as `onClick` and stays pending while what
 * it returns is running. The element reports the same press as `action`,
 * which a disabled or pending button doesn't fire, and waits on `waitUntil`.
 * The handler still gets the click that caused it.
 */
function press(handler: (...args: unknown[]) => unknown): Record<string, Listener> {
  let click: Event | null = null
  return {
    "click@capture": (event) => {
      click = event
    },
    action: (event) => {
      const detail = (event as CustomEvent).detail as { waitUntil?: (work: Promise<unknown>) => void } | null
      const result = handler(click ?? event, detail)
      click = null
      if (result instanceof Promise) detail?.waitUntil?.(result)
    },
  }
}

/** What a calendar hands to the markup of a day. */
interface Cell {
  date: string
  hidden: boolean
}

interface Days {
  /** Draws the day markup wrote, for one cell. */
  draw: (cell: Cell) => ElementVNode | undefined
  /** Whether markup put anything of its own inside the day. */
  filled: boolean
  adopted: Map<Element, Adopted>
  /** What stands in a day markup filled with nothing, so the element doesn't write a date there. */
  keepers: WeakMap<Element, Element>
  observer: MutationObserver | null
}

const calendars = new WeakMap<Element, Days>()

const isDay = (child: Child | undefined): child is ElementVNode =>
  typeof child === "object" && child !== null && !Array.isArray(child) && child.kind === "element" && child.tag === "ui-calendar-day"

const placeholder = (): ElementVNode => h("span", { attrs: { hidden: "" } })

/**
 * The element lays the weeks out and copies its template once per day,
 * which gives every day the same content. Each day it made is taken over
 * here and drawn as markup wrote it for that date.
 */
function drawDays(weeks: Element) {
  const days = calendars.get(weeks)
  if (!days) return
  const present = new Set<Element>(weeks.querySelectorAll("ui-calendar-day"))
  for (const [element, adopted] of days.adopted) {
    if (present.has(element)) continue
    adopted.unmount()
    days.adopted.delete(element)
  }
  for (const element of present) {
    const day = days.draw({ date: element.getAttribute("value") ?? "", hidden: false })
    if (!day) continue
    let adopted = days.adopted.get(element)
    if (!adopted) {
      if (days.filled) element.replaceChildren()
      adopted = adopt(element)
      days.adopted.set(element, adopted)
    }
    adopted.render(day)
    if (days.filled) keepFilled(element, days)
  }
  // What was just drawn is no news.
  days.observer?.takeRecords()
}

/** The element writes the date into a day it finds empty, and goes on writing it there. */
function keepFilled(day: Element, days: Days) {
  const keeper = days.keepers.get(day)
  const blank = ![...day.children].some((child) => child !== keeper) && !day.textContent?.trim()
  if (blank && !keeper?.isConnected) {
    const stand = document.createElement("span")
    stand.hidden = true
    days.keepers.set(day, stand)
    day.appendChild(stand)
  } else if (!blank && keeper?.isConnected) {
    keeper.remove()
  }
}

function watchDays(draw: Days["draw"], filled: boolean) {
  const safely = (weeks: Element) => {
    try {
      drawDays(weeks)
    } catch (error) {
      console.error(error)
    }
  }
  return {
    mounted(weeks: Element) {
      const days: Days = { draw, filled, adopted: new Map(), keepers: new WeakMap(), observer: null }
      calendars.set(weeks, days)
      if (typeof MutationObserver !== "undefined") {
        days.observer = new MutationObserver((records) => {
          // Only the weeks and days the element adds or takes away; what is drawn inside a day is this renderer's.
          const laidOut = records.some(
            (record) => record.target === weeks || (record.target as Element).localName === "ui-calendar-week"
          )
          if (laidOut) safely(weeks)
        })
        days.observer.observe(weeks, { childList: true, subtree: true })
      }
      drawDays(weeks)
    },
    updated(weeks: Element) {
      const days = calendars.get(weeks)
      if (!days) return
      days.draw = draw
      days.filled = filled
      drawDays(weeks)
    },
    removed(weeks: Element) {
      const days = calendars.get(weeks)
      if (!days) return
      days.observer?.disconnect()
      for (const adopted of days.adopted.values()) adopted.unmount()
      calendars.delete(weeks)
    },
  }
}

export const SPECIALS: Record<string, Special> = {
  Button: {
    draw: (props, key, children) => {
      const { onClick, ...rest } = props
      const node = drawElement(UI_SDK_ELEMENTS.Button as UiSdkElement, rest, key, children)
      if (typeof onClick === "function") {
        node.on = { ...node.on, ...press(onClick as (...args: unknown[]) => unknown) }
      }
      return node
    },
  },

  AvatarImage: native("img"),
  // A field set is named by a native <legend>, the first thing in its <fieldset>.
  FieldLegend: {
    draw: (props, key, children) => nativeElement("legend", withoutFunctions(props), key, children),
  },
  PasswordInputControl: native("input"),
  FieldControl: native("input"),

  CalendarPrevious: filled("CalendarPrevious", "\u2039"),
  CalendarNext: filled("CalendarNext", "\u203a"),
  FieldDescription: withRole("FieldDescription", "paragraph"),

  // React repeats the children once per star; the element takes the stars written out.
  Rating: {
    draw: (props, key, children) => {
      const spec = UI_SDK_ELEMENTS.Rating as UiSdkElement
      const max = Math.max(0, Math.min(Math.floor(Number(props.max ?? 5)) || 0, 50))
      const stars = children.length
        ? Array.from({ length: max }, (_, index) => fragment(children, index))
        : []
      return drawElement(spec, props, key, stars)
    },
  },

  // The weekday names sit in a row the element looks for, one cell per day.
  CalendarWeekdays: {
    draw: (props, key, children) =>
      drawElement(WEEKDAYS, props, key, [h("div", { attrs: { role: "row" } }, children)]),
    scoped: (props, key, _lets, render) =>
      drawElement(WEEKDAYS, props, key, [
        h(
          "div",
          { attrs: { role: "row" } },
          Array.from({ length: DAYS_IN_WEEK }, (_, index) => fragment(render([index]), index))
        ),
      ]),
  },

  // The element lays out the weeks itself and copies the day in its template;
  // each copy is then drawn as markup wrote it for that date.
  CalendarWeeks: {
    draw: (props, key) => drawElement(WEEKS, props, key, []),
    scoped: (props, key, _lets, render) => {
      const draw = (cell: Cell) => {
        const day = elementsOnly(render([cell]))[0]
        return isDay(day) ? day : undefined
      }
      const sample = draw({ date: "", hidden: false })
      if (!sample) return drawElement(WEEKS, props, key, [])
      const filled = sample.children.length > 0
      const node = drawElement(WEEKS, props, key, [
        h("template", { key: "day" }, [h("ui-calendar-day", {}, filled ? [placeholder()] : [])]),
      ])
      node.hooks = watchDays(draw, filled)
      return node
    },
  },
}

/** Specials that need more of UI SDK than the element, loaded with their entry point. */
export const SPECIAL_LOADERS: Record<string, () => Promise<Record<string, Special>>> = {
  pagination: () => import("./special/pagination").then((module) => module.SPECIALS),
  "file-input": () => import("./special/file-input").then((module) => module.SPECIALS),
}
