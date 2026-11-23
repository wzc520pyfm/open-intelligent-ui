import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [solid()],
  server: { port: 5184, host: "127.0.0.1" },
  preview: { port: 4184, host: "127.0.0.1" },
})
