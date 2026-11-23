// Run from a package directory. Writes dist/styles.css: packages/core/styles/index.css with each
// `@import "./file.css";` replaced by that file's text. Nothing is transformed, so the published
// stylesheet is the tested one, byte for byte. Every renderer ships its own copy.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const styles = fileURLToPath(new URL("../packages/core/styles/", import.meta.url))
const dist = join(process.cwd(), "dist")

const read = (name) => readFileSync(styles + name, "utf8")

const css = read("index.css").replace(/^@import "\.\/([\w.-]+\.css)";$/gm, (_, name) => {
  const text = read(name)
  if (/@import\b/.test(text)) throw new Error(`${name} has its own @import; inline it here too`)
  return text.trimEnd()
})

if (/@import\b/.test(css)) throw new Error("index.css has an @import this script does not handle")

mkdirSync(dist, { recursive: true })
writeFileSync(join(dist, "styles.css"), css)
console.log(`dist/styles.css ${(css.length / 1024).toFixed(1)} kB`)
