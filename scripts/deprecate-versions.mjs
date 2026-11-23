// Marks the versions listed in scripts/deprecated-versions.json as deprecated on npm,
// for every package under packages/ that published them. `npm install` then shows the
// message; nothing is removed. A version that already carries the message is left alone,
// so running this twice changes nothing.
// `node scripts/deprecate-versions.mjs --dry-run` prints what it would do.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const REGISTRY = "https://registry.npmjs.org"

/** The versions of one package to mark: published, listed, and not carrying the message yet. */
export function toDeprecate(published, listed) {
  return Object.entries(listed)
    .filter(([version, message]) => version in published && published[version].deprecated !== message)
    .map(([version, message]) => ({ version, message }))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes("--dry-run")
  const listed = JSON.parse(readFileSync(join(root, "scripts", "deprecated-versions.json"), "utf8"))
  const names = readdirSync(join(root, "packages"))
    .map((name) => join(root, "packages", name, "package.json"))
    .filter(existsSync)
    .map((path) => JSON.parse(readFileSync(path, "utf8")))
    .filter((manifest) => !manifest.private)
    .map((manifest) => manifest.name)

  let changed = 0
  for (const name of names) {
    const response = await fetch(`${REGISTRY}/${name.replace("/", "%2f")}`)
    if (response.status === 404) {
      console.log(`${name}: not on npm`)
      continue
    }
    if (!response.ok) {
      console.error(`${name}: the registry answered ${response.status}`)
      process.exit(1)
    }
    const published = (await response.json()).versions ?? {}
    const work = toDeprecate(published, listed)
    if (work.length === 0) console.log(`${name}: nothing to do`)
    for (const { version, message } of work) {
      console.log(`${name}@${version}: ${dryRun ? "would deprecate" : "deprecating"} with "${message}"`)
      if (!dryRun) execFileSync("npm", ["deprecate", `${name}@${version}`, message], { cwd: root, stdio: "inherit" })
      changed++
    }
  }
  console.log(`${changed} version${changed === 1 ? "" : "s"} ${dryRun ? "to mark" : "marked"}.`)
}
