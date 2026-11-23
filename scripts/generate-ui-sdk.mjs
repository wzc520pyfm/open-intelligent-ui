// Reads the docs that ship inside @ui-sdk/react and writes these files:
//
//   packages/react/src/registry/ui-sdk.generated.ts
//   packages/vue/src/registry/ui-sdk.generated.ts
//   packages/solid/src/registry/ui-sdk.generated.ts
//     which entry point each UI SDK component is loaded from, per framework
//   packages/vue/src/primitives/icons.generated.ts
//     which file of @lucide/vue each icon name is loaded from
//   packages/solid/src/primitives/icons.generated.ts
//     which file of lucide each icon name is loaded from, and its other names
//   packages/core/src/prompt/ui-sdk-catalog.generated.ts
//     what a model needs to know to use each component
//
//   packages/core/styles/ui-sdk.generated.css
//     UI SDK's base stylesheet, confined to `.iui-root` so it can't restyle
//     the page around a generated surface
//   packages/core/src/design/default.generated.ts
//     design/default.DESIGN.md as a string, so it ships with the library
//
// Run it after upgrading UI SDK or editing the default design: `pnpm generate`.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(join(root, "packages/react/package.json"))
const packageJsonPath = require.resolve("@ui-sdk/react/package.json")
const packageDir = dirname(packageJsonPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const docsDir = join(packageDir, "docs/components")

const SKIPPED_PROPS = new Set(["controller", "debug", "api"])

function firstSentence(text) {
  const clean = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim()
  const match = /^(.*?[.!?])(?:\s|$)/.exec(clean)
  const sentence = match ? match[1] : clean
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence
}

function shortType(type) {
  const clean = type.replace(/\s+/g, " ").trim()
  if (clean.length <= 70) return clean
  if (clean.startsWith("((") || clean.startsWith("(")) {
    const args = /^\(*\(([^)]*)\)\s*=>/.exec(clean)
    if (args) {
      const names = args[1]
        .split(",")
        .map((part) => part.split(":")[0].trim())
        .filter(Boolean)
      return `(${names.join(", ")}) => void`
    }
  }
  return `${clean.slice(0, 67)}...`
}

function section(markdown, heading) {
  const start = markdown.search(new RegExp(`^## ${heading}\\s*$`, "m"))
  if (start === -1) return ""
  const rest = markdown.slice(start).replace(/^## .*\n/, "")
  const end = rest.search(/^## /m)
  return end === -1 ? rest : rest.slice(0, end)
}

function parseDoc(markdown) {
  const name = /^# (.+)$/m.exec(markdown)?.[1].trim() ?? ""
  const afterTitle = markdown.slice(markdown.indexOf("\n") + 1)
  const description =
    afterTitle
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("<") && !line.startsWith("#"))
      ?.replace(/^"(.*)"$/, "$1") ?? ""

  const compositionText = section(markdown, "Composition")
  const composition = /```text\n([\s\S]*?)```/.exec(compositionText)?.[1].trimEnd() ?? ""

  const usage = /```tsx[^\n]*\n([\s\S]*?)```/.exec(section(markdown, "Usage"))?.[1] ?? ""
  const returned = /return \(\n([\s\S]*?)\n {2}\)\n/.exec(usage)?.[1]
  const example = returned
    ? returned
        .split("\n")
        .map((line) => line.replace(/^ {4}/, ""))
        .join("\n")
    : usage
        .split("\n")
        .filter((line) => !/^(import |"use client"|export )/.test(line))
        .join("\n")
        .trim()
        .replace(/^;/, "")

  const props = {}
  const api = section(markdown, "API Reference")
  for (const part of api.split(/^### /m).slice(1)) {
    const title = part.slice(0, part.indexOf("\n")).trim()
    if (!/^[A-Z][A-Za-z0-9]*$/.test(title)) continue
    if (["State", "Reasons", "Controller", "Events", "Types"].includes(title)) continue
    const list = []
    for (const match of part.matchAll(/^- `([^`]+)` \(`(.+?)`\): (.*)$/gm)) {
      const raw = match[1]
      const propName = raw.replace(/\?$/, "")
      if (SKIPPED_PROPS.has(propName)) continue
      const item = {
        name: propName,
        type: shortType(match[2]),
        description: firstSentence(match[3]),
      }
      if (!raw.endsWith("?")) item.required = true
      list.push(item)
    }
    if (list.length) props[title] = list
  }

  const attributes = {}
  const data = section(markdown, "Data Attributes")
  for (const part of data.split(/^### /m).slice(1)) {
    const title = part.slice(0, part.indexOf("\n")).trim()
    const names = [...part.matchAll(/^- `(data-[a-z-]+)(?:=[^`]*)?`/gm)].map(
      (match) => match[1]
    )
    const unique = [...new Set(names)].filter(
      (attribute) => attribute !== "data-slot"
    )
    if (unique.length) attributes[title] = unique
  }

  return { name, description, composition, example, props, attributes }
}

function slotName(part) {
  return part.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

const catalog = []
const components = {}
const entries = []

for (const file of readdirSync(docsDir).sort()) {
  if (!file.endsWith(".md")) continue
  const slug = file.slice(0, -3)
  if (!packageJson.exports[`./${slug}`]) continue
  const module = await import(
    pathToFileURL(require.resolve(`@ui-sdk/react/${slug}`)).href
  )
  const parts = Object.keys(module)
    .filter((key) => /^[A-Z]/.test(key))
    .filter((key) => {
      const value = module[key]
      return typeof value === "function" || (value && typeof value === "object")
    })
    .sort()
  if (parts.length === 0) continue
  const doc = parseDoc(readFileSync(join(docsDir, file), "utf8"))
  entries.push(slug)
  for (const part of parts) components[part] = slug
  catalog.push({ slug, ...doc, parts, slots: parts.map(slotName) })
}

const header = `// Generated by scripts/generate-ui-sdk.mjs from @ui-sdk/react ${packageJson.version}.
// Do not edit by hand; run \`pnpm generate\`.
`

/** The table a renderer loads UI SDK from: the same names, from that framework's package. */
function registrySource(packageName, typeImport, componentType) {
  return `${header.replace("@ui-sdk/react", packageName)}
${typeImport}

type Module = Record<string, unknown>

/** UI SDK version these tables were generated from. */
export const UI_SDK_VERSION = ${JSON.stringify(packageJson.version)}

/** Loads one UI SDK entry point. Each becomes its own chunk. */
export const UI_SDK_LOADERS: Record<string, () => Promise<Module>> = {
${entries.map((slug) => `  ${JSON.stringify(slug)}: () => import("${packageName}/${slug}"),`).join("\n")}
}

/** Which entry point each component comes from. */
export const UI_SDK_COMPONENTS: Record<string, string> = {
${Object.entries(components)
  .map(([name, slug]) => `  ${name}: ${JSON.stringify(slug)},`)
  .join("\n")}
}

export type UiSdkComponent = ${componentType}
`
}

writeFileSync(
  join(root, "packages/react/src/registry/ui-sdk.generated.ts"),
  registrySource(
    "@ui-sdk/react",
    'import type { ComponentType } from "react"',
    "ComponentType<Record<string, unknown>>"
  )
)

// Markup is written against one catalog, so the Vue package has to offer
// every component under the same name from the same entry point.
const vueRequire = createRequire(join(root, "packages/vue/package.json"))
const vuePackage = JSON.parse(
  readFileSync(vueRequire.resolve("@ui-sdk/vue/package.json"), "utf8")
)
if (vuePackage.version !== packageJson.version) {
  throw new Error(
    `@ui-sdk/vue is ${vuePackage.version} but @ui-sdk/react is ${packageJson.version}; upgrade them together`
  )
}
const missing = []
for (const slug of entries) {
  const module = await import(pathToFileURL(vueRequire.resolve(`@ui-sdk/vue/${slug}`)).href)
  for (const [name, from] of Object.entries(components)) {
    if (from === slug && !module[name]) missing.push(`${name} (@ui-sdk/vue/${slug})`)
  }
}
if (missing.length) {
  throw new Error(`@ui-sdk/vue lacks components the catalog promises: ${missing.join(", ")}`)
}

writeFileSync(
  join(root, "packages/vue/src/registry/ui-sdk.generated.ts"),
  registrySource("@ui-sdk/vue", 'import type { Component } from "vue"', "Component")
)

// React draws icons with lucide-react, which ships a table of names. The Vue
// package has none, so the same names are pointed at @lucide/vue's files.
const lucideReactDir = dirname(require.resolve("lucide-react/package.json"))
const lucideVueDir = dirname(vueRequire.resolve("@lucide/vue/package.json"))
const lucideVersion = JSON.parse(readFileSync(join(lucideReactDir, "package.json"), "utf8")).version
const lucideVueVersion = JSON.parse(readFileSync(join(lucideVueDir, "package.json"), "utf8")).version
if (lucideVersion !== lucideVueVersion) {
  throw new Error(
    `@lucide/vue is ${lucideVueVersion} but lucide-react is ${lucideVersion}; icon names are only the same at the same version`
  )
}
const icons = [
  ...readFileSync(join(lucideReactDir, "dist/esm/dynamicIconImports.mjs"), "utf8").matchAll(
    /^\s*"([a-z0-9-]+)": \(\) => import\('\.\/icons\/([a-z0-9-]+)\.mjs'\)/gm
  ),
].map((match) => [match[1], match[2]])
if (icons.length < 1000) throw new Error("lucide-react's icon table no longer reads as expected")
for (const [, file] of icons) {
  if (!existsSync(join(lucideVueDir, "dist/esm/icons", `${file}.mjs`))) {
    throw new Error(`@lucide/vue has no icon file ${file}.mjs`)
  }
}
writeFileSync(
  join(root, "packages/vue/src/primitives/icons.generated.ts"),
  `// Generated by scripts/generate-ui-sdk.mjs from lucide-react ${lucideVersion} and @lucide/vue ${lucideVueVersion}.
// Do not edit by hand; run \`pnpm generate\`.

/** What Lucide says an icon is made of. */
export interface IconData {
  name: string
  size?: number
  aliases?: string[]
  node: [string, Record<string, string | number>][]
}

/** Loads one icon's drawing. Names and aliases are the ones lucide-react accepts. */
export const ICON_LOADERS: Record<string, () => Promise<{ __iconData: IconData }>> = {
${icons.map(([name, file]) => `  ${JSON.stringify(name)}: () => import("@lucide/vue/dist/esm/icons/${file}.mjs"),`).join("\n")}
}
`
)

// The same catalog again for Solid, from @ui-sdk/solid.
const solidRequire = createRequire(join(root, "packages/solid/package.json"))
const solidPackage = JSON.parse(
  readFileSync(solidRequire.resolve("@ui-sdk/solid/package.json"), "utf8")
)
if (solidPackage.version !== packageJson.version) {
  throw new Error(
    `@ui-sdk/solid is ${solidPackage.version} but @ui-sdk/react is ${packageJson.version}; upgrade them together`
  )
}
// Its entry points draw at import time, which Node can't do, so what each
// one exports is read from its source instead.
const solidDir = dirname(solidRequire.resolve("@ui-sdk/solid/package.json"))
const missingFromSolid = []
for (const slug of entries) {
  const target = solidPackage.exports[`./${slug}`]?.default
  const source = target ? readFileSync(join(solidDir, target), "utf8") : ""
  if (/^export \*/m.test(source)) {
    throw new Error(`@ui-sdk/solid/${slug} no longer lists what it exports`)
  }
  const exported = new Set(
    [...source.matchAll(/^export\s*\{([^}]*)\}/gm)].flatMap((match) =>
      match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop())
    )
  )
  for (const [name, from] of Object.entries(components)) {
    if (from === slug && !exported.has(name)) {
      missingFromSolid.push(`${name} (@ui-sdk/solid/${slug})`)
    }
  }
}
if (missingFromSolid.length) {
  throw new Error(
    `@ui-sdk/solid lacks components the catalog promises: ${missingFromSolid.join(", ")}`
  )
}

writeFileSync(
  join(root, "packages/solid/src/registry/ui-sdk.generated.ts"),
  registrySource(
    "@ui-sdk/solid",
    'import type { Component } from "solid-js"',
    "Component<Record<string, unknown>>"
  )
)

// Lucide's package for Solid adds a class of its own and has no table of
// names, so Solid draws from lucide itself, which ships each icon as plain
// data. That data carries no names; lucide-react's files say what they are.
const lucideDir = dirname(solidRequire.resolve("lucide/package.json"))
const lucideDataVersion = JSON.parse(readFileSync(join(lucideDir, "package.json"), "utf8")).version
if (lucideVersion !== lucideDataVersion) {
  throw new Error(
    `lucide is ${lucideDataVersion} but lucide-react is ${lucideVersion}; icon names are only the same at the same version`
  )
}
const iconAliases = []
for (const file of new Set(icons.map(([, file]) => file))) {
  if (!existsSync(join(lucideDir, "dist/esm/icons", `${file}.mjs`))) {
    throw new Error(`lucide has no icon file ${file}.mjs`)
  }
  const source = readFileSync(join(lucideReactDir, "dist/esm/icons", `${file}.mjs`), "utf8")
  if (!source.includes(`name: ${JSON.stringify(file)}`) || !/\bsize: 24\b/.test(source)) {
    throw new Error(`lucide-react's ${file}.mjs no longer reads as expected`)
  }
  const aliases = /aliases: \[([^\]]*)\]/.exec(source)?.[1].match(/[a-z0-9-]+/g)
  if (aliases?.length) iconAliases.push([file, aliases])
}
writeFileSync(
  join(root, "packages/solid/src/primitives/icons.generated.ts"),
  `// Generated by scripts/generate-ui-sdk.mjs from lucide-react ${lucideVersion} and lucide ${lucideDataVersion}.
// Do not edit by hand; run \`pnpm generate\`.

/** The elements an icon is drawn with. */
export type IconNode = [string, Record<string, string | number>][]

/** Loads one icon's drawing. Names and aliases are the ones lucide-react accepts. */
export const ICON_LOADERS: Record<string, () => Promise<{ default: IconNode }>> = {
${icons.map(([name, file]) => `  ${JSON.stringify(name)}: () => import("lucide/dist/esm/icons/${file}.mjs"),`).join("\n")}
}

/** The icon an alias stands for. */
export const ICON_NAMES: Record<string, string> = {
${icons
  .filter(([name, file]) => name !== file)
  .map(([name, file]) => `  ${JSON.stringify(name)}: ${JSON.stringify(file)},`)
  .join("\n")}
}

/** The other names of an icon, which lucide-react puts in its class. */
export const ICON_ALIASES: Record<string, string[]> = {
${iconAliases.map(([file, aliases]) => `  ${JSON.stringify(file)}: ${JSON.stringify(aliases)},`).join("\n")}
}
`
)

writeFileSync(
  join(root, "packages/core/src/prompt/ui-sdk-catalog.generated.ts"),
  `${header}
export interface CatalogProp {
  name: string
  type: string
  description: string
  required?: boolean
}

export interface CatalogEntry {
  /** Entry point: \`@ui-sdk/react/<slug>\`. */
  slug: string
  name: string
  description: string
  /** How the parts nest, as a tree. */
  composition: string
  /** A small example, as JSX. */
  example: string
  /** Component names exported by the entry point. */
  parts: string[]
  /** \`data-slot\` value of each part, in the same order as \`parts\`. */
  slots: string[]
  props: Record<string, CatalogProp[]>
  /** State attributes each part sets, for styling. */
  attributes: Record<string, string[]>
}

export const UI_SDK_VERSION = ${JSON.stringify(packageJson.version)}

export const UI_SDK_CATALOG: CatalogEntry[] = ${JSON.stringify(catalog, null, 2)}
`
)

const webCss = readFileSync(require.resolve("@ui-sdk/core/web.css"), "utf8")
const layerStart = webCss.indexOf("{")
const layerEnd = webCss.lastIndexOf("}")
if (!webCss.trimStart().startsWith("@layer ui-sdk") || layerEnd < 0) {
  throw new Error("web.css no longer starts with `@layer ui-sdk`; update the scoping step")
}
const tokenRoot = ":where(:root, :host)"
const layerBody = webCss.slice(layerStart + 1, layerEnd)
if (!layerBody.includes(tokenRoot)) {
  throw new Error(`web.css no longer declares its tokens on ${tokenRoot}`)
}
writeFileSync(
  join(root, "packages/core/styles/ui-sdk.generated.css"),
  `/* Generated by scripts/generate-ui-sdk.mjs from @ui-sdk/core ${packageJson.version} web.css. Do not edit by hand. */
@layer ui-sdk {
  .iui-root {
${layerBody
  .replace(tokenRoot, "&")
  .replace(/\s+$/, "")
  .split("\n")
  .map((line) => (line ? `  ${line}` : line))
  .join("\n")}
  }
}
`
)

const defaultDesign = readFileSync(join(root, "design/default.DESIGN.md"), "utf8")
writeFileSync(
  join(root, "packages/core/src/design/default.generated.ts"),
  `// Generated by scripts/generate-ui-sdk.mjs from design/default.DESIGN.md. Do not edit by hand.

/** The built-in design, used when a surface is given none. */
export const DEFAULT_DESIGN = ${JSON.stringify(defaultDesign)}
`
)

console.log(
  `UI SDK ${packageJson.version}: ${entries.length} entry points, ${Object.keys(components).length} components, ${icons.length} icons`
)
