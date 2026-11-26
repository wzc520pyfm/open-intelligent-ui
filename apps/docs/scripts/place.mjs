import { cpSync, existsSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// The playground's deployment serves this site from under /docs/, so the
// exported files go into the playground's own output.
const BASE = "/docs"
const from = fileURLToPath(new URL("../out", import.meta.url))
const to = fileURLToPath(new URL("../../playground/dist/docs", import.meta.url))

if (!existsSync(from)) throw new Error("Nothing was exported: run `next build` first.")

/** The folders that hold a page, as addresses: `guide/start`, `zh/reference/api`. */
function pages(folder = "") {
  return readdirSync(join(from, folder), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
    .flatMap((entry) => {
      const path = folder ? `${folder}/${entry.name}` : entry.name
      return [...(existsSync(join(from, path, "index.html")) ? [path] : []), ...pages(path)]
    })
}

// Pages used to end in .html, and the READMEs published to npm link to those
// addresses. Each one still answers, and sends the reader on with the
// section they asked for.
const all = pages()
let moved = 0
for (const path of all) {
  // A folder with pages under it was a folder then too: /docs/zh/ has always been its address.
  if (path === "404" || all.some((other) => other.startsWith(`${path}/`))) continue
  if (existsSync(join(from, `${path}.html`))) continue
  const address = `${BASE}/${path}/`
  writeFileSync(
    join(from, `${path}.html`),
    `<!doctype html><meta charset="utf-8"><title>Open Intelligent UI</title><meta name="robots" content="noindex"><link rel="canonical" href="${address}"><meta http-equiv="refresh" content="0; url=${address}"><script>location.replace(${JSON.stringify(address)} + location.hash)</script><a href="${address}">${address}</a>\n`
  )
  moved += 1
}

rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
console.log(`docs: placed in ${to}, with ${moved} old addresses answered`)
