import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          include: [
            "packages/core/test/**/*.test.ts",
            "packages/open-intelligent-ui/test/**/*.test.ts",
            "packages/create-open-intelligent-ui/test/**/*.test.ts",
          ],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "react",
          include: ["packages/react/test/**/*.test.tsx", "apps/playground/test/**/*.test.tsx"],
          environment: "jsdom",
          setupFiles: ["packages/react/test/setup.ts"],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: "vue",
          include: ["packages/vue/test/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["packages/vue/test/setup.ts"],
          css: false,
        },
      },
      {
        extends: true,
        // Solid's packages hand Node their server build; the tests need the one a browser gets.
        resolve: { conditions: ["browser", "development"] },
        test: {
          name: "solid",
          include: ["packages/solid/test/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["packages/solid/test/setup.ts"],
          css: false,
          server: { deps: { inline: [/solid-js/, /@solidjs\//, /@ui-sdk\/solid/] } },
        },
      },
      "packages/svelte/vitest.config.ts",
      {
        extends: true,
        test: {
          name: "web",
          include: ["packages/web/test/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["packages/web/test/setup.ts"],
          css: false,
        },
      },
    ],
  },
})
