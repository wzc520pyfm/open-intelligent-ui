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
