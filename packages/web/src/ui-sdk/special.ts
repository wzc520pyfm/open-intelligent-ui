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
  adopted: Map<Element, Adopted>
  /** The date as the calendar words it, which the element writes into each day it makes. */
  labels: WeakMap<Element, string>
  /** The days that hold what markup put in them, where that date stood. */
  filled: WeakSet<Element>
  observer: MutationObserver | null
}

const calendars = new WeakMap<Element, Days>()

const isDay = (child: Child | undefined): child is ElementVNode =>
  typeof child === "object" && child !== null && !Array.isArray(child) && child.kind === "element" && child.tag === "ui-calendar-day"

/**
 * The days the element has written the date into again, over what was drawn
 * there. It does that by setting their text, which is the one change that
 * takes every node out of a day and puts a single text node in.
 */
function rewritten(records: MutationRecord[], days: Days): Set<Element> {
  const found = new Set<Element>()
  for (const record of records) {
    const day = record.target as Element
    const [added] = record.addedNodes
    if (!days.adopted.has(day) || record.addedNodes.length !== 1 || record.removedNodes.length === 0) continue
    if (added?.nodeType === 3 && day.childNodes.length === 1 && day.firstChild === added) found.add(day)
  }
  return found
}

/**
 * The element lays the weeks out and copies its template once per day,
 * writing the date into each. Each day it made is taken over here and drawn
 * as markup wrote it for that date: with what markup put in it, or, where
 * markup put nothing, with the date the element wrote.
 */
function drawDays(weeks: Element, records: MutationRecord[] = []) {
  const days = calendars.get(weeks)
  if (!days) return
  const again = rewritten([...records, ...(days.observer?.takeRecords() ?? [])], days)
  const present = new Set<Element>(weeks.querySelectorAll("ui-calendar-day"))
  for (const [element, adopted] of days.adopted) {
    if (present.has(element)) continue
    adopted.unmount()
    days.adopted.delete(element)
  }
  for (const element of present) {
    const day = days.draw({ date: element.getAttribute("value") ?? "", hidden: false })
    if (!day) continue
    const bare = { ...day, children: [] }
    let adopted = days.adopted.get(element)
    if (!adopted) {
      adopted = adopt(element)
      days.adopted.set(element, adopted)
      days.labels.set(element, element.textContent ?? "")
    } else if (again.has(element)) {
      // What was drawn is off the page already; this forgets it.
      adopted.render(bare)
      days.labels.set(element, element.textContent ?? "")
      days.filled.delete(element)
    }
    if (day.children.length === 0) {
      adopted.render(bare)
      if (days.filled.has(element)) element.textContent = days.labels.get(element) ?? ""
      days.filled.delete(element)
    } else {
      if (!days.filled.has(element)) element.replaceChildren()
      days.filled.add(element)
      adopted.render(day)
    }
  }
  // What was just drawn is no news.
  days.observer?.takeRecords()
}

function watchDays(draw: Days["draw"]) {
  const safely = (weeks: Element, records?: MutationRecord[]) => {
    try {
      drawDays(weeks, records)
    } catch (error) {
      console.error(error)
    }
  }
  const watch = (weeks: Element) => {
    const days: Days = { draw, adopted: new Map(), labels: new WeakMap(), filled: new WeakSet(), observer: null }
    calendars.set(weeks, days)
    if (typeof MutationObserver === "undefined") return
    days.observer = new MutationObserver((records) => {
      // The weeks and days the element adds or takes away, and the days it writes the date into again.
      const news = records.some(
        (record) =>
          record.target === weeks ||
          (record.target as Element).localName === "ui-calendar-week" ||
          rewritten([record], days).size > 0
      )
      if (news) safely(weeks, records)
    })
    days.observer.observe(weeks, { childList: true, subtree: true })
  }
  return {
    mounted(weeks: Element) {
      watch(weeks)
      safely(weeks)
    },
    updated(weeks: Element) {
      const days = calendars.get(weeks)
      // The weeks may have stood on the page before markup gave them a day.
      if (days) days.draw = draw
      else watch(weeks)
      safely(weeks)
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
      if (!draw({ date: "", hidden: false })) return drawElement(WEEKS, props, key, [])
      const node = drawElement(WEEKS, props, key, [h("template", { key: "day" }, [h("ui-calendar-day")])])
      node.hooks = watchDays(draw)
      return node
    },
  },
}

/** Specials that need more of UI SDK than the element, loaded with their entry point. */
export const SPECIAL_LOADERS: Record<string, () => Promise<Record<string, Special>>> = {
  pagination: () => import("./special/pagination").then((module) => module.SPECIALS),
  "file-input": () => import("./special/file-input").then((module) => module.SPECIALS),
}
