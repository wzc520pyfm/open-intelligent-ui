import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "ui-sdk": "src/registry/ui-sdk.ts",
    recharts: "src/recharts.tsx",
  },
  format: "esm",
  platform: "browser",
  dts: true,
  clean: true,
  // Nothing from node_modules may be copied into dist: a dependency missing from package.json fails the build.
  deps: { onlyBundle: [] },
  // The renderer uses hooks, so frameworks with server components must treat it as a client module.
  banner: { js: '"use client";' },
})
