import { DEFAULT_DESIGN, type Design, designToCss, parseDesign, scopeCss } from "../index"

/** How long a toast stays up, in milliseconds. */
export const TOAST_LIFETIME = 4000

/** How many toasts are on screen at once. */
export const TOAST_LIMIT = 4

export interface Toast {
  id: number
  message: string
  tone: string | undefined
}

/** Makes CSS safe to put inside a `<style>` element. */
export function styleText(css: string): string {
  return css.replace(/<\//g, "<\\/")
}

function rootSelector(id: string): string {
  return `.iui-root[data-iui-id="${id}"]`
}

/** The design's tokens as CSS for the surface with this id. */
export function designCss(design: string | Design | undefined, id: string): string {
  const parsed = typeof design === "object" ? design : parseDesign(design || DEFAULT_DESIGN)
  return designToCss(parsed, { selector: rootSelector(id) })
}

/** The model's own `<style>` sheets, confined to the surface with this id. */
export function modelCss(styles: readonly string[], id: string): string {
  return styles
    .filter(Boolean)
    .map((css) => scopeCss(css, rootSelector(id), id).css)
    .join("\n")
}

/** What the built-in handling does with a link the surface asks to open. */
export function openUrl(url: string): void {
  if (/^(https?:|mailto:|tel:)/i.test(url)) {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

export function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {})
}

/** Whether the markup uses `morph`, and so whether actions run inside a view transition. */
export function usesMorph(source: string): boolean {
  return /\bmorph\s*=/.test(source)
}

type StartViewTransition = (
  update: () => void | Promise<void>
) => { finished?: Promise<unknown> } | undefined

/** `document.startViewTransition`, when the browser has it and motion is welcome. */
function viewTransition(): StartViewTransition | null {
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition
  if (typeof start !== "function") return null
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null
  return start.bind(document)
}

/** True when nothing clips the element: it is whole inside the viewport and every scrolling ancestor. */
function inView(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  let top = 0
  let left = 0
  let bottom = window.innerHeight
  let right = window.innerWidth
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(parent)
    if (overflowX === "visible" && overflowY === "visible") continue
    const box = parent.getBoundingClientRect()
    top = Math.max(top, box.top)
    left = Math.max(left, box.left)
    bottom = Math.min(bottom, box.bottom)
    right = Math.min(right, box.right)
  }
  return (
    rect.top >= top - 1 && rect.left >= left - 1 && rect.bottom <= bottom + 1 && rect.right <= right + 1
  )
}

/**
 * Gives `morph` elements their view-transition names for one snapshot.
 *
 * A named element is drawn above the whole page while the transition runs,
 * so one that a scroll container is hiding would show through for that
 * moment. Only elements in full view take part; the rest change in place.
 * A name can be on screen once, so the first element with it wins.
 */
function nameMorphs(root: HTMLElement | null): void {
  if (!root) return
  const taken = new Set<string>()
  for (const element of root.querySelectorAll<HTMLElement>("[data-iui-morph]")) {
    const name = element.dataset.iuiMorph as string
    const named = !taken.has(name) && inView(element)
    if (named) taken.add(name)
    element.style.viewTransitionName = named ? name : ""
  }
}

/**
 * Keeps the element the reader acted on above the others while it travels.
 * Returns a function that undoes it.
 */
function raiseActiveMorph(root: HTMLElement | null): () => void {
  const active = document.activeElement
  const source = active && root?.contains(active) ? active.closest<HTMLElement>("[data-iui-morph]") : null
  const name = source?.dataset.iuiMorph
  if (!name) return () => {}
  const style = document.createElement("style")
  style.textContent = `::view-transition-group(${name}) { z-index: 1; }`
  document.head.append(style)
  return () => style.remove()
}

function clearMorphs(root: HTMLElement | null): void {
  if (!root) return
  for (const element of root.querySelectorAll<HTMLElement>("[data-iui-morph]")) {
    element.style.viewTransitionName = ""
  }
}

/** The latest morph on each surface: only that one clears the surface's names. */
const morphRuns = new WeakMap<HTMLElement, object>()

/**
 * Runs `update` inside a view transition, so elements that share a `morph`
 * name glide to where the new state puts them. `update` must leave the DOM
 * changed by the time it returns, or by the time its promise settles.
 * Returns false, having done nothing, when the browser can't or the reader
 * asked for less motion.
 */
export function runMorph(root: () => HTMLElement | null, update: () => void | Promise<void>): boolean {
  const transition = viewTransition()
  if (!transition) return false
  // The browser runs the update on its next frame.
  const run = {}
  const surface = root()
  if (surface) morphRuns.set(surface, run)
  nameMorphs(surface)
  const lower = raiseActiveMorph(root())
  const rename = () => nameMorphs(root())
  const started = transition(() => {
    const result = update()
    if (result instanceof Promise) return result.then(rename)
    rename()
  })
  const done = () => {
    lower()
    if (surface && morphRuns.get(surface) !== run) return
    clearMorphs(root())
  }
  if (started?.finished) started.finished.then(done, done)
  else done()
  return true
}

/**
 * Resolves when the exit animations under `element` have played, or returns
 * `null` when there are none to wait for. An animation that repeats forever,
 * a spinner inside what is leaving, is not waited for: it never ends.
 */
export function exitAnimations(element: Element | null): Promise<unknown> | null {
  const ending = (element?.getAnimations?.({ subtree: true }) ?? []).filter((animation) => {
    const end = animation.effect?.getComputedTiming?.().endTime
    return end === undefined || Number.isFinite(Number(end))
  })
  return ending.length ? Promise.allSettled(ending.map((animation) => animation.finished)) : null
}

/**
 * Runs an action or a state write, turning a failure, now or later, into a
 * call to `fail` so one bad handler can't take the surface down.
 */
export function guard(work: () => unknown, fail: (message: string) => void): unknown {
  const report = (error: unknown) => fail(error instanceof Error ? error.message : String(error))
  try {
    const result = work()
    if (result instanceof Promise) {
      return result.catch((error: unknown) => {
        report(error)
      })
    }
    return result
  } catch (error) {
    report(error)
    return undefined
  }
}
