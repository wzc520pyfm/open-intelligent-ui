import { claimId } from "@open-intelligent-ui/core/renderer"
import { afterEach, describe, expect, test, vi } from "vitest"
import { defineIntelligentUI, type IntelligentUIElement, mount } from "../src"
import { byLabel, byText, click, flushPromises, text } from "./helpers"

defineIntelligentUI()

const made: Element[] = []

function element(attributes: Record<string, string> = {}): IntelligentUIElement {
  const out = document.createElement("intelligent-ui") as IntelligentUIElement
  for (const [name, value] of Object.entries(attributes)) out.setAttribute(name, value)
  made.push(out)
  return out
}

afterEach(async () => {
  for (const each of made.splice(0)) each.remove()
  await flushPromises()
})

describe("<intelligent-ui>", () => {
  test("defining it twice, or under another name, is fine", () => {
    defineIntelligentUI()
    defineIntelligentUI("another-ui")
    expect(customElements.get("intelligent-ui")).toBeDefined()
    expect(customElements.get("another-ui")).toBeDefined()
    expect(customElements.get("another-ui")).not.toBe(customElements.get("intelligent-ui"))
  })

  test("draws its source attribute into its own light DOM", async () => {
    const ui = element({ source: "**Hello** <badge>new</badge>", scheme: "dark" })
    document.body.append(ui)
    await flushPromises()
    expect(ui.shadowRoot).toBeNull()
    const root = ui.firstElementChild as HTMLElement
    expect(root.className).toBe("iui-root")
    expect(root.getAttribute("data-iui-scheme")).toBe("dark")
    expect(text(root)).toBe("Hello new")
  })

  test("follows its attributes and its properties", async () => {
    const ui = element({ source: "one" })
    document.body.append(ui)
    await flushPromises()
    ui.setAttribute("source", "two")
    ui.setAttribute("streaming", "")
    await flushPromises()
    const root = ui.firstElementChild as HTMLElement
    expect(text(root)).toBe("two")
    expect(root.hasAttribute("data-streaming")).toBe(true)
    expect(ui.streaming).toBe(true)

    ui.source = "three"
    ui.streaming = false
    ui.scheme = "light"
    ui.flush()
    expect(ui.firstElementChild).toBe(root)
    expect(text(root)).toBe("three")
    expect(root.hasAttribute("data-streaming")).toBe(false)
    expect(root.getAttribute("data-iui-scheme")).toBe("light")
  })

  test("takes tools, components, initialState and allowUrl as properties, set before or after it is on the page", async () => {
    const ui = element()
    ui.source = `<query id="q" tool="list" />
<Hello name={who} />
{#each q.data ?? [] as row}<text>{row}</text>{/each}
<a href="https://example.com/a">kept</a><a href="https://other.test/b">dropped</a>`
    ui.initialState = { who: "Ada" }
    ui.tools = { list: async () => ["x", "y"] }
    ui.components = {
      Hello: (props) => {
        const out = document.createElement("em")
        out.textContent = `hello ${String(props.name)}`
        return out
      },
    }
    ui.allowUrl = (url) => url.startsWith("https://example.com/")
    document.body.append(ui)
    await flushPromises()
    const root = ui.firstElementChild as HTMLElement
    expect(text(root)).toContain("hello Ada")
    expect(text(root)).toContain("xy")
    expect(byText(root, "kept").getAttribute("href")).toBe("https://example.com/a")
    expect(byText(root, "dropped").hasAttribute("href")).toBe(false)

    ui.tools = { list: async () => ["z"] }
    ui.refetch("q")
    await flushPromises()
    expect(text(root)).toContain("z")
  })

  test("a property that is cleared is gone from the surface", async () => {
    const ui = element()
    const calls = vi.fn(async () => ["x"])
    ui.source = `<query id="q" tool="list" /><Hello />{#each q.data ?? [] as row}<text>{row}</text>{/each}
<a href="https://other.test/b">link</a>`
    ui.tools = { list: calls }
    ui.components = { Hello: () => document.createElement("em") }
    ui.allowUrl = () => false
    document.body.append(ui)
    await flushPromises()
    const root = ui.firstElementChild as HTMLElement
    expect(calls).toHaveBeenCalledTimes(1)
    expect(root.querySelector("em")).not.toBeNull()
    expect(byText(root, "link").hasAttribute("href")).toBe(false)

    ui.tools = undefined
    ui.components = undefined
    ui.allowUrl = undefined
    await flushPromises()
    ui.refetch("q")
    await flushPromises()
    expect(calls).toHaveBeenCalledTimes(1)
    expect(root.querySelector("em")).toBeNull()
    expect(byText(root, "link").getAttribute("href")).toBe("https://other.test/b")
  })

  test("a property set before the element was defined is picked up", async () => {
    const early = document.createElement("late-ui") as IntelligentUIElement
    made.push(early)
    ;(early as unknown as { source: string }).source = "set early"
    ;(early as unknown as { tools: unknown }).tools = {}
    document.body.append(early)
    defineIntelligentUI("late-ui")
    await flushPromises()
    expect(text(early.firstElementChild as HTMLElement)).toBe("set early")
    expect(Object.hasOwn(early, "source")).toBe(false)
  })

  test("reports actions, tool calls, warnings, diagnostics and state as events and as callbacks", async () => {
    const ui = element()
    const events: string[] = []
    for (const name of ["action", "tool", "warning", "diagnostics", "statechange"]) {
      ui.addEventListener(name, (event) => {
        events.push(`${name}:${event.bubbles ? "bubbles" : "stays"}`)
      })
    }
    const onAction = vi.fn()
    const onWarning = vi.fn()
    const onTool = vi.fn()
    const onStateChange = vi.fn()
    const onDiagnostics = vi.fn()
    Object.assign(ui, { onAction, onWarning, onTool, onStateChange, onDiagnostics })
    ui.tools = { save: async () => "ok" }
    ui.source = `<state n={0} />
<button on:click={n += 1; send("hello"); call("save", { n })}>go</button>
<Nope />`
    document.body.append(ui)
    await flushPromises()
    await click(byText(ui, "go"))
    await flushPromises()
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: "send", text: "hello" }))
    expect(onWarning).toHaveBeenCalledWith("<Nope> is not a known component")
    expect(onTool).toHaveBeenCalled()
    expect(onStateChange).toHaveBeenLastCalledWith({ n: 1 })
    expect(onDiagnostics).toHaveBeenCalled()
    expect(new Set(events)).toEqual(
      new Set(["action:stays", "tool:stays", "warning:stays", "diagnostics:stays", "statechange:stays"])
    )
  })

  test("cancelling the action event replaces the built-in handling", async () => {
    const ui = element({ source: `<button on:click={toast("Saved")}>go</button>` })
    document.body.append(ui)
    await flushPromises()
    await click(byText(ui, "go"))
    expect(ui.querySelector(".iui-toasts")?.textContent).toContain("Saved")

    const quiet = element({ source: `<button on:click={toast("Saved")}>go</button>` })
    const seen: unknown[] = []
    quiet.addEventListener("action", (event) => {
      seen.push((event as CustomEvent).detail)
      event.preventDefault()
    })
    document.body.append(quiet)
    await flushPromises()
    await click(byText(quiet, "go"))
    expect(seen).toEqual([expect.objectContaining({ type: "toast", message: "Saved" })])
    expect(quiet.querySelector(".iui-toasts")?.textContent).toBe("")
  })

  test("has the handle's methods", async () => {
    const ui = element({ source: `<state n={1} name="" />\n<input aria-label="Name" bind:value={name} /><text>{n}</text>` })
    document.body.append(ui)
    await flushPromises()
    expect(ui.getState()).toEqual({ n: 1, name: "" })
    ui.setState({ n: 5, name: "Ada" })
    ui.flush()
    expect(byLabel<HTMLInputElement>(ui, "Name").value).toBe("Ada")
    expect(ui.getState()).toEqual({ n: 5, name: "Ada" })
    ui.reset("n")
    expect(ui.getState()).toEqual({ n: 1, name: "Ada" })
    ui.reset()
    expect(ui.getState()).toEqual({ n: 1, name: "" })
    expect(ui.surface.snapshot()).toEqual({ n: 1, name: "" })
  })

  test("keeps its surface when it is moved, and lets go of it when it is removed", async () => {
    const ui = element({ source: `<state n={0} />\n<button on:click={n += 1}>add</button><text>n={n}</text>` })
    const first = document.body.appendChild(document.createElement("div"))
    const second = document.body.appendChild(document.createElement("div"))
    made.push(first, second)
    first.append(ui)
    await flushPromises()
    await click(byText(ui, "add"))
    const root = ui.firstElementChild
    second.append(ui)
    await flushPromises()
    expect(ui.firstElementChild).toBe(root)
    expect(text(ui)).toContain("n=1")

    ui.remove()
    await flushPromises()
    expect(ui.firstElementChild).toBeNull()
    expect(ui.getState()).toEqual({})
    expect(() => ui.surface).toThrow()

    document.body.append(ui)
    await flushPromises()
    expect(text(ui)).toContain("n=0")
  })
})

