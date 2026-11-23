import * as core from "@open-intelligent-ui/core"
import * as corePrompt from "@open-intelligent-ui/core/prompt"
import { expect, test } from "vitest"
import * as all from "../src/index"
import * as prompt from "../src/prompt"

test("re-exports everything in @open-intelligent-ui/core", () => {
  expect(Object.keys(all).sort()).toEqual(Object.keys(core).sort())
  expect(all.parse).toBe(core.parse)
})

test("re-exports everything in @open-intelligent-ui/core/prompt", () => {
  expect(Object.keys(prompt).sort()).toEqual(Object.keys(corePrompt).sort())
  expect(prompt.buildSystemPrompt).toBe(corePrompt.buildSystemPrompt)
})
