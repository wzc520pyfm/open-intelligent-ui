// Packs every publishable package the way `pnpm publish` would and checks the tarball a user
// would install: its files, its exports, and that everything the built code imports is declared.
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseSync } from "vite"

const root = fileURLToPath(new URL("..", import.meta.url))
const packages = readdirSync(join(root, "packages")).filter((name) =>
  existsSync(join(root, "packages", name, "package.json"))
)
const work = mkdtempSync(join(tmpdir(), "iui-pack-"))
const problems = []

function packageOf(specifier) {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

/** Module specifiers a file really imports. Parsed, because the prompt's text holds code samples. */
function importsOf(file, text) {
  // A Svelte package ships its components as written. What they import is in their scripts.
  if (file.endsWith(".svelte")) {
    const scripts = [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])
    return new Set(scripts.flatMap((script) => [...importsOf(`${file}.ts`, script)]))
  }
  const { module, errors } = parseSync(file, text)
  if (errors.length > 0) throw new Error(`${file} does not parse: ${errors[0].message}`)
  return new Set([
    ...module.staticImports.map((entry) => entry.moduleRequest.value),
    ...module.staticExports.flatMap((entry) => entry.entries.map((item) => item.moduleRequest?.value)),
    ...module.dynamicImports.map((entry) => {
      const request = text.slice(entry.moduleRequest.start, entry.moduleRequest.end)
      return /^"[^"]*"$/.test(request) ? request.slice(1, -1) : undefined
    }),
  ].filter(Boolean))
}

function exportTargets(value) {
  if (typeof value === "string") return [value]
  return Object.values(value ?? {}).flatMap(exportTargets)
}

for (const name of packages) {
  const dir = join(root, "packages", name)
  const out = join(work, name)
  execFileSync("pnpm", ["pack", "--pack-destination", out], { cwd: dir, stdio: "pipe" })
  const tarball = join(out, readdirSync(out).find((file) => file.endsWith(".tgz")))
  execFileSync("tar", ["-xzf", tarball, "-C", out])
  const unpacked = join(out, "package")
  const manifest = JSON.parse(readFileSync(join(unpacked, "package.json"), "utf8"))
  const fail = (message) => problems.push(`${manifest.name}: ${message}`)

  for (const file of ["README.md", "LICENSE", "NOTICE"]) {
    if (!existsSync(join(unpacked, file))) fail(`${file} is missing from the tarball`)
  }
  if (JSON.stringify(manifest).includes("workspace:")) fail("a workspace: version was not rewritten")

  // Scaffold CLIs ship templates and a bin, not a library dist/.
  if (manifest.bin) {
    for (const entry of Object.values(manifest.bin)) {
      if (!existsSync(join(unpacked, entry))) fail(`bin ${entry} is not in the tarball`)
    }
    if (!existsSync(join(unpacked, "templates"))) fail("templates/ is missing from the tarball")
    const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n")
    console.log(`${manifest.name}@${manifest.version}: ${files.length} files (scaffold)`)
    continue
  }

  if (existsSync(join(unpacked, "src"))) fail("src/ is in the tarball")

  const targets = exportTargets(manifest.exports)
  if (targets.length === 0) fail("no exports")
  for (const target of targets) {
    if (!target.startsWith("./dist/")) fail(`export ${target} does not point into dist/`)
    else if (!existsSync(join(unpacked, target))) fail(`export ${target} is not in the tarball`)
  }

  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ])
  const dist = join(unpacked, "dist")
  for (const file of readdirSync(dist, { recursive: true })) {
    if (!statSync(join(dist, file)).isFile()) continue
    const text = readFileSync(join(dist, file), "utf8")
    if (file.endsWith(".css")) {
      if (/@import\b/.test(text)) fail(`${file} still has an @import`)
      if (!text.includes("@layer ui-sdk, iui;")) fail(`${file} lost its layer order`)
      continue
    }
    for (const specifier of importsOf(file, text)) {
      if (specifier.startsWith(".")) {
        // A declaration file names its sibling by the JavaScript file's name.
        const target = file.endsWith(".d.ts") ? specifier.replace(/\.js$/, ".d.ts") : specifier
        if (!existsSync(join(dist, dirname(file), target))) fail(`${file} imports ${specifier}, which is not in the tarball`)
      } else if (!specifier.startsWith("node:") && !declared.has(packageOf(specifier))) {
        fail(`${file} imports ${specifier}, which is not a dependency`)
      }
    }
  }

  if (name === "react" && !readFileSync(join(dist, "index.js"), "utf8").startsWith('"use client"')) {
    fail('dist/index.js does not start with "use client"')
  }

  const files = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" }).trim().split("\n")
  console.log(`${manifest.name}@${manifest.version}: ${files.length} files`)
}

rmSync(work, { recursive: true, force: true })

if (problems.length > 0) {
  console.error(problems.map((problem) => `  ${problem}`).join("\n"))
  process.exit(1)
}
console.log("Packages are ready to publish.")
