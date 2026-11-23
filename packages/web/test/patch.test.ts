import { afterEach, describe, expect, test, vi } from "vitest"
import { type Child, type ElementVNode, h, type RawVNode } from "../src/dom/node"
import { adopt, createRoot, flush, type Root } from "../src/dom/patch"

const roots: Root[] = []
const hosts: HTMLElement[] = []

function rootIn(): { root: Root; host: HTMLElement } {
  const host = document.body.appendChild(document.createElement("div"))
  const root = createRoot(host)
  roots.push(root)
  hosts.push(host)
  return { root, host }
}

afterEach(() => {
  for (const root of roots.splice(0)) root.unmount()
  for (const host of hosts.splice(0)) host.remove()
})

/** An element as it is drawn while its markup is still arriving. */
function open(node: ElementVNode): ElementVNode {
  node.open = true
  return node
}

function raw(create: () => Node | null, signature: unknown): RawVNode {
  return { kind: "raw", key: undefined, create, signature }
}

describe("the patcher", () => {
  test("a handler that goes and comes back is called once", () => {
    const { root, host } = rootIn()
    const clicked = vi.fn()
    const button = (on: boolean) => h("button", { key: "b", on: { click: on ? clicked : undefined } }, "go")
    root.render(button(true))
    root.render(button(false))
    host.querySelector("button")?.click()
    expect(clicked).not.toHaveBeenCalled()
    root.render(button(true))
    host.querySelector("button")?.click()
    expect(clicked).toHaveBeenCalledTimes(1)
  })

  test("a key that spells another key's second turn is a key of its own", () => {
    const { root, host } = rootIn()
    const list = () => [
      h("i", { key: "x" }, "first"),
      h("i", { key: "x" }, "second"),
      h("i", { key: "x~1" }, "third"),
    ]
    root.render(list())
    const before = [...host.children]
    root.render(list())
    expect([...host.children]).toEqual(before)
    expect(host.textContent).toBe("firstsecondthird")
    root.render([])
    expect(host.childNodes).toHaveLength(0)
  })

  test("a fragment a raw node built is replaced and removed whole", () => {
    const { root, host } = rootIn()
    const pair = (label: string) => () => {
      const fragment = document.createDocumentFragment()
      fragment.append(document.createElement("b"), `${label} `, document.createElement("i"))
      return fragment
    }
    root.render([h("p", {}, "before"), raw(pair("one"), 1), h("p", {}, "after")])
    expect(host.innerHTML).toBe("<p>before</p><b></b>one <i></i><p>after</p>")
    root.render([h("p", {}, "before"), raw(pair("two"), 2), h("p", {}, "after")])
    expect(host.innerHTML).toBe("<p>before</p><b></b>two <i></i><p>after</p>")
    root.render([h("p", {}, "before"), h("p", {}, "after")])
    expect(host.innerHTML).toBe("<p>before</p><p>after</p>")
  })

  test("a raw node that hands back the node it built before leaves it where it is", () => {
    const { root, host } = rootIn()
    const box = document.createElement("input")
    root.render(raw(() => box, 1))
    box.focus()
    root.render(raw(() => box, 2))
    expect(host.firstChild).toBe(box)
    expect(document.activeElement).toBe(box)
  })

  test("the field that had the focus keeps it when the element around it is drawn anew, wherever it is now", () => {
    const { root, host } = rootIn()
    const form = (first: boolean, whole: boolean) => {
      const fields: Child[] = [h("input", { key: "b", attrs: { name: "b" } })]
      if (first) fields.unshift(h("input", { key: "a", attrs: { name: "a" } }))
      const node = h("form", {}, fields)
      return whole ? node : open(node)
    }
    root.render(form(false, false))
    const typedIn = host.querySelector<HTMLInputElement>('[name="b"]') as HTMLInputElement
    typedIn.focus()
    typedIn.value = "typed"
    root.render(form(true, true))
    const a = host.querySelector<HTMLInputElement>('[name="a"]') as HTMLInputElement
    const b = host.querySelector<HTMLInputElement>('[name="b"]') as HTMLInputElement
    expect(b).not.toBe(typedIn)
    expect(document.activeElement).toBe(b)
    expect(b.value).toBe("typed")
    expect(a.value).toBe("")
  })

  test("a field that is gone when the element is drawn anew hands its text to no other", () => {
    const { root, host } = rootIn()
    const form = (whole: boolean) => {
      const node = h("form", {}, [h("input", { key: whole ? "other" : "typed", attrs: { name: "x" } })])
      return whole ? node : open(node)
    }
    root.render(form(false))
    const typedIn = host.querySelector("input") as HTMLInputElement
    typedIn.focus()
    typedIn.value = "typed"
    root.render(form(true))
    expect((host.querySelector("input") as HTMLInputElement).value).toBe("")
  })

  test("a field the tree keeps in step shows its new value after it is drawn anew, and keeps the focus", () => {
    const { root, host } = rootIn()
    const form = (value: string, whole: boolean) => {
      const node = h("form", {}, [h("input", { live: { value } })])
      return whole ? node : open(node)
    }
    root.render(form("draft", false))
    const before = host.querySelector("input") as HTMLInputElement
    before.focus()
    root.render(form("approved", true))
    const now = host.querySelector("input") as HTMLInputElement
    expect(now).not.toBe(before)
    expect(now.value).toBe("approved")
    expect(document.activeElement).toBe(now)
  })

  test("a surface whose draw fails doesn't keep the others waiting, and isn't tried again", () => {
    const failing = rootIn()
    const working = rootIn()
    const complain = vi.spyOn(console, "error").mockImplementation(() => {})
    const draw = vi.fn((): Child => {
      throw new Error("no")
    })
    failing.root.schedule(draw)
    working.root.schedule(() => h("p", {}, "fine"))
    flush()
    expect(working.host.textContent).toBe("fine")
    expect(complain).toHaveBeenCalledTimes(1)
    expect(failing.root.pending).toBe(false)
    flush()
    expect(draw).toHaveBeenCalledTimes(1)
  })

  test("a draw asked for while another is drawn waits its turn", () => {
    const { root, host } = rootIn()
    root.schedule(() => {
      root.schedule(() => h("p", {}, "second"))
      return h("p", {}, "first")
    })
    flush()
    expect(host.textContent).toBe("first")
    expect(root.pending).toBe(true)
    flush()
    expect(host.textContent).toBe("second")
  })

  test("an element something else made is kept as the tree says, with what it came with", () => {
    const element = document.body.appendChild(document.createElement("div"))
    hosts.push(element)
    element.setAttribute("value", "2026-10-16")
    const clicked = vi.fn()
    const adopted = adopt(element)
    adopted.render(h("div", { attrs: { title: "one" }, on: { click: clicked } }, [h("b", {}, "a")]))
    expect(element.outerHTML).toBe('<div value="2026-10-16" title="one"><b>a</b></div>')
    const b = element.firstChild
    adopted.render(h("div", { attrs: { title: "two" }, on: { click: clicked } }, [h("b", {}, "b"), "c"]))
    expect(element.outerHTML).toBe('<div value="2026-10-16" title="two"><b>b</b>c</div>')
    expect(element.firstChild).toBe(b)
    element.click()
    expect(clicked).toHaveBeenCalledTimes(1)
    adopted.unmount()
    expect(element.outerHTML).toBe('<div value="2026-10-16" title="two"></div>')
  })
})
