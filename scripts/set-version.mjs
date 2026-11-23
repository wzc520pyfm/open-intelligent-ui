// Sets one version on the root and every package: `pnpm version:set 0.2.0`.
// The packages are released together and depend on each other's exact version.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? "")) {
  console.error("Usage: pnpm version:set <version>, like 0.2.0 or 0.2.0-beta.1")
  process.exit(1)
}

const root = fileURLToPath(new URL("..", import.meta.url))
const manifests = [
  join(root, "package.json"),
  ...readdirSync(join(root, "packages")).map((name) => join(root, "packages", name, "package.json")),
].filter(existsSync)

for (const path of manifests) {
  const text = readFileSync(path, "utf8")
  writeFileSync(path, text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`))
  console.log(`${JSON.parse(text).name} -> ${version}`)
}
