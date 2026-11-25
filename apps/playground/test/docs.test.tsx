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
