import postcss from "postcss"
import { describe, expect, it } from "vitest"
import { keepSiteStylesOutOfSurfaces, outsideSurfaces } from "../build/outside-surfaces"

const G = ":where(:not(.iui-root, .iui-root *))"

describe("keeping the site's styles out of generated surfaces", () => {
  it("guards the element a selector is about", () => {
    expect(outsideSurfaces(".card")).toBe(`.card${G}`)
    expect(outsideSurfaces("svg")).toBe(`svg${G}`)
    expect(outsideSurfaces("*")).toBe(`*${G}`)
    expect(outsideSurfaces(".tabs > .tab[data-selected]")).toBe(`.tabs > .tab[data-selected]${G}`)
    expect(outsideSurfaces(".a:is(.b, .c *):hover")).toBe(`.a:is(.b, .c *):hover${G}`)
  })

  it("guards every selector of a list", () => {
    expect(outsideSurfaces(".a, .b .c")).toBe(`.a${G}, .b .c${G}`)
  })

  it("puts the guard before a pseudo-element, without a space that would mean any descendant", () => {
    expect(outsideSurfaces("*,\n  ::after,\n  ::before")).toBe(`*${G},\n  ${G}::after,\n  ${G}::before`)
    expect(outsideSurfaces(".a::placeholder")).toBe(`.a${G}::placeholder`)
    expect(outsideSurfaces(".a:after")).toBe(`.a${G}:after`)
    expect(outsideSurfaces("input::file-selector-button:hover")).toBe(`input${G}::file-selector-button:hover`)
  })

  it("leaves the root element and a nested `&` alone", () => {
    expect(outsideSurfaces("html, :host")).toBe("html, :host")
    expect(outsideSurfaces(":root, .dark")).toBe(`:root, .dark${G}`)
    expect(outsideSurfaces("&:hover")).toBe("&:hover")
    expect(outsideSurfaces(".dark &")).toBe(".dark &")
    expect(outsideSurfaces("& > svg")).toBe(`& > svg${G}`)
  })

  it("rewrites the site's layers and nothing else", async () => {
    const css = `
@layer base { svg { display: block } @media (hover: hover) { a:hover { color: red } } }
@layer components { .card { padding: 1px; &:hover { padding: 2px } .title { margin: 0 } } @keyframes spin { from { rotate: 0deg } to { rotate: 1turn } } }
@layer iui { .iui-root svg { display: inline } }
.pg-surface { padding: 22px }`
    const result = await postcss([keepSiteStylesOutOfSurfaces]).process(css, { from: undefined })
    const selectors: string[] = []
    result.root.walkRules((rule) => void selectors.push(rule.selector))
    expect(selectors).toEqual([
      `svg${G}`,
      `a:hover${G}`,
      `.card${G}`,
      "&:hover",
      `.title${G}`,
      "from",
      "to",
      ".iui-root svg",
      ".pg-surface",
    ])
  })
})
