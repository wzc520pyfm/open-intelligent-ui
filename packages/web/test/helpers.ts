import { flush, type IntelligentUIOptions, type MountedUI, mount } from "../src"

export type Props = IntelligentUIOptions

/** The real timer, so waiting still works in a test that fakes time. */
const later = setTimeout

const mounted = new Set<{ view: MountedUI; host: HTMLElement }>()

/** Lets promises that are already resolved, and what they start, run. */
export async function flushPromises() {
  for (let turn = 0; turn < 4; turn++) {
    await new Promise((resolve) => later(resolve, 0))
    flush()
  }
}

/** Draws a surface and returns at once, before anything it started has answered. */
export function drawNow(props: Props) {
  const host = document.body.appendChild(document.createElement("div"))
  const view = mount(host, props)
  mounted.add({ view, host })
  return { view, host, container: host.firstElementChild as HTMLElement }
}

export async function draw(props: Props) {
  const drawn = drawNow(props)
  await flushPromises()
  return drawn
}

/** Takes every surface a test drew off the page. */
export function unmountAll() {
  for (const { view, host } of mounted) {
    view.unmount()
    host.remove()
  }
  mounted.clear()
}

/** The words on the surface, without its stylesheets and toasts. */
export function text(container: HTMLElement): string {
  const root = container.cloneNode(true) as HTMLElement
  for (const hidden of root.querySelectorAll("style, .iui-toasts, template")) hidden.remove()
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

export async function type(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // UI SDK tells a script's write to `value` from typing, so the text goes in the way typing puts it.
  const prototype =
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const write = Object.getOwnPropertyDescriptor(prototype, "value")?.set
  if (write) write.call(element, value)
  else element.value = value
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
