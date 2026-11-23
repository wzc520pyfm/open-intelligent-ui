import { fileURLToPath } from "node:url"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineProject } from "vitest/config"

export default defineProject({
  plugins: [svelte({ configFile: fileURLToPath(new URL("./svelte.config.js", import.meta.url)) })],
  // Without this Svelte resolves to its server build, which can't mount.
  resolve: { conditions: ["browser"] },
  test: {
    name: "svelte",
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    css: false,
    // UI SDK ships uncompiled `.svelte` files, which Node can't load itself.
    server: { deps: { inline: [/@ui-sdk\/svelte/] } },
  },
})
