import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { checkMarkup } from "@open-intelligent-ui/core/check"
import { skillReferences } from "@open-intelligent-ui/core/prompt"
import { IntelligentUI, preloadUiSdk } from "@open-intelligent-ui/react"
import { PRODUCT } from "../src/library/product"
import { createTicketTools } from "../src/tools"

const pages = import.meta.glob<string>(
  [
    "../../../README.md",
    "../../../docs/**/*.md",
    "../../../skills/**/*.md",
    "../../docs/content/**/*.mdx",
  ],
  { query: "?raw", import: "default", eager: true }
)

function page(path: string): string | undefined {
  return pages[`../../../${path}`]
}

/**
 * Every fenced block marked `iui` in the docs, the skills and the
 * documentation site is a complete interface. On the site a block marked
 * `iui live` is drawn above its source, and `product` gives it the made-up
 * product's components.
 */
const examples = Object.entries(pages).flatMap(([file, content]) =>
  [...content.matchAll(/```iui([^\n]*)\n([\s\S]*?)\n```/g)].map((match, index) => {
    const name = `${file.replace("../../../", "").replace("../../docs/", "apps/docs/")} #${index + 1}`
    const library = (match[1] as string).split(/\s+/).includes("product") ? PRODUCT : undefined
    return [name, match[2] as string, library] as const
  })
)

describe("documented interfaces render", () => {
  test("there are examples to check", () => {
    expect(examples.length).toBeGreaterThan(3)
  })

  test.each(examples)("%s", async (_name, source, library) => {
    const warnings: string[] = []
    await act(async () => {
      await preloadUiSdk()
    })
    const view = render(
      <IntelligentUI
        source={source}
        library={library}
        tools={createTicketTools(0)}
        onWarning={(message) => warnings.push(message)}
      />
    )
    await waitFor(() => {
      expect(view.container.querySelector(".iui-pending")).toBeNull()
      expect(view.container.querySelector(".iui-skeleton")).toBeNull()
    })
    expect(view.container.querySelector(".iui-error")?.textContent ?? null, source).toBeNull()
    expect(warnings, source).toEqual([])
    expect(view.container.querySelector(".iui-root")?.textContent?.trim().length).toBeGreaterThan(0)
  })

  test.each(examples)("%s checks out before it is drawn", (_name, source, library) => {
    expect(checkMarkup(source, { library, tools: Object.keys(createTicketTools(0)) }).issues).toEqual([])
  })
})

describe("skill references", () => {
  test.each(Object.entries(skillReferences()))("skills/%s is what the prompt builder writes", (path, content) => {
    expect(page(`skills/${path}`), "run pnpm generate:skills").toBe(content)
  })
})

/** The code blocks of a page: the language of each, and what the ones the tests draw hold. */
function blocks(content: string): string[] {
  return [...content.matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)].map((match) => {
    const info = (match[1] as string).replace(/\s+tab="[^"]*"/, "").trim()
    return info.startsWith("iui") ? `${info}\n${match[2]}` : info
  })
}

/** The headings of a page, without its code blocks. */
function headings(content: string): string[] {
  return content
    .replace(/^```[\s\S]*?^```$/gm, "")
    .split("\n")
    .flatMap((line) => /^#{2,6}\s+(.*?)\s*$/.exec(line)?.[1] ?? [])
}

/** The ids of a page's sections, which links from other pages point at. */
function sections(content: string): string[] {
  return headings(content).flatMap((text) => /\[#([^\]]+)\]$/.exec(text)?.[1] ?? [])
}

const SITE = "../../docs/content/docs/"
const site = Object.keys(pages).filter((file) => file.startsWith(SITE))

/** The file a link on the site leads to: `/zh/guide/start` is `zh/guide/start.mdx`. */
function target(link: string): string {
  const parts = link.split("/").filter(Boolean)
  const language = parts[0] === "zh" ? (parts.shift() as string) : "en"
  return `${SITE}${language}/${parts.join("/") || "index"}.mdx`
}

describe("the documentation site", () => {
  test("there are pages to check", () => {
    expect(site.length).toBeGreaterThan(20)
  })

  // An id written out stays the same when a heading is reworded or translated.
  test.each(site)("%s gives every section an id", (file) => {
    const all = headings(pages[file] as string)
    expect(all.filter((text) => !/\[#[^\]]+\]$/.test(text))).toEqual([])
    expect(new Set(sections(pages[file] as string)).size).toBe(all.length)
  })

  test.each(site)("%s links to pages and sections that exist", (file) => {
    const content = (pages[file] as string).replace(/^```[\s\S]*?^```$/gm, "")
    const links = [...content.matchAll(/(?:\]\(|href=")(\/[^)"\s]*)/g)].map((match) => match[1] as string)
    const language = file.startsWith(`${SITE}zh/`) ? "zh" : "en"
    for (const link of links) {
      const [path = "", id] = link.split("#")
      const to = target(path)
      expect(pages[to], `${link} leads nowhere`).toBeDefined()
      expect(to.startsWith(`${SITE}${language}/`), `${link} leaves the page's language`).toBe(true)
      if (id) expect(sections(pages[to] as string), `${link} has no such section`).toContain(id)
    }
  })
})

describe("the documentation site says the same in both languages", () => {
  const english = site.filter((file) => file.startsWith(`${SITE}en/`))

  test("there are pages to compare", () => {
    expect(english.length).toBeGreaterThan(10)
  })

  test.each(english)("%s", (file) => {
    const translated = pages[file.replace(`${SITE}en/`, `${SITE}zh/`)]
    expect(translated, `${file} has no Chinese page`).toBeDefined()
    expect(blocks(translated as string)).toEqual(blocks(pages[file] as string))
    expect(sections(translated as string)).toEqual(sections(pages[file] as string))
  })
})
