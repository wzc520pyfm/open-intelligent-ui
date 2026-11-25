import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    prompt: "src/prompt/index.ts",
    check: "src/check/index.ts",
    designs: "src/designs/index.ts",
    renderer: "src/renderer/index.ts",
    charts: "src/charts/index.ts",
    motion: "src/motion/index.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  // Nothing from node_modules may be copied into dist: a dependency missing from package.json fails the build.
  deps: { onlyBundle: [] },
})
