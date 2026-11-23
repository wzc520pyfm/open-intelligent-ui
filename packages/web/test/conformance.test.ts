import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeAll, expect, test } from "vitest"
import { CORPUS, corpusTools, type Sample } from "../../vue/test/corpus"
import { describe as describeDom } from "../../vue/test/dom"
import { isUiSdkComponent, mount, preloadUiSdk as preloadWeb } from "../src"
import { flushPromises } from "./helpers"
import { EXACT_SAMPLES } from "./exact-samples"
import { describeForReader } from "./reader"

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

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Waits for what arrives late: an icon is a placeholder until its drawing has loaded. */
async function settle(root: () => Element | null) {
  await pause(40)
  for (let waited = 0; waited < 5000; waited += 10) {
    if (!root()?.querySelector("span.iui-icon:not([data-missing])")) return
    await pause(10)
  }
}

interface Drawn {
  dom: string
  reader: string
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
  await act(() => settle(() => host))
  const dom = describeDom(host.firstElementChild as Element)
  const reader = describeForReader(host.firstElementChild as Element)
  await act(async () => root.unmount())
  host.remove()
  return { dom, reader, warnings: distinct(warnings) }
}

async function drawnByWeb(sample: Sample): Promise<Drawn> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  const warnings: string[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const view = mount(host, {
    source: sample.source,
    tools: corpusTools(),
    onWarning: (message: string) => warnings.push(message),
    ...(sample.initialState ? { initialState: sample.initialState } : {}),
  })
  await flushPromises()
  await settle(() => host)
  await flushPromises()
  const dom = describeDom(host.firstElementChild as Element)
  const reader = describeForReader(host.firstElementChild as Element)
  view.unmount()
  host.remove()
  return { dom, reader, warnings: distinct(warnings) }
}

beforeAll(async () => {
  await Promise.all([preloadReact(), preloadWeb()])
})

test("there are samples to compare", () => {
  expect(CORPUS.length).toBeGreaterThan(40)
})

/** Whether a sample draws any UI SDK component, which the two renderers build from different elements. */
const usesUiSdk = (source: string) =>
  [...source.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].some((match) => isUiSdkComponent(match[1] as string))

const exact: string[] = []
const byReader: string[] = []

/**
 * A sample with no UI SDK component must give the same DOM, node for node.
 * One with UI SDK components is built from custom elements here and from
 * React components there, so it is compared as `describeForReader` reads
 * it: every element outside UI SDK exactly, and each UI SDK part by its
 * slot, role, name, state and text.
 */
test.each(CORPUS.map((sample) => [sample.name, sample] as const))(
  "%s is drawn the same by React and Web",
  async (name, sample) => {
    const react = await drawnByReact(sample)
    const web = await drawnByWeb(sample)
    expect(react.dom).not.toContain("iui-error")
    if (usesUiSdk(sample.source)) {
      expect(web.reader).toBe(react.reader)
      byReader.push(name)
    } else {
      expect(web.dom).toBe(react.dom)
      exact.push(name)
    }
    expect(web.warnings).toEqual(react.warnings)
    expect(react.warnings).toEqual([])
  }
)

test("the corpus splits into samples compared exactly and samples compared as read", () => {
  // The split the report quotes; a new sample has to be counted on one side.
  expect({ exact: exact.length, byReader: byReader.length }).toEqual({ exact: 6, byReader: 47 })
})

test("the samples of our own stay clear of UI SDK", () => {
  expect(EXACT_SAMPLES.filter((sample) => usesUiSdk(sample.source))).toEqual([])
})

test.each(EXACT_SAMPLES.map((sample) => [sample.name, sample] as const))(
  "%s gives the same DOM in React and Web",
  async (_name, sample) => {
    const react = await drawnByReact(sample)
    const web = await drawnByWeb(sample)
    expect(react.dom).not.toContain("iui-error")
    expect(web.dom).toBe(react.dom)
    expect(web.warnings).toEqual(react.warnings)
  }
)
