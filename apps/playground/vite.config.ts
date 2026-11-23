import { readFileSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vite"
import { keepSiteStylesOutOfSurfaces } from "./build/outside-surfaces"

const core = JSON.parse(
  readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8")
) as { version: string }

export default defineConfig({
  // The Svelte renderer and UI SDK for Svelte are `.svelte` files; this compiles them and nothing else.
  plugins: [react(), svelte({ configFile: false, compilerOptions: { runes: true } }), tailwindcss()],
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
