// Lints every design in design/ with the published DESIGN.md CLI.
//
// The upstream spec has light and dark color schemes and a `motion` section, but the
// published CLI (0.4.0) predates both. Three of its warnings are therefore noise here
// and are left out: it can't find `primary` under `colors.light`, it can't see that
// scheme colors are used, and it doesn't know the `motion` key.
//
//   pnpm design:lint            lint design/*.DESIGN.md
//   pnpm design:lint a.md b.md  lint the named files

import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const packageDir = join(root, "node_modules/@google/design.md")
const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"))
const bin = typeof packageJson.bin === "string" ? packageJson.bin : Object.values(packageJson.bin)[0]
const cli = join(packageDir, bin)

function expected(finding) {
  const path = finding.path ?? ""
  if (finding.rule === "token-like-ignored") return path === "motion"
  if (finding.rule === "missing-primary") return true
  if (finding.rule === "orphaned-tokens") return /^colors\.(light|dark)\./.test(path)
  return false
}

function lint(file) {
  let output
  try {
    output = execFileSync(process.execPath, [cli, "lint", file], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    output = error.stdout
    if (!output) throw error
  }
  return JSON.parse(output).findings ?? []
}

const named = process.argv.slice(2)
const files = named.length
  ? named
  : readdirSync(join(root, "design"))
      .filter((name) => name.endsWith(".DESIGN.md"))
      .sort()
      .map((name) => join(root, "design", name))

if (files.length === 0) {
  console.error("No DESIGN.md files to lint.")
  process.exit(1)
}

const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
let errors = 0
let warnings = 0

for (const file of files) {
  const findings = lint(file)
  const kept = findings.filter((finding) => finding.severity !== "info" && !expected(finding))
  const summary = findings.find((finding) => finding.rule === "token-summary")
  const skipped = findings.filter(expected).length

  console.log(relative(root, file))
  if (summary) console.log(`  ${summary.message}`)
  for (const finding of kept) {
    console.log(`  ${finding.severity}  ${finding.path ?? ""}  ${finding.message}`)
    if (finding.severity === "error") errors += 1
    else warnings += 1
  }
  if (kept.length === 0) console.log("  No problems.")
  if (skipped) {
    console.log(`  (${count(skipped, "warning")} about light/dark colors and motion left out; see the top of this script.)`)
  }
}

console.log(`\n${count(files.length, "file")}, ${count(errors, "error")}, ${count(warnings, "warning")}`)
process.exit(errors ? 1 : 0)
