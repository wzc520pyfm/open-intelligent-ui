import {
  CORE_COMPONENTS,
  LANGUAGE_GUIDE,
  MOTION_GUIDE,
  PRIMITIVES_GUIDE,
  RECIPES,
  UI_SDK_CATALOG,
} from "@open-intelligent-ui/core/prompt"
import type { Tool } from "@open-intelligent-ui/core"
import { DEMOS } from "../../../apps/playground/src/demos"
import { createTicketTools } from "../../../apps/playground/src/tools"

const pages = import.meta.glob<string>(
  ["../../../README.md", "../../../docs/**/*.md", "../../../skills/**/*.md"],
  { query: "?raw", import: "default", eager: true }
)

function fenced(markdown: string): string[] {
  return [...markdown.matchAll(/```\n([\s\S]*?)\n```/g)]
    .map((match) => match[1] as string)
    .filter((source) => source.includes("<"))
}

/** State the guide's snippets read without declaring, since each shows one idea. */
export const AMBIENT = {
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

export interface Sample {
  name: string
  source: string
  /** Snippets from the guide lean on state they don't declare. */
  initialState?: Record<string, unknown>
}

/**
 * Every interface this repository shows anyone: the playground demos, the
 * examples in the prompt, the recipes, each core component's own example, and
 * the `iui` blocks in the docs and skills.
 */
export const CORPUS: Sample[] = [
  ...DEMOS.map((demo) => ({ name: `demo ${demo.id}`, source: demo.source })),
  ...[...fenced(LANGUAGE_GUIDE), ...fenced(PRIMITIVES_GUIDE), ...fenced(MOTION_GUIDE)].map(
    (source, index) => ({ name: `guide ${index}`, source, initialState: AMBIENT })
  ),
  ...Object.entries(RECIPES).map(([slug, source]) => ({
    name: `recipe ${slug}`,
    source,
    initialState: AMBIENT,
  })),
  ...CORE_COMPONENTS.filter((slug) => !RECIPES[slug]).map((slug) => ({
    name: `core ${slug}`,
    source: UI_SDK_CATALOG.find((item) => item.slug === slug)?.example as string,
    initialState: AMBIENT,
  })),
  ...Object.entries(pages).flatMap(([file, content]) =>
    [...content.matchAll(/```iui\n([\s\S]*?)\n```/g)].map((match, index) => ({
      name: `${file.replace("../../../", "")} #${index + 1}`,
      source: match[1] as string,
    }))
  ),
]

/** Tools the samples call. A fresh set per render, so no sample sees another's writes. */
export function corpusTools(): Record<string, Tool> {
  return {
    ...createTicketTools(0),
    listTasks: async () => [{ id: 1, title: "Write", status: "open" }],
    getQuote: async () => ({ price: 10 }),
  }
}
