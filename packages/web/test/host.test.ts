import { describe, expect, test, vi } from "vitest"
import type { HostFunction } from "../src"
import { byLabel, byText, click, draw, flushPromises, text } from "./helpers"

class Rating extends HTMLElement {
  levels: unknown[] = []
  pick(value: number) {
    this.dispatchEvent(new CustomEvent("pick", { detail: { value } }))
    this.dispatchEvent(new CustomEvent("rate-change", { detail: value }))
  }
}
if (!customElements.get("host-rating")) customElements.define("host-rating", Rating)

describe("components of the host application", () => {
  test("a tag name draws that custom element with attributes, children and listeners", async () => {
    const { container } = await draw({
      source: `<state score={2} />
<Rating aria-label="Score" max={5} disabled={false} checked label="Stars" class="mine" style="color: red" on:pick={score = $value}><b>inside {score}</b></Rating>
<text>score {score}</text>`,
      components: { Rating: "host-rating" },
    })
    const rating = byLabel<Rating>(container, "Score")
    expect(rating).toBeInstanceOf(Rating)
    expect(rating.getAttribute("max")).toBe("5")
    expect(rating.hasAttribute("disabled")).toBe(false)
    expect(rating.getAttribute("checked")).toBe("")
    expect(rating.getAttribute("label")).toBe("Stars")
    expect(rating.className).toBe("mine")
    expect(rating.style.color).toBe("red")
    expect(rating.querySelector("b")?.textContent).toBe("inside 2")
    rating.pick(4)
    await flushPromises()
    expect(text(container)).toContain("score 4")
    expect(byLabel(container, "Score")).toBe(rating)
    expect(rating.querySelector("b")?.textContent).toBe("inside 4")
  })

  test("a tag with its properties and events listed gets them as written", async () => {
    const { container } = await draw({
      source: `<state score={1} levels={["low", "high"]} />
<Rating aria-label="Score" levels={levels} bind:value={score} on:rateChange={score = $value * 10} />
<button on:click={levels = [...levels, "top"]}>more</button>
<text>score {score}</text>`,
      components: {
        Rating: { tag: "host-rating", properties: ["levels"], events: { onRateChange: "rate-change" } },
      },
    })
    const rating = byLabel<Rating>(container, "Score")
    expect(rating.levels).toEqual(["low", "high"])
    expect(rating.hasAttribute("levels")).toBe(false)
    expect(rating.getAttribute("value")).toBe("1")
    await click(byText(container, "more"))
    expect(rating.levels).toEqual(["low", "high", "top"])
    rating.pick(3)
    await flushPromises()
    expect(text(container)).toContain("score 30")
  })

  test("shapes inside a host's part are still shapes", async () => {
    const Group: HostFunction = (_props, children) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g")
      group.setAttribute("data-group", "")
      group.append(...children)
      return group
    }
    const { container } = await draw({
      source: `<state r={2} />
<svg viewBox="0 0 10 10"><Group><circle cx="5" cy="5" r={r} /></Group></svg>
<Group><text>plain</text></Group>
<button on:click={r = 3}>grow</button>`,
      components: { Group },
    })
    const circle = container.querySelector("[data-group] circle")
    expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg")
    expect(byText(container, "plain").namespaceURI).toBe("http://www.w3.org/1999/xhtml")
    await click(byText(container, "grow"))
    expect(container.querySelector("[data-group] circle")).toBe(circle)
    expect(circle?.getAttribute("r")).toBe("3")
  })

  test("a function builds the DOM, is called again when its props change, and keeps its children live", async () => {
    const calls = vi.fn()
    const Panel: HostFunction = (props, children) => {
      calls(props.title)
      const out = document.createElement("section")
      const heading = out.appendChild(document.createElement("h4"))
      heading.textContent = String(props.title)
      const body = out.appendChild(document.createElement("div"))
      body.className = "body"
      body.append(...children)
      const button = out.appendChild(document.createElement("button"))
      button.textContent = "close"
      button.addEventListener("click", () => (props.onClose as (reason: string) => void)("button"))
      return out
    }
    const { container } = await draw({
      source: `<state n={0} title="First" why="" />
<Panel title={title} on:close={why = $value}><input aria-label="Inside" /><text>n={n}</text></Panel>
<button on:click={n += 1}>add</button>
<button on:click={title = "Second"}>rename</button>
<text>why={why}</text>`,
      components: { Panel },
    })
    const inside = byLabel<HTMLInputElement>(container, "Inside")
    inside.value = "typed"
    expect(calls).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".body")?.textContent).toBe("n=0")

    await click(byText(container, "add"))
    expect(calls).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".body")?.textContent).toBe("n=1")
    expect(byLabel(container, "Inside")).toBe(inside)

    await click(byText(container, "rename"))
    expect(calls).toHaveBeenCalledTimes(2)
    expect(container.querySelector("h4")?.textContent).toBe("Second")
    expect(byLabel(container, "Inside")).toBe(inside)
    expect(inside.value).toBe("typed")
    expect(container.querySelector(".body")?.textContent).toBe("n=1")

    await click(byText(container, "close"))
    expect(text(container)).toContain("why=button")
  })

  test("a function that keeps only some of the nodes it was handed is asked again when more arrive", async () => {
    const calls = vi.fn()
    const Strip: HostFunction = (_props, children) => {
      calls(children.length)
      const out = document.createElement("ul")
      out.className = "strip"
      // Elements only: the text node that marks where later children go is left out.
      for (const child of children) {
        if (child instanceof Element) out.appendChild(document.createElement("li")).appendChild(child)
      }
      return out
    }
    const { container } = await draw({
      source: `<state items={["a"]} n={0} />
<Strip>{#each items as item (item)}<b>{item}{n}</b>{/each}</Strip>
<button on:click={items = [...items, "b"]}>more</button>
<button on:click={n += 1}>count</button>`,
      components: { Strip },
    })
    const first = container.querySelector(".strip b")
    expect(container.querySelector(".strip")?.textContent).toBe("a0")
    await click(byText(container, "count"))
    expect(calls).toHaveBeenCalledTimes(1)
    expect(container.querySelector(".strip")?.textContent).toBe("a1")
    await click(byText(container, "more"))
    expect(calls).toHaveBeenCalledTimes(2)
    expect(container.querySelector(".strip")?.textContent).toBe("a1b1")
    expect(container.querySelectorAll(".strip li")).toHaveLength(2)
    expect(container.querySelector(".strip b")).toBe(first)
    await click(byText(container, "count"))
    expect(calls).toHaveBeenCalledTimes(2)
    expect(container.querySelector(".strip")?.textContent).toBe("a2b2")
  })

  test("a function may return several nodes, which are replaced and removed together", async () => {
    const Pair: HostFunction = (props, children) => {
      const out = document.createDocumentFragment()
      const term = out.appendChild(document.createElement("dt"))
      term.textContent = String(props.term)
      out.appendChild(document.createElement("dd")).append(...children)
      return out
    }
    const { container } = await draw({
      source: `<state term="One" shown={true} n={0} />
<dl>{#if shown}<Pair term={term}><i>{n}</i></Pair>{/if}</dl>
<button on:click={term = "Two"}>rename</button>
<button on:click={n += 1}>count</button>
<button on:click={shown = false}>hide</button>`,
      components: { Pair },
    })
    const list = container.querySelector("dl") as HTMLElement
    expect(list.innerHTML).toBe("<dt>One</dt><dd><i>0</i></dd>")
    await click(byText(container, "rename"))
    await click(byText(container, "count"))
    expect(list.innerHTML).toBe("<dt>Two</dt><dd><i>1</i></dd>")
    await click(byText(container, "hide"))
    expect(list.innerHTML).toBe("")
  })

  test("a function that returns nothing or throws leaves the rest standing", async () => {
    const { container } = await draw({
      source: `<Nothing />\n\nbefore\n\n<Broken />\n\nafter`,
      components: {
        Nothing: () => null,
        Broken: () => {
          throw new Error("no luck")
        },
      },
    })
    expect(text(container)).toContain("before")
    expect(text(container)).toContain("after")
    expect(container.querySelector(".iui-error")?.textContent).toContain("no luck")
  })

  test("a custom element that fails in its own callbacks becomes an error block, and the rest stays", async () => {
    class Fragile extends HTMLElement {
      connectedCallback() {
        if (this.getAttribute("limit") === "none") throw new Error("no limit to work with")
      }
    }
    if (!customElements.get("host-fragile")) customElements.define("host-fragile", Fragile)
    const reported = vi.fn()
    window.addEventListener("error", reported)
    const onWarning = vi.fn()
    const { container } = await draw({
      source: `before\n\n<card><Fragile limit="none">inside</Fragile></card>\n\n<Fragile limit="3">fine</Fragile>\n\nafter`,
      components: { Fragile: "host-fragile" },
      onWarning,
    })
    window.removeEventListener("error", reported)
    expect(text(container)).toContain("before")
    expect(text(container)).toContain("fine")
    expect(text(container)).toContain("after")
    expect(container.querySelectorAll(".iui-error")).toHaveLength(1)
    expect(container.querySelector(".iui-error")?.textContent).toContain("no limit to work with")
    expect(container.querySelectorAll("host-fragile")).toHaveLength(1)
    expect(onWarning).toHaveBeenCalledWith("no limit to work with")
    expect(reported.mock.calls.every(([event]) => (event as Event).defaultPrevented)).toBe(true)
  })

  test("a custom element that fails as a stream brings it in stays quiet until the stream ends", async () => {
    class Brittle extends HTMLElement {
      connectedCallback() {
        throw new Error("nothing to hold on to")
      }
    }
    if (!customElements.get("host-brittle")) customElements.define("host-brittle", Brittle)
    const reported = vi.fn()
    window.addEventListener("error", reported)
    const full = `<p id="first">before</p>\n\n<card><Brittle>inside</Brittle></card>\n\n<p>after</p>`
    const components = { Brittle: "host-brittle" }
    const { container, view } = await draw({ source: full.slice(0, 26), streaming: true, components })
    const first = container.querySelector("#first")
    view.update({ source: full.slice(0, full.indexOf("</card>") + 7), streaming: true })
    await flushPromises()
    expect(container.querySelector("#first")).toBe(first)
    expect(container.querySelector(".iui-error, host-brittle")).toBeNull()
    expect(text(container)).toBe("before")
    view.update({ source: full, streaming: false })
    await flushPromises()
    window.removeEventListener("error", reported)
    expect(container.querySelector("#first")).toBe(first)
    expect(container.querySelector(".iui-error")?.textContent).toContain("nothing to hold on to")
    expect(text(container)).toContain("after")
    expect(reported).toHaveBeenCalled()
    expect(reported.mock.calls.every(([event]) => (event as Event).defaultPrevented)).toBe(true)
  })

  test("a host component wins over a UI SDK component and a preset of the same name", async () => {
    const { container } = await draw({
      source: `<Button>one</Button><Stat label="two" value={1} />`,
      components: {
        Button: (_props, children) => {
          const out = document.createElement("mark")
          out.append(...children)
          return out
        },
        Stat: "host-rating",
      },
    })
    expect(container.querySelector("mark")?.textContent).toBe("one")
    expect(container.querySelector("host-rating")?.getAttribute("label")).toBe("two")
    expect(container.querySelector("ui-button, .iui-stat")).toBeNull()
  })
})
