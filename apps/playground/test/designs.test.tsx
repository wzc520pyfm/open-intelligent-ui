import { designToCss, parseDesign } from "@open-intelligent-ui/core"
import * as designs from "@open-intelligent-ui/core/designs"
import { describe, expect, test } from "vitest"

const files = import.meta.glob<string>("../../../design/*.DESIGN.md", {
  query: "?raw",
  import: "default",
  eager: true,
})
const file = (name: string) => files[`../../../design/${name}.DESIGN.md`]

describe("the designs that come with the package", () => {
  test("are the files under design/, so run pnpm generate after editing one", () => {
    expect(designs.paper).toBe(file("default"))
    expect(designs.noir).toBe(file("noir"))
    expect(designs.heritage).toBe(file("heritage"))
    expect(designs.signal).toBe(file("signal"))
    expect(Object.keys(designs).sort()).toEqual(
      Object.keys(files)
        .map((path) => (/([a-z]+)\.DESIGN\.md$/.exec(path)?.[1] ?? "").replace("default", "paper"))
        .sort()
    )
  })

  test.each(Object.entries(designs))("%s reads without a problem, in light and dark", (_name, source) => {
    const design = parseDesign(source)
    expect(design.issues).toEqual([])
    expect(Object.keys(design.colors).length).toBeGreaterThan(10)
    expect(Object.keys(design.darkColors ?? {}).length).toBeGreaterThan(10)
    expect(Object.keys(design.motion).length).toBeGreaterThan(3)
    expect(designToCss(design, { selector: ".x" })).toContain("--iui-color-accent")
  })
})
