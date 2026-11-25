import * as core from "@open-intelligent-ui/core"
import * as coreCharts from "@open-intelligent-ui/core/charts"
import * as coreCheck from "@open-intelligent-ui/core/check"
import * as coreDesigns from "@open-intelligent-ui/core/designs"
import * as coreMotion from "@open-intelligent-ui/core/motion"
import * as corePrompt from "@open-intelligent-ui/core/prompt"
import { expect, test } from "vitest"
import * as charts from "../src/charts"
import * as check from "../src/check"
import * as designs from "../src/designs"
import * as all from "../src/index"
import * as motion from "../src/motion"
import * as prompt from "../src/prompt"

test("re-exports everything in @open-intelligent-ui/core", () => {
  expect(Object.keys(all).sort()).toEqual(Object.keys(core).sort())
  expect(all.parse).toBe(core.parse)
})

test("re-exports everything in @open-intelligent-ui/core/prompt", () => {
  expect(Object.keys(prompt).sort()).toEqual(Object.keys(corePrompt).sort())
  expect(prompt.buildSystemPrompt).toBe(corePrompt.buildSystemPrompt)
})

test("re-exports the chart and motion adapters", () => {
  expect(Object.keys(charts).sort()).toEqual(Object.keys(coreCharts).sort())
  expect(charts.echartsCharts).toBe(coreCharts.echartsCharts)
  expect(Object.keys(motion).sort()).toEqual(Object.keys(coreMotion).sort())
  expect(motion.motionAdapter).toBe(coreMotion.motionAdapter)
})

test("re-exports the checker and the designs", () => {
  expect(Object.keys(check).sort()).toEqual(Object.keys(coreCheck).sort())
  expect(check.checkMarkup).toBe(coreCheck.checkMarkup)
  expect(Object.keys(designs).sort()).toEqual(Object.keys(coreDesigns).sort())
  expect(designs.noir).toBe(coreDesigns.noir)
})
