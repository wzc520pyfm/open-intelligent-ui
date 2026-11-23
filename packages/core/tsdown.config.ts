import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    prompt: "src/prompt/index.ts",
    renderer: "src/renderer/index.ts",
  },
  format: "esm",
  platform: "neutral",
  dts: true,
  clean: true,
  // Nothing from node_modules may be copied into dist: a dependency missing from package.json fails the build.
  deps: { onlyBundle: [] },
})
