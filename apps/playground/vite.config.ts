import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import type { AtRule, Plugin, Root } from "postcss"
import { defineConfig } from "vite"

const core = JSON.parse(
  readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8")
) as { version: string }

const SITE_LAYERS = new Set(["base", "components", "utilities"])
const GROUPING = new Set(["media", "supports", "container", "starting-style"])
const ROOT = /^(html|:root|:host)(?![-\w])[^\s>+~]*$/

/**
 * The site is drawn with Tailwind and HeroUI, whose reset and class names
 * (`.card`, `.button`, `svg { display: block }`) would otherwise reach into a
 * generated surface. Every rule in their layers is put in a scope that ends
 * where a surface begins, so a surface looks the way it does on a bare page.
 */
const keepSiteStylesOutOfSurfaces: Plugin = {
  postcssPlugin: "keep-site-styles-out-of-surfaces",
  Once(root: Root, { atRule }) {
    const wrap = (layer: AtRule) => {
      const scope = atRule({ name: "scope", params: "(:root) to (.iui-root)" })
      for (const node of [...(layer.nodes ?? [])]) {
        if (node.type === "atrule" && node.name === "layer") {
          if (node.nodes) wrap(node)
        } else if (node.type === "rule") {
          // A scoped selector only reaches what is inside the scope's root, so a
          // rule for the root element itself stays where it was.
          const root = node.selectors.filter((selector) => ROOT.test(selector.trim()))
          if (root.length === node.selectors.length) continue
          if (root.length) {
            node.cloneBefore({ selectors: root })
            node.selectors = node.selectors.filter((selector) => !ROOT.test(selector.trim()))
          }
          scope.append(node.remove())
        } else if (node.type === "atrule" && GROUPING.has(node.name)) {
          scope.append(node.remove())
        }
      }
      if (scope.nodes?.length) layer.prepend(scope)
    }
    root.each((node) => {
      if (node.type === "atrule" && node.name === "layer" && node.nodes && SITE_LAYERS.has(node.params)) {
        wrap(node)
      }
    })
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  css: { postcss: { plugins: [keepSiteStylesOutOfSurfaces] } },
  define: {
    __VERSION__: JSON.stringify(core.version),
    // The Vue renderer is bundled too, for the renderer switch.
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  server: { port: 5173, host: "127.0.0.1" },
  preview: { port: 4173, host: "127.0.0.1" },
})
