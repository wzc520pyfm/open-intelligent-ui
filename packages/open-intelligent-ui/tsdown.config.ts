import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    prompt: "src/prompt.ts",
    check: "src/check.ts",
    designs: "src/designs.ts",
    charts: "src/charts.ts",
    motion: "src/motion.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  // This package only re-exports: the code stays in @open-intelligent-ui/core.
  deps: { onlyBundle: [] },
})
