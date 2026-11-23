import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", prompt: "src/prompt.ts" },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  // This package only re-exports: the code stays in @open-intelligent-ui/core.
  deps: { onlyBundle: [] },
})
