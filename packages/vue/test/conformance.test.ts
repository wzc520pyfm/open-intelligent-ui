import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { flushPromises, mount } from "@vue/test-utils"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeAll, expect, test } from "vitest"
import { IntelligentUI as VueUI, preloadUiSdk as preloadVue } from "../src"
import { CORPUS, corpusTools, type Sample } from "./corpus"
import { describe as describeDom } from "./dom"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

// Numbers and charts are compared where they come to rest.
window.matchMedia = ((query: string) => ({
  matches: query.includes("reduce"),
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

const settle = () => new Promise((resolve) => setTimeout(resolve, 40))

interface Drawn {
  dom: string
  /** What the renderer complained about, in no particular order. */
  warnings: string[]
}

const distinct = (warnings: string[]) => [...new Set(warnings)].sort()

async function drawnByReact(sample: Sample): Promise<Drawn> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const warnings: string[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const root = createRoot(host)
  await act(async () => {
    root.render(
      createElement(ReactUI, {
        source: sample.source,
        tools: corpusTools(),
        onWarning: (message: string) => warnings.push(message),
        ...(sample.initialState ? { initialState: sample.initialState } : {}),
      })
    )
  })
  await act(settle)
  const dom = describeDom(host.firstElementChild as Element)
  await act(async () => root.unmount())
  host.remove()
  return { dom, warnings: distinct(warnings) }
}

async function drawnByVue(sample: Sample): Promise<Drawn> {
  const warnings: string[] = []
  const view = mount(VueUI, {
    attachTo: document.body,
    props: {
      source: sample.source,
      tools: corpusTools(),
      onWarning: (message: string) => warnings.push(message),
      ...(sample.initialState ? { initialState: sample.initialState } : {}),
    },
  })
  await flushPromises()
  await settle()
  await flushPromises()
  const dom = describeDom(view.element)
  view.unmount()
  return { dom, warnings: distinct(warnings) }
}

beforeAll(async () => {
  await Promise.all([preloadReact(), preloadVue()])
})

test("there are samples to compare", () => {
  expect(CORPUS.length).toBeGreaterThan(40)
})

test.each(CORPUS.map((sample) => [sample.name, sample] as const))(
  "%s is drawn the same by React and Vue",
  async (_name, sample) => {
    const react = await drawnByReact(sample)
    const vue = await drawnByVue(sample)
    expect(react.dom).not.toContain("iui-error")
    expect(vue.dom).toBe(react.dom)
    expect(vue.warnings).toEqual(react.warnings)
  }
)
