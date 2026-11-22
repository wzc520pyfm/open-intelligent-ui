// Writes the reference pages of the agent skills in skills/ from the same
// guides the system prompt is built from, so the two can't drift apart.
//
//   pnpm generate:skills
//
// Run it after editing packages/core/src/prompt. A test fails when the pages
// on disk are out of date.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createServer } from "vite"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

const server = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, ws: false },
  optimizeDeps: { noDiscovery: true },
  appType: "custom",
})

try {
  const { skillReferences } = await server.ssrLoadModule("/packages/core/src/prompt/index.ts")
  for (const [path, contents] of Object.entries(skillReferences())) {
    const file = join(root, "skills", path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, contents)
    console.log(`skills/${path}`)
  }
} finally {
  await server.close()
}
