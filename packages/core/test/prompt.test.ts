import { describe, expect, test } from "vitest"
import { parse } from "../src"
import {
  buildSystemPrompt,
  CORE_COMPONENTS,
  describeComponent,
  LANGUAGE_GUIDE,
  MOTION_GUIDE,
  PRIMITIVES_GUIDE,
  RECIPES,
  UI_SDK_CATALOG,
  UNSUPPORTED,
} from "../src/prompt"

/** Fenced examples in a guide, without the fences. */
function examples(markdown: string): string[] {
  return [...markdown.matchAll(/```\n([\s\S]*?)\n```/g)].map((match) => match[1] as string)
}

describe("system prompt", () => {
  test("covers the language, components, motion, design and tools", () => {
    const prompt = buildSystemPrompt({
      tools: [
        {
          name: "listTasks",
          kind: "read",
          description: "Tasks in the current project.",
          input: { type: "object", properties: { status: { type: "string" } } },
        },
        { name: "createTask", kind: "write", input: "{ title: string }" },
      ],
      hostComponents: [
        { name: "FlightMap", description: "A map of one route.", example: '<FlightMap from="SFO" to="NRT" />' },
      ],
      instructions: "Prices are in euros.",
    })
    for (const heading of [
      "# Writing an interface",
      "# Primitives",
      "# Preset widgets",
      "# UI SDK components",
      "# Components from this product",
      "# Motion",
      "# Craft",
      "# Design system: Paper",
      "# Tools",
      "# For this product",
    ]) {
      expect(prompt).toContain(`\n${heading}\n`.trimStart())
    }
    expect(prompt).toContain("### listTasks (read)")
    expect(prompt).toContain('Input: {"type":"object","properties":{"status":{"type":"string"}}}')
    expect(prompt).toContain("### createTask (write)")
    expect(prompt).toContain("<FlightMap")
    expect(prompt).toContain("Prices are in euros.")
    expect(prompt).toContain("- Colors:")
    expect(prompt).toContain("## Motion & Micro-interaction")
  })

  test("shows core components with examples and names the rest", () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain("### Tabs\n")
    expect(prompt).toContain("<TabsPanel")
    expect(prompt).toContain("Bind: `bind:value`.")
    expect(prompt).toContain("- **Tree**:")
    expect(prompt).not.toContain("<TreeItem value=")
    expect(prompt).toContain("Toast is not available in markup")
    expect(prompt.length).toBeLessThan(60_000)
  })

  test("the selection can be widened or narrowed", () => {
    const all = buildSystemPrompt({ components: "all" })
    expect(all).toContain("<TreeItem value=")
    expect(all).not.toContain("### Also available")
    const few = buildSystemPrompt({ components: ["Tabs", "dialog"], motion: false })
    expect(few).toContain("### Dialog\n")
    expect(few).toContain("- **Accordion**:")
    expect(few).not.toContain("\n# Motion\n")
  })

  test("says so when there are no tools", () => {
    expect(buildSystemPrompt()).toContain("No tools are available to the interface.")
  })

  test("takes the product's own design", () => {
    const prompt = buildSystemPrompt({
      design: `---
name: Heritage
colors:
  primary: "#1A1C1E"
  tertiary: "#B8422E"
---

## Overview

Architectural minimalism meets journalistic gravitas.`,
    })
    expect(prompt).toContain("# Design system: Heritage")
    expect(prompt).toContain("tertiary")
    expect(prompt).toContain("journalistic gravitas")
    expect(prompt).not.toContain("Paper is the default look")
  })
})

describe("component lookup", () => {
  test("describes a component by entry point or by any of its parts", () => {
    const tabs = describeComponent("TabsPanel")
    expect(tabs).toContain("## Tabs")
    expect(tabs).toContain("Bind state with: `bind:value`")
    expect(tabs).toContain("`TabsTab` `[data-selected]`")
    expect(describeComponent("number-input")).toContain("## Number Input")
    expect(describeComponent("Nope")).toBeNull()
  })

  test("lists every prop on request", () => {
    const full = describeComponent("Slider", { props: true })
    expect(full).toContain("### Slider")
    expect(full).toMatch(/- `min`/)
    expect(full).toMatch(/- `onValueChange`/)
  })

  test("points to the alternative for what markup can't do", () => {
    expect(describeComponent("toast")).toContain("Not available in markup")
  })
})

describe("examples in the prompt", () => {
  test("every example parses as markup without problems", () => {
    const sources = [
      ...examples(LANGUAGE_GUIDE),
      ...examples(PRIMITIVES_GUIDE),
      ...examples(MOTION_GUIDE),
      ...Object.values(RECIPES),
    ].filter((source) => source.includes("<") && !source.trimStart().startsWith("."))
    expect(sources.length).toBeGreaterThan(15)
    for (const source of sources) {
      const doc = parse(source)
      expect(doc.diagnostics, source).toEqual([])
    }
  })

  test("core components and recipes name real entry points", () => {
    const slugs = new Set(UI_SDK_CATALOG.map((entry) => entry.slug))
    for (const slug of [...CORE_COMPONENTS, ...Object.keys(RECIPES), ...Object.keys(UNSUPPORTED)]) {
      expect(slugs.has(slug), slug).toBe(true)
    }
  })
})
