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
    "../../docs/**/*.md",
    "!../../docs/node_modules/**",
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
    const info = (match[1] as string).replace(/\[[^\]]*\]/, "").trim()
    return info.startsWith("iui") ? `${info}\n${match[2]}` : info
  })
}

/** The ids of a page's sections, which links from other pages point at. */
function sections(content: string): string[] {
  return content
    .replace(/^```[\s\S]*?^```$/gm, "")
    .split("\n")
    .flatMap((line) => {
      const heading = /^#{2,6}\s+(.*?)\s*$/.exec(line)
      if (!heading) return []
      const text = heading[1] as string
      const id = /\{#([^}]+)\}$/.exec(text)?.[1]
      return [
        id ??
          text
            .replace(/[`*_]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
      ]
    })
}

describe("the documentation site says the same in both languages", () => {
  const SITE = "../../docs/"
  const english = Object.keys(pages).filter(
    (file) => file.startsWith(SITE) && !file.startsWith(`${SITE}zh/`)
  )

  test("there are pages to compare", () => {
    expect(english.length).toBeGreaterThan(10)
  })

  test.each(english)("%s", (file) => {
    const translated = pages[file.replace(SITE, `${SITE}zh/`)]
    expect(translated, `${file} has no Chinese page`).toBeDefined()
    expect(blocks(translated as string)).toEqual(blocks(pages[file] as string))
    expect(sections(translated as string)).toEqual(sections(pages[file] as string))
  })
})
