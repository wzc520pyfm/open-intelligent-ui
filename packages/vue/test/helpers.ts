import { flushPromises, mount } from "@vue/test-utils"
import { IntelligentUI } from "../src"

export type Props = InstanceType<typeof IntelligentUI>["$props"]

export async function draw(props: Props) {
  const view = mount(IntelligentUI, { props, attachTo: document.body })
  await flushPromises()
  return { view, container: view.element as HTMLElement }
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
