// Writes dist/styles.css: src/styles/index.css with each `@import "./file.css";` replaced by that
// file's text. Nothing is transformed, so the published stylesheet is the tested one, byte for byte.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const styles = fileURLToPath(new URL("../src/styles/", import.meta.url))
const dist = fileURLToPath(new URL("../dist/", import.meta.url))

const read = (name) => readFileSync(styles + name, "utf8")

const css = read("index.css").replace(/^@import "\.\/([\w.-]+\.css)";$/gm, (_, name) => {
  const text = read(name)
  if (/@import\b/.test(text)) throw new Error(`${name} has its own @import; inline it here too`)
  return text.trimEnd()
})

if (/@import\b/.test(css)) throw new Error("index.css has an @import this script does not handle")

mkdirSync(dist, { recursive: true })
writeFileSync(dist + "styles.css", css)
console.log(`dist/styles.css ${(css.length / 1024).toFixed(1)} kB`)
