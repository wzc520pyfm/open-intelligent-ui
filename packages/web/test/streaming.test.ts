import { beforeAll, describe, expect, test } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import { AMBIENT, CORPUS, corpusTools } from "../../vue/test/corpus"
import { describe as describeDom } from "../../vue/test/dom"
import { mount, preloadUiSdk } from "../src"
import { UI_SDK_ELEMENTS } from "../src/registry/ui-sdk.generated"
import { flushPromises } from "./helpers"

// Numbers and charts are compared where they come to rest.
window.matchMedia = ((query: string) => ({
  matches: query.includes("reduce"),
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia

/**
 * Doc examples written with JSX that markup has no form for, and the token
 * input's, which fails in every renderer. The recipes cover all four.
 */
const NOT_MARKUP = new Set(["calendar", "preferences", "toast", "token-input"])

const sample = (name: string, source: string) => ({
  name,
  source,
  initialState: AMBIENT as Record<string, unknown>,
})

/** Roots neither the catalog's examples nor the corpus use. */
const MORE = [
  sample(
    "checkbox group",
    `<CheckboxGroup defaultValue={["a"]}>
  <label><Checkbox value="a"><CheckboxIndicator>✓</CheckboxIndicator></Checkbox> A</label>
  <label><Checkbox value="b"><CheckboxIndicator>✓</CheckboxIndicator></Checkbox> B</label>
</CheckboxGroup>`
  ),
  sample(
    "toggle group",
    `<ToggleGroup defaultValue={["b"]}><Toggle value="a">A</Toggle><Toggle value="b">B</Toggle></ToggleGroup>`
  ),
  sample(
    "field set",
    `<FieldSet disabled><Input placeholder="Name" /><Checkbox /><FieldGroup><Input placeholder="Mail" /></FieldGroup></FieldSet>`
  ),
  sample(
    "menu sub",
    `<Menu defaultOpen>
  <MenuTrigger>Actions</MenuTrigger>
  <MenuContent>
    <MenuItem value="a">A</MenuItem>
    <MenuSub>
      <MenuSubTrigger>More</MenuSubTrigger>
      <MenuSubContent><MenuItem value="b">B</MenuItem></MenuSubContent>
    </MenuSub>
  </MenuContent>
</Menu>`
  ),
  sample(
    "a template still being used",
    `<define name="Row"><div><slot /></div><DateInput defaultValue="2026-11-02" /><Rating defaultValue={2}><RatingItem /></Rating></define>
<Row>Some text that takes a while to arrive</Row>`
  ),
]

const SAMPLES = [
  ...UI_SDK_CATALOG.filter((entry) => !NOT_MARKUP.has(entry.slug)).map((entry) =>
    sample(`catalog ${entry.slug}`, entry.example)
  ),
  ...CORPUS,
  ...MORE,
]

/**
 * Where a stream is cut: after every tag, which is each time the tree can
 * change shape, and once inside a longer run of text.
 */
function cuts(source: string): number[] {
  const ends: number[] = []
  let last = 0
  for (let at = source.indexOf(">"); at !== -1; at = source.indexOf(">", at + 1)) {
    const end = at + 1
    if (end - last > 12) ends.push(last + Math.floor((end - last) / 2))
    ends.push(end)
    last = end
  }
  return ends.filter((end) => end < source.length)
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function settle(host: Element) {
  await flushPromises()
  await pause(30)
  for (let waited = 0; waited < 3000; waited += 10) {
    if (!host.querySelector("span.iui-icon:not([data-missing])")) return
    await pause(10)
  }
}

/** What stands on the page, without the parts a custom element keeps hidden for later. */
function drawn(host: Element): string {
  return describeDom(host.firstElementChild as Element)
}

beforeAll(async () => {
  await preloadUiSdk()
})

describe("a reply drawn as it streams", () => {
  test("is tried with every root UI SDK has", () => {
    const roots = Object.entries(UI_SDK_ELEMENTS)
      .filter(([, spec]) => spec?.root)
      .map(([name]) => name)
    const unused = roots.filter(
      (name) => !SAMPLES.some((sample) => new RegExp(`<${name}[\\s>/]`).test(sample.source))
    )
    // Toasts are drawn by the renderer, never from markup.
    expect(unused).toEqual(["ToastRegion"])
  })

  test("ends as the same DOM as the reply drawn whole, for every sample", async () => {
    const differing: string[] = []
    const reported: string[] = []
    const hear = (event: ErrorEvent) => {
      reported.push(event.message)
      event.preventDefault()
    }
    window.addEventListener("error", hear)
    for (const sample of SAMPLES) {
      const options = { tools: corpusTools(), initialState: sample.initialState ?? {} }
      const whole = document.body.appendChild(document.createElement("div"))
      const first = mount(whole, { ...options, source: sample.source })
      await settle(whole)
      const expected = drawn(whole)
      first.unmount()
      whole.remove()

      const host = document.body.appendChild(document.createElement("div"))
      const view = mount(host, { ...options, source: "", streaming: true })
      let errorBlocks = 0
      for (const end of cuts(sample.source)) {
        view.update({ source: sample.source.slice(0, end), streaming: true })
        await flushPromises()
        errorBlocks += host.querySelectorAll(".iui-error").length
      }
      view.update({ source: sample.source, streaming: false })
      await settle(host)
      const got = drawn(host)
      if (got !== expected) {
        const a = expected.split("\n")
        const b = got.split("\n")
        let at = 0
        while (at < a.length && a[at] === b[at]) at++
        differing.push(`${sample.name}: line ${at}\n  whole:    ${a[at]?.trim()}\n  streamed: ${b[at]?.trim()}`)
      }
      if (errorBlocks) differing.push(`${sample.name}: ${errorBlocks} error blocks while streaming`)
      view.unmount()
      host.remove()
    }
    window.removeEventListener("error", hear)
    expect(differing).toEqual([])
    expect(reported).toEqual([])
  }, 300_000)
})
