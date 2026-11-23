// Publishes every package under packages/ with the dist-tag its version calls for.
// A prerelease must never become `latest`, which is what `npm install` picks by default:
// 0.2.0 goes to `latest`, 0.2.0-beta.1 to `beta`, 0.2.0-rc.1 to `rc`.
// Extra arguments go to `pnpm publish`: `node scripts/publish-packages.mjs --dry-run`.
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

export function distTag(version) {
  const prerelease = /^\d+\.\d+\.\d+-(.+)$/.exec(version)?.[1]
  if (prerelease === undefined) return "latest"
  return /^[a-z]+/i.exec(prerelease)?.[0].toLowerCase() ?? "next"
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = readdirSync(join(root, "packages"))
    .map((name) => join(root, "packages", name, "package.json"))
    .filter(existsSync)
    .map((path) => JSON.parse(readFileSync(path, "utf8")).version)

  if (new Set(versions).size !== 1) {
    console.error(`Packages are at different versions (${versions.join(", ")}). Run pnpm version:set.`)
    process.exit(1)
  }

  const extra = process.argv.slice(2)
  if (extra.some((arg) => arg === "--tag" || arg.startsWith("--tag="))) {
    console.error("The dist-tag comes from the version; don't pass --tag.")
    process.exit(1)
  }

  const tag = distTag(versions[0])
  console.log(`Publishing ${versions[0]} with dist-tag "${tag}"`)
  execFileSync("pnpm", ["-r", "--filter", "./packages/*", "publish", "--tag", tag, ...extra], {
    cwd: root,
    stdio: "inherit",
  })
}
