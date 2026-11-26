#!/usr/bin/env node
// Scaffolds a Vite + React app wired to Open Intelligent UI.
//
//   npm create open-intelligent-ui@latest my-app
//   node bin/create.mjs my-app --template react-vite

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const templates = join(root, "templates")

const args = process.argv.slice(2).filter((arg) => arg !== "--")
let dir = ""
let template = "react-vite"
let pkgName = ""

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === "--template" || arg === "-t") {
    template = args[++i] ?? template
    continue
  }
  if (arg === "--name") {
    pkgName = args[++i] ?? ""
    continue
  }
  if (arg === "--help" || arg === "-h") {
    printHelp()
    process.exit(0)
  }
  if (arg.startsWith("-")) {
    fail(`Unknown option ${arg}`)
  }
  if (!dir) dir = arg
  else fail(`Unexpected argument ${arg}`)
}

if (!dir) dir = "open-intelligent-ui-app"
const target = resolve(process.cwd(), dir)
const source = join(templates, template)

if (!existsSync(source) || !statSync(source).isDirectory()) {
  fail(`Unknown template "${template}". Available: ${listTemplates().join(", ")}`)
}
if (existsSync(target) && readdirSync(target).length > 0) {
  fail(`Refusing to write into a non-empty directory: ${target}`)
}

const name = pkgName || slug(dir === "." ? "open-intelligent-ui-app" : dir)
mkdirSync(target, { recursive: true })
copyTree(source, target, {
  "__PACKAGE_NAME__": name,
})
// npm pack omits nested .gitignore files; write one for the app.
writeFileSync(
  join(target, ".gitignore"),
  ["node_modules", "dist", ".env", ".DS_Store", "*.local", ""].join("\n")
)

console.log(`Created ${target}`)
console.log("")
console.log("Next:")
console.log(`  cd ${dir === "." ? "." : dir}`)
console.log("  npm install")
console.log("  npm run dev")
console.log("")
console.log("Demo reply needs no API key. For Live, copy .env.example to .env.")

function printHelp() {
  console.log(`Usage: create-open-intelligent-ui [dir] [options]

Options:
  --template, -t   Template name (default: react-vite)
  --name           package.json "name" (default: from dir)
  --help, -h       Show this help

Templates: ${listTemplates().join(", ")}`)
}

function listTemplates() {
  return readdirSync(templates).filter((name) => statSync(join(templates, name)).isDirectory())
}

function slug(value) {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "open-intelligent-ui-app"
}

function copyTree(from, to, vars) {
  mkdirSync(to, { recursive: true })
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name)
    const dest = join(to, entry.name)
    if (entry.isDirectory()) {
      copyTree(src, dest, vars)
      continue
    }
    let text = readFileSync(src, "utf8")
    for (const [key, value] of Object.entries(vars)) {
      text = text.split(key).join(value)
    }
    writeFileSync(dest, text)
  }
}

function fail(message) {
  console.error(message)
  process.exit(1)
}
