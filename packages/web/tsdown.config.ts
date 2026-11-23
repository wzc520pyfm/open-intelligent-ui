import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/index.ts", define: "src/define.ts", "ui-sdk": "src/registry/ui-sdk.ts" },
  format: "esm",
  platform: "browser",
  dts: true,
  clean: true,
  // Nothing from node_modules may be copied into dist: a dependency missing from package.json fails the build.
  deps: { onlyBundle: [] },
})
