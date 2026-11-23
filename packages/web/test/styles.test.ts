/// <reference types="node" />
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeAll, describe, expect, test } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import { AMBIENT, CORPUS, corpusTools } from "../../vue/test/corpus"
import { mount, preloadUiSdk } from "../src"
import { flushPromises } from "./helpers"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")
// Vitest runs with `css: false`, which empties every stylesheet it imports, `?raw` included.
const entry = read("../src/styles.css")
const elements = read("../styles/elements.css")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

/**
 * Tags the shared stylesheet or the browser styles by name. A custom element
 * that stands in for one gets none of that, so elements.css has to name it.
 * `nav` and `output` are left out: nothing styles them beyond what the role
 * and `display` the element already has say.
 */
const STYLED_BY_TAG = new Set(["label", "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "tr", "th", "td", "button"])

/**
 * Doc examples written with JSX that markup has no form for, and the token
 * input's, which reads a string where it needs a list and fails in both
 * renderers. The recipes cover all four.
 */
const NOT_MARKUP = new Set(["calendar", "preferences", "toast", "token-input"])

const SAMPLES = [
  ...UI_SDK_CATALOG.filter((entry) => !NOT_MARKUP.has(entry.slug)).map((entry) => ({ source: entry.example, initialState: AMBIENT })),
  ...CORPUS,
]

type Tags = Map<string, Set<string>>

function note(into: Tags) {
  for (const element of document.querySelectorAll("[data-slot]")) {
    const slot = element.getAttribute("data-slot") as string
    into.set(slot, (into.get(slot) ?? new Set()).add(element.localName))
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

beforeAll(async () => {
  await Promise.all([preloadReact(), preloadUiSdk()])
})

describe("the web stylesheet", () => {
  test("is the shared stylesheet followed by the rules for the custom elements", () => {
    const imports = [...entry.matchAll(/@import "([^"]+)";/g)].map((match) => match[1])
    expect(imports).toEqual(["../../core/styles/index.css", "../styles/elements.css"])
    expect(elements).not.toMatch(/@import\b/)
    const layers = [...elements.matchAll(/^@layer ([\w-]+) \{/gm)].map((match) => match[1])
    expect(layers).toEqual(["ui-sdk", "iui"])
  })

  test("names only custom elements that exist", () => {
    const named = [...new Set(elements.match(/\bui-[a-z]+(?:-[a-z]+)*/g))].filter((name) => name !== "ui-sdk" && name !== "ui-spacing")
    expect(named.length).toBeGreaterThan(20)
    expect(named.filter((tag) => !customElements.get(tag))).toEqual([])
  })

  test("names every custom element that stands in for a tag styled by name", async () => {
    const react: Tags = new Map()
    const web: Tags = new Map()
    for (const sample of SAMPLES) {
      const options = { source: sample.source, tools: corpusTools(), initialState: sample.initialState ?? {} }
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      const host = document.body.appendChild(document.createElement("div"))
      const root = createRoot(host)
      await act(async () => {
        root.render(createElement(ReactUI, options))
      })
      await act(() => pause(20))
      note(react)
      await act(async () => root.unmount())
      host.remove()
      globalThis.IS_REACT_ACT_ENVIRONMENT = false
      const other = document.body.appendChild(document.createElement("div"))
      const view = mount(other, options)
      await flushPromises()
      note(web)
      view.unmount()
      other.remove()
    }
    const missing: string[] = []
    let standIns = 0
    for (const [slot, tags] of react) {
      const styled = [...tags].filter((tag) => STYLED_BY_TAG.has(tag))
      if (styled.length === 0) continue
      for (const tag of web.get(slot) ?? []) {
        if (!tag.startsWith("ui-")) continue
        standIns++
        const named = new RegExp(`\\b${tag}\\b`).test(elements) || elements.includes(`[data-slot="${slot}"]`)
        if (!named) missing.push(`<${tag}> stands in for <${styled.join("|")}>`)
      }
    }
    expect(missing).toEqual([])
    expect(standIns).toBeGreaterThanOrEqual(15)
  }, 120_000)
})
