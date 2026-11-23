import { IntelligentUI as ReactUI, preloadUiSdk as preloadReact } from "@open-intelligent-ui/react"
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { flushSync, mount, tick, unmount } from "svelte"
import { beforeAll, expect, test } from "vitest"
import { CORPUS, corpusTools, type Sample } from "../../vue/test/corpus"
import { describe as describeDom } from "../../vue/test/dom"
import { IntelligentUI as SvelteUI, preloadUiSdk as preloadSvelte } from "../src"

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
        ...(sample.library ? { library: sample.library } : {}),
      })
    )
  })
  await act(() => settle(() => host))
  const dom = describeDom(host.firstElementChild as Element)
  await act(async () => root.unmount())
  host.remove()
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  return { dom, warnings: distinct(warnings) }
}

async function flush() {
  await tick()
  flushSync()
  await pause(0)
  flushSync()
}

/** Svelte's own marks: comments, and text nodes with nothing in them. */
const isMark = (node: Node | null) =>
  node !== null &&
  (node.nodeType === Node.COMMENT_NODE || (node.nodeType === Node.TEXT_NODE && node.textContent === ""))

const beside = (node: Node, side: "previousSibling" | "nextSibling") => {
  let found = node[side]
  while (isMark(found)) found = (found as Node)[side]
  return found
}

const isPart = (node: Node | null): node is Element =>
  node instanceof Element && node.hasAttribute("data-slot")

/**
 * Where @ui-sdk/svelte itself draws something other than @ui-sdk/react does.
 * Both come from how its components are written, not from the renderer:
 *
 * - a part whose template has two things on separate lines, its element and
 *   the input it keeps for forms, say, has that line break kept by Svelte as
 *   one space of text between them, where JSX keeps none;
 * - `Slider` and `NumberInput` put their `type="hidden"` input after their
 *   element, where the React and Vue packages put it last inside.
 *
 * Neither is the renderer's to change. They are undone here, in what Svelte
 * drew only, so the rest can be compared exactly: a space the markup wrote
 * is in what React drew too, and taking it out would fail the comparison.
 * Returns how many of each were found.
 */
function undoUiSdkDifferences(root: Element): { spaces: number; moved: number } {
  const found = { spaces: 0, moved: 0 }
  // Two things after a part leave two spaces, the second beside the first.
  for (;;) {
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const spaces: Node[] = []
    while (texts.nextNode()) {
      const text = texts.currentNode
      if (text.textContent !== " ") continue
      if (isPart(beside(text, "previousSibling")) || isPart(beside(text, "nextSibling"))) spaces.push(text)
    }
    if (!spaces.length) break
    for (const space of spaces) space.parentNode?.removeChild(space)
    found.spaces += spaces.length
  }
  for (const input of root.querySelectorAll<HTMLInputElement>('input[type="hidden"][data-slot]')) {
    const part = beside(input, "previousSibling")
    if (!isPart(part)) continue
    const slot = part.getAttribute("data-slot") as string
    if (!(input.getAttribute("data-slot") as string).startsWith(`${slot}-`)) continue
    part.append(input)
    found.moved++
  }
  return found
}

interface DrawnBySvelte extends Drawn {
  /** The same, before `undoUiSdkDifferences`. */
  exact: string
  undone: { spaces: number; moved: number }
}

async function drawnBySvelte(sample: Sample): Promise<DrawnBySvelte> {
  const warnings: string[] = []
  const host = document.body.appendChild(document.createElement("div"))
  const view = mount(SvelteUI, {
    target: host,
    props: {
      source: sample.source,
      tools: corpusTools(),
      onWarning: (message: string) => warnings.push(message),
      ...(sample.initialState ? { initialState: sample.initialState } : {}),
      ...(sample.library ? { library: sample.library } : {}),
    },
  })
  await flush()
  await settle(() => host)
  await flush()
  // Svelte marks where its blocks start and end with comments and empty
  // text nodes, which `describeDom` leaves out.
  const exact = describeDom(host.firstElementChild as Element)
  const undone = undoUiSdkDifferences(host)
  const dom = undone.spaces || undone.moved ? describeDom(host.firstElementChild as Element) : exact
  await unmount(view)
  host.remove()
  return { dom, exact, undone, warnings: distinct(warnings) }
}

beforeAll(async () => {
  await Promise.all([preloadReact(), preloadSvelte()])
})

test("there are samples to compare", () => {
  expect(CORPUS.length).toBeGreaterThan(40)
})

/** The samples that are only the same once what @ui-sdk/svelte draws differently is undone. */
const differing: string[] = []
const undone = { spaces: 0, moved: 0 }

test.each(CORPUS.map((sample) => [sample.name, sample] as const))(
  "%s is drawn the same by React and Svelte",
  async (name, sample) => {
    const react = await drawnByReact(sample)
    const svelte = await drawnBySvelte(sample)
    expect(react.dom).not.toContain("iui-error")
    expect(svelte.dom).toBe(react.dom)
    expect(svelte.warnings).toEqual(react.warnings)
    expect(react.warnings).toEqual([])
    if (svelte.exact !== react.dom) differing.push(name)
    undone.spaces += svelte.undone.spaces
    undone.moved += svelte.undone.moved
  }
)

// Pinned, so a sample can't start to depend on `undoUiSdkDifferences` unnoticed.
test("what @ui-sdk/svelte draws differently is known", () => {
  expect(CORPUS.length - differing.length).toBe(32)
  expect(differing).toEqual([
    "demo gears",
    "demo invest",
    "demo trip",
    "demo dashboard",
    "demo workbench",
    "recipe rating",
    "recipe label",
    "recipe file-input",
    "recipe token-input",
    "core number-input",
    "core select",
    "core combobox",
    "core checkbox",
    "core radio",
    "core switch",
    "core slider",
    "core segmented-control",
    "core menu",
    "core date-picker",
    "README.md #1",
    "docs/spec.md #1",
    "skills/intelligent-ui/SKILL.md #1",
  ])
  expect(undone).toEqual({ spaces: 66, moved: 12 })
})
