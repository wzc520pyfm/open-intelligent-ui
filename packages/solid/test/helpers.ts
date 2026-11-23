import { createComponent, insert, render, spread } from "@solidjs/web"
import { flush } from "solid-js"
import { IntelligentUI, type IntelligentUIHandle, type IntelligentUIProps } from "../src"
import { createBag } from "../src/render/bag"

export type Props = IntelligentUIProps

// Kept from before any test swaps the clock for a fake one.
const later = globalThis.setTimeout

const pause = (ms = 0) => new Promise((resolve) => later(resolve, ms))

/** Lets everything that was queued run: microtasks, Solid's effects, loaders that resolved. */
export async function flushPromises() {
  await pause()
  flush()
  await pause()
}

export interface View {
  container: HTMLElement
  handle: IntelligentUIHandle
  /** Changes some props, as a parent component would. */
  setProps(next: Partial<Props>): Promise<void>
  unmount(): void
}

/** Mounts the surface in the page without waiting for anything. */
export function mount(props: Props): View {
  const host = document.body.appendChild(document.createElement("div"))
  let handle!: IntelligentUIHandle
  let current: Record<string, unknown> = {
    ...props,
    ref: (given: IntelligentUIHandle) => {
      handle = given
    },
  }
  const bag = createBag(current)
  const dispose = render(
    () => createComponent(IntelligentUI, bag.props as unknown as IntelligentUIProps),
    host
  )
  return {
    container: host.firstElementChild as HTMLElement,
    handle,
    async setProps(next) {
      current = { ...current, ...next }
      bag.update(current)
      await flushPromises()
    },
    unmount() {
      dispose()
      host.remove()
    },
  }
}

export async function draw(props: Props) {
  const view = mount(props)
  await flushPromises()
  return { view, container: view.container, handle: view.handle }
}

/**
 * An element the way compiled JSX makes one: props are spread onto it, and
 * each child that is a function is inserted at its own marker.
 */
export function h(tag: string, props: object | null, ...children: unknown[]): HTMLElement {
  const element = document.createElement(tag)
  if (props) spread(element, props, true)
  for (const child of children) {
    if (typeof child === "function") {
      insert(element, child as () => unknown, element.appendChild(document.createTextNode("")))
    } else {
      element.append(child as string | Node)
    }
  }
  return element
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
      await new Promise((resolve) => setTimeout(resolve, 10))
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
