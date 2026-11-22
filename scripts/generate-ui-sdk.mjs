// Reads the docs that ship inside @ui-sdk/react and writes two files:
//
//   packages/react/src/registry/ui-sdk.generated.ts
//     which entry point each UI SDK component is loaded from
//   packages/core/src/prompt/ui-sdk-catalog.generated.ts
//     what a model needs to know to use each component
//
//   packages/react/src/styles/ui-sdk.generated.css
//     UI SDK's base stylesheet, confined to `.iui-root` so it can't restyle
//     the page around a generated surface
//   packages/core/src/design/default.generated.ts
//     design/default.DESIGN.md as a string, so it ships with the library
//
// Run it after upgrading UI SDK or editing the default design: `pnpm generate`.

import { readdirSync, readFileSync, writeFileSync } from "node:fs"
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

writeFileSync(
  join(root, "packages/react/src/registry/ui-sdk.generated.ts"),
  `${header}
import type { ComponentType } from "react"

type Module = Record<string, unknown>

/** UI SDK version these tables were generated from. */
export const UI_SDK_VERSION = ${JSON.stringify(packageJson.version)}

/** Loads one UI SDK entry point. Each becomes its own chunk. */
export const UI_SDK_LOADERS: Record<string, () => Promise<Module>> = {
${entries.map((slug) => `  ${JSON.stringify(slug)}: () => import("@ui-sdk/react/${slug}"),`).join("\n")}
}

/** Which entry point each component comes from. */
export const UI_SDK_COMPONENTS: Record<string, string> = {
${Object.entries(components)
  .map(([name, slug]) => `  ${name}: ${JSON.stringify(slug)},`)
  .join("\n")}
}

export type UiSdkComponent = ComponentType<Record<string, unknown>>
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
  join(root, "packages/react/src/styles/ui-sdk.generated.css"),
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
  `UI SDK ${packageJson.version}: ${entries.length} entry points, ${Object.keys(components).length} components`
)
