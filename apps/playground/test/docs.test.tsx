import { act, render, waitFor } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { skillReferences } from "@open-intelligent-ui/core/prompt"
import { IntelligentUI, preloadUiSdk } from "@open-intelligent-ui/react"
import { createTicketTools } from "../src/tools"

const pages = import.meta.glob<string>(
  ["../../../README.md", "../../../docs/**/*.md", "../../../skills/**/*.md"],
  { query: "?raw", import: "default", eager: true }
)

function page(path: string): string | undefined {
  return pages[`../../../${path}`]
}

/** Every fenced block marked `iui` in the docs and skills is a complete interface. */
const examples = Object.entries(pages).flatMap(([file, content]) =>
  [...content.matchAll(/```iui\n([\s\S]*?)\n```/g)].map(
    (match, index) => [`${file.replace("../../../", "")} #${index + 1}`, match[1] as string] as const
  )
)

describe("documented interfaces render", () => {
  test("there are examples to check", () => {
    expect(examples.length).toBeGreaterThan(3)
  })

  test.each(examples)("%s", async (_name, source) => {
    const warnings: string[] = []
    await act(async () => {
      await preloadUiSdk()
    })
    const view = render(
      <IntelligentUI
        source={source}
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
})

describe("skill references", () => {
  test.each(Object.entries(skillReferences()))("skills/%s is what the prompt builder writes", (path, content) => {
    expect(page(`skills/${path}`), "run pnpm generate:skills").toBe(content)
  })
})