describe("mount()", () => {
  test("draws into the target, updates in place and cleans up", async () => {
    const host = document.body.appendChild(document.createElement("div"))
    made.push(host)
    host.append("kept by the host")
    const ui = mount(host, { source: `<state n={2} />\n<text>n={n}</text>` })
    const root = host.querySelector(".iui-root") as HTMLElement
    expect(text(root)).toBe("n=2")
    ui.update({ source: `<state n={2} />\n<text>n is {n}</text>`, scheme: "dark" })
    expect(host.querySelector(".iui-root")).toBe(root)
    expect(text(root)).toBe("n is 2")
    expect(root.getAttribute("data-iui-scheme")).toBe("dark")
    ui.setState({ n: 3 })
    ui.flush()
    expect(text(root)).toBe("n is 3")
    expect(ui.getState()).toEqual({ n: 3 })
    ui.unmount()
    expect(host.querySelector(".iui-root")).toBeNull()
    expect(host.textContent).toBe("kept by the host")
  })

  test("two copies of the package on one page give their surfaces and charts different ids", async () => {
    const chart = `<Chart type="area" data={[{ m: "a", v: 1 }, { m: "b", v: 2 }]} x="m" y="v" />`
    const surfaces: { unmount(): void }[] = []
    const draw = async (copy: typeof import("../src")) => {
      const host = document.body.appendChild(document.createElement("div"))
      made.push(host)
      surfaces.push(copy.mount(host, { source: chart }))
      await flushPromises()
      return [
        host.querySelector(".iui-root")?.getAttribute("data-iui-id"),
        ...[...host.querySelectorAll("[id]")].map((element) => element.id),
      ]
    }
    // Each import after a reset is a copy that has drawn nothing yet.
    const copy = async () => {
      vi.resetModules()
      return import("../src")
    }
    const [one, two] = [await copy(), await copy()]
    expect(one.mount).not.toBe(two.mount)
    const first = await draw(one)
    const second = await draw(two)
    expect(first.length).toBeGreaterThan(1)
    expect(second).toHaveLength(first.length)
    expect(new Set([...first, ...second]).size).toBe(first.length * 2)
    for (const surface of surfaces) surface.unmount()
  })

  test("an id a surface from another renderer holds is not taken, and an id is given back", async () => {
    const chart = `<Chart type="area" data={[{ m: "a", v: 1 }, { m: "b", v: 2 }]} x="m" y="v" />`
    const draw = async () => {
      const host = document.body.appendChild(document.createElement("div"))
      made.push(host)
      const ui = mount(host, { source: chart })
      await flushPromises()
      const root = host.querySelector(".iui-root") as HTMLElement
      return { ui, root, id: root.getAttribute("data-iui-id") as string }
    }
    const probe = await draw()
    const [, count] = /^w([0-9a-z]+)$/.exec(probe.id) as RegExpExecArray
    const gradient = probe.root.querySelector("linearGradient")?.id as string
    probe.ui.unmount()
    // Both names are free again once the surface has left.
    for (const name of [probe.id, gradient.replace(/-\d+$/, "")]) {
      const claim = claimId(name)
      expect(claim.id).toBe(name)
      claim.release()
    }

    // The next surface would be given the next number; something else on the page has it.
    const next = `w${(Number.parseInt(count as string, 36) + 1).toString(36)}`
    const other = claimId(next)
    expect(other.id).toBe(next)
    const { ui, root, id } = await draw()
    expect(id).not.toBe(next)
    expect(id.startsWith(next)).toBe(true)
    const css = [...root.querySelectorAll("style")].map((style) => style.textContent).join("\n")
    expect(css).toContain(`[data-iui-id="${id}"]`)
    ui.unmount()
    other.release()
  })

  test("class names the host gives are on the root next to its own", async () => {
    const host = document.body.appendChild(document.createElement("div"))
    made.push(host)
    const ui = mount(host, { source: "Hello", class: "reply framed" })
    await flushPromises()
    const root = host.querySelector(".iui-root") as HTMLElement
    expect(root.className).toBe("iui-root reply framed")
    ui.update({ class: "reply" })
    ui.flush()
    expect(host.querySelector(".iui-root")).toBe(root)
    expect(root.className).toBe("iui-root reply")
    ui.unmount()
  })

  test("an option left out of update() keeps its value", async () => {
    const onWarning = vi.fn()
    const host = document.body.appendChild(document.createElement("div"))
    made.push(host)
    const ui = mount(host, { source: "<A />", onWarning, scheme: "dark" })
    ui.update({ source: "<B />" })
    await flushPromises()
    expect(onWarning).toHaveBeenCalledWith("<B> is not a known component")
    expect(host.querySelector(".iui-root")?.getAttribute("data-iui-scheme")).toBe("dark")
    ui.unmount()
  })
})
