import {
  CORE_COMPONENTS,
  LANGUAGE_GUIDE,
  MOTION_GUIDE,
  PRIMITIVES_GUIDE,
  RECIPES,
  UI_SDK_CATALOG,
} from "@open-intelligent-ui/core/prompt"
import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { IntelligentUI, preloadUiSdk } from "../src"

function examples(markdown: string): string[] {
  return [...markdown.matchAll(/```\n([\s\S]*?)\n```/g)]
    .map((match) => match[1] as string)
    .filter((source) => source.includes("<"))
}

/** State the guide's snippets read without declaring, since each shows one idea. */
const AMBIENT = {
  count: 0,
  guests: 4,
  budget: 100,
  total: 42,
  draft: "",
  todos: [],
  items: [{ name: "Tea", qty: 2, price: 3.5 }],
  filter: "open",
  symbol: "",
  plans: [{ id: "a", name: "Basic", price: 10, blurb: "Enough to start." }],
  choice: "a",
  picked: false,
  pct: 40,
  front: 30,
  teeth: 12,
  open: true,
  step: 1,
  view: "list",
  rows: [{ id: 1, name: "Ada" }],
  selected: null,
  score: 3,
  page: 1,
  date: null,
  bold: false,
  note: "",
  tags: ["one"],
  ready: true,
  saved: false,
  results: [{ id: 1, title: "First" }],
  expanded: false,
  done: 1,
  steps: ["a", "b"],
  url: "https://example.com",
}

async function mount(source: string) {
  const warnings: string[] = []
  await act(async () => {
    await preloadUiSdk()
  })
  const view = render(
    <IntelligentUI
      source={source}
      initialState={AMBIENT}
      tools={{
        listTasks: async () => [{ id: 1, title: "Write", status: "open" }],
        getQuote: async () => ({ price: 10 }),
      }}
      onWarning={(message) => warnings.push(message)}
    />
  )
  await act(async () => {
    await Promise.resolve()
  })
  return { view, warnings }
}

describe("the prompt's examples render", () => {
  const guides = [
    ...examples(LANGUAGE_GUIDE),
    ...examples(PRIMITIVES_GUIDE),
    ...examples(MOTION_GUIDE),
  ]

  test.each(guides.map((source, index) => [index, source] as const))(
    "guide example %i",
    async (_index, source) => {
      const { view, warnings } = await mount(source)
      expect(view.container.querySelector(".iui-error"), source).toBeNull()
      expect(warnings, source).toEqual([])
    }
  )

  test.each(Object.entries(RECIPES))("recipe for %s", async (_slug, source) => {
    const { view, warnings } = await mount(source)
    await waitFor(() => expect(view.container.querySelector(".iui-pending")).toBeNull())
    expect(view.container.querySelector(".iui-error"), source).toBeNull()
    expect(warnings, source).toEqual([])
  })

  test.each(CORE_COMPONENTS)("core component %s", async (slug) => {
    const entry = UI_SDK_CATALOG.find((item) => item.slug === slug)
    const source = RECIPES[slug] ?? (entry?.example as string)
    const { view, warnings } = await mount(source)
    await waitFor(() => expect(view.container.querySelector(".iui-pending")).toBeNull())
    expect(view.container.querySelector(".iui-error"), source).toBeNull()
    expect(warnings, source).toEqual([])
  })
})
