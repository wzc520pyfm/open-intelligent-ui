import { flushSync, mount, tick, unmount } from "svelte"
import { vi } from "vitest"
import { IntelligentUI, type IntelligentUIHandle, type IntelligentUIProps } from "../src"

export type Props = IntelligentUIProps

const mounted = new Set<() => void>()

/** Has something undone once the test is over, whether it passed or not. */
export function afterTest(undo: () => void) {
  mounted.add(undo)
}

/** Takes every surface a test drew off the page, and puts back what the test replaced. */
export function cleanup() {
  for (const remove of mounted) remove()
  mounted.clear()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, "startViewTransition")
}

// Taken now, so a test that fakes timers doesn't stop the helpers too.
const later = setTimeout

/** Lets promises and Svelte's own queue run dry. */
export async function flushPromises() {
  for (let round = 0; round < 6; round++) {
    await new Promise((resolve) => later(resolve, 0))
    await tick()
    flushSync()
  }
}

/** Draws a surface and returns at once, before anything asynchronous has settled. */
export function drawNow(initial: Props) {
  const props = $state({ ...initial })
  const target = document.body.appendChild(document.createElement("div"))
  let drawn: IntelligentUIHandle | undefined
  const remove = () => {
    if (drawn) void unmount(drawn as never)
    target.remove()
  }
  // Before anything is drawn: a surface that throws while it draws is taken off the page too.
  mounted.add(remove)
  const ui = (drawn = mount(IntelligentUI, { target, props }) as unknown as IntelligentUIHandle)
  flushSync()
  const view = {
    /** What `bind:this` gives a parent. */
    vm: ui,
    element: target.firstElementChild as HTMLElement,
    /** Changes props, as a parent would. */
    async setProps(next: Partial<Props>) {
      Object.assign(props, next)
      await flushPromises()
    },
    unmount() {
      mounted.delete(remove)
      remove()
    },
  }
  return { view, container: view.element }
}

export async function draw(initial: Props) {
  const drawn = drawNow(initial)
  await flushPromises()
  return drawn
}

/** The words on the surface, without its stylesheets and toasts. */
export function text(container: HTMLElement): string {
  const root = container.cloneNode(true) as HTMLElement
  for (const hidden of root.querySelectorAll("style, .iui-toasts")) hidden.remove()
  return (root.textContent ?? "").replace(/\s+/g, " ").trim()
}

/** The innermost element whose text matches. */
export function byText(container: HTMLElement, match: string | RegExp): HTMLElement {
  const fits = (element: Element) => {
    const content = (element.textContent ?? "").trim()
    return typeof match === "string" ? content === match : match.test(content)
  }
  const found = [...container.querySelectorAll<HTMLElement>("*")].filter(
    (element) => fits(element) && ![...element.children].some(fits)
  )
  if (found.length !== 1) throw new Error(`${found.length} elements with text ${match}`)
  return found[0] as HTMLElement
}

export function byLabel<T extends HTMLElement = HTMLElement>(container: HTMLElement, label: string): T {
  const found = container.querySelector<T>(`[aria-label="${label}"]`)
  if (!found) throw new Error(`Nothing labelled ${label}`)
  return found
}

export function byRole(container: HTMLElement, role: string, name?: string): HTMLElement[] {
  const implicit = role === "button" ? ", button" : ""
  return [...container.querySelectorAll<HTMLElement>(`[role="${role}"]${implicit}`)].filter(
    (element) => name === undefined || (element.textContent ?? "").trim() === name
  )
}

export async function click(element: Element) {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
  await flushPromises()
}

export async function type(element: HTMLInputElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event("input", { bubbles: true }))
  await flushPromises()
}

export async function until(check: () => void, timeout = 2000) {
  const started = Date.now()
  for (;;) {
    try {
      check()
      return
    } catch (error) {
      if (Date.now() - started > timeout) throw error
      await new Promise((resolve) => later(resolve, 10))
      await flushPromises()
    }
  }
}

/** Where the nesting of `css` returns to the top level, counting braces the way a browser does. */
export function topLevelCloses(css: string): number[] {
  const closes: number[] = []
  let depth = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === "\\") i++
    else if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch && css[i] !== "\n"; i++) if (css[i] === "\\") i++
    } else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) closes.push(i)
  }
  return closes
}
