import { svelte } from "@sveltejs/vite-plugin-svelte"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5186, host: "127.0.0.1" },
  preview: { port: 4186, host: "127.0.0.1" },
})
