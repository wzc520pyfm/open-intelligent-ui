// Run from this package after ../../scripts/build-css.mjs. Adds styles/elements.css to the shared
// stylesheet in dist/styles.css, as src/styles.css does for the workspace.
import { appendFileSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const elements = readFileSync(fileURLToPath(new URL("../styles/elements.css", import.meta.url)), "utf8")
if (/@import\b/.test(elements)) throw new Error("elements.css has an @import; inline it here too")

const out = fileURLToPath(new URL("../dist/styles.css", import.meta.url))
appendFileSync(out, `\n${elements.trimEnd()}\n`)
console.log(`dist/styles.css ${(readFileSync(out, "utf8").length / 1024).toFixed(1)} kB with the element styles`)
