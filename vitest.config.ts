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
          include: ["packages/core/test/**/*.test.ts", "packages/open-intelligent-ui/test/**/*.test.ts"],
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
    ],
  },
})
