import { mkdirSync, writeFileSync } from "node:fs"
import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { beforeAll, expect, test } from "vitest"
import { CORPUS, corpusTools, type Sample } from "../../vue/test/corpus"
import { describe as describeDom } from "../../vue/test/dom"
import { mount, preloadUiSdk as preloadWeb } from "../src"
import { flushPromises } from "./helpers"
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

mkdirSync("/tmp/web-conf", { recursive: true })

test.each(CORPUS.map((sample) => [sample.name, sample] as const))(
  "%s is drawn the same by React and Web",
  async (name, sample) => {
    const react = await drawnByReact(sample)
    const web = await drawnByWeb(sample)
    const file = name.replace(/[^a-z0-9]+/gi, "_")
    writeFileSync(`/tmp/web-conf/${file}.react.txt`, react.reader + "\n\nWARN " + react.warnings.join("\n"))
    writeFileSync(`/tmp/web-conf/${file}.web.txt`, web.reader + "\n\nWARN " + web.warnings.join("\n"))
    writeFileSync(`/tmp/web-conf/${file}.src.txt`, sample.source)
    expect(react.dom).not.toContain("iui-error")
    expect(web.reader).toBe(react.reader)
    expect(web.warnings).toEqual(react.warnings)
    expect(react.warnings).toEqual([])
  }
)
