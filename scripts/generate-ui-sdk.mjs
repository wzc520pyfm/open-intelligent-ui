// Reads the docs that ship inside @ui-sdk/react and writes these files:
//
//   packages/react/src/registry/ui-sdk.generated.ts
//   packages/vue/src/registry/ui-sdk.generated.ts
//   packages/solid/src/registry/ui-sdk.generated.ts
//   packages/svelte/src/registry/ui-sdk.generated.ts
//     which entry point each UI SDK component is loaded from, per framework
//   packages/vue/src/primitives/icons.generated.ts
//     which file of @lucide/vue each icon name is loaded from
//   packages/solid/src/primitives/icons.generated.ts
//   packages/svelte/src/primitives/icons.generated.ts
//     which file of lucide each icon is loaded from, and its other names
//   packages/web/src/registry/ui-sdk.generated.ts
//     the custom element of @ui-sdk/web each component name stands for
//   packages/web/src/primitives/icons.generated.ts
//     which file of lucide each icon name is loaded from
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
import { createRequire, registerHooks } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(join(root, "packages/react/package.json"))
const packageJsonPath = require.resolve("@ui-sdk/react/package.json")
const packageDir = dirname(packageJsonPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
const docsDir = join(packageDir, "docs/components")

const SKIPPED_PROPS = new Set(["controller", "debug", "api"])

// @ui-sdk/web keeps what each custom element binds and declares inside the
// call that defines it, and @ui-sdk/react keeps the element each part draws
// the same way. Both are noted as their modules load.
const webElements = new Map()
const reactTags = new Map()
const taps = [
  {
    file: /@ui-sdk\/web\/dist\/define-element\.js$/,
    find: "function defineElement(primitive, element) {",
    add: "globalThis.__iuiWebElement?.(primitive, element);",
  },
  {
    file: /@ui-sdk\/react\/dist\/use-primitive\.js$/,
    find: "function createParts(primitive, tags) {",
    add: "globalThis.__iuiReactParts?.(primitive, tags);",
  },
]
const tapped = new Set()
globalThis.__iuiWebElement = (primitive, element) => {
  if (!webElements.has(element.tagName)) webElements.set(element.tagName, { primitive, ...element })
}
globalThis.__iuiReactParts = (primitive, tags) => {
  for (const [slot, tag] of Object.entries(tags)) {
    if (typeof tag === "string") reactTags.set(`${primitive.name}:${slot}`, tag)
  }
}
registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    const tap = taps.find((item) => item.file.test(url))
    if (!tap) return result
    const source = String(result.source)
    if (!source.includes(tap.find)) {
      throw new Error(`${url} no longer reads as expected; update the generator`)
    }
    tapped.add(tap)
    return { ...result, source: source.replace(tap.find, `${tap.find}\n  ${tap.add}`) }
  },
})

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
function registrySource(packageName, typeImport, componentType, extra = "") {
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
${extra}`
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
/// <reference path="./lucide.d.ts" />

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

// The Svelte package ships components as `.svelte` files Node can't import,
// so what each entry point offers is read from its export statements.
const svelteRequire = createRequire(join(root, "packages/svelte/package.json"))
const sveltePackagePath = svelteRequire.resolve("@ui-sdk/svelte/package.json")
const sveltePackage = JSON.parse(readFileSync(sveltePackagePath, "utf8"))
const svelteDir = dirname(sveltePackagePath)
if (sveltePackage.version !== packageJson.version) {
  throw new Error(
    `@ui-sdk/svelte is ${sveltePackage.version} but @ui-sdk/react is ${packageJson.version}; upgrade them together`
  )
}
const missingInSvelte = []
for (const slug of entries) {
  const target = sveltePackage.exports[`./${slug}`]?.svelte
  const offered = new Set(
    target
      ? [...readFileSync(join(svelteDir, target), "utf8").matchAll(/export \{([^}]*)\}/g)].flatMap(
          (match) => match[1].split(",").map((name) => name.trim().split(/\s+as\s+/).pop())
        )
      : []
  )
  for (const [name, from] of Object.entries(components)) {
    if (from === slug && !offered.has(name)) missingInSvelte.push(`${name} (@ui-sdk/svelte/${slug})`)
  }
}
if (missingInSvelte.length) {
  throw new Error(
    `@ui-sdk/svelte lacks components the catalog promises: ${missingInSvelte.join(", ")}`
  )
}

// A Svelte component says nothing at runtime about the props it takes, and
// what it doesn't take lands on its element. The docs name them.
const svelteDocs = join(svelteDir, "docs/components")
const svelteProps = new Set()
for (const file of readdirSync(svelteDocs)) {
  if (!file.endsWith(".md")) continue
  const api = section(readFileSync(join(svelteDocs, file), "utf8"), "API Reference")
  for (const part of api.split(/^### /m).slice(1)) {
    const title = part.slice(0, part.indexOf("\n")).trim()
    if (!/^[A-Z][A-Za-z0-9]*$/.test(title) || !Object.hasOwn(components, title)) continue
    for (const match of part.matchAll(/^- `([A-Za-z][A-Za-z0-9]*)\??` \(`.+?`\): /gm)) {
      svelteProps.add(match[1])
    }
  }
}
if (svelteProps.size < 100) throw new Error("@ui-sdk/svelte's docs no longer read as expected")

writeFileSync(
  join(root, "packages/svelte/src/registry/ui-sdk.generated.ts"),
  registrySource(
    "@ui-sdk/svelte",
    'import type { Component } from "svelte"',
    "Component<Record<string, unknown>>",
    `
/** Every prop a UI SDK component documents. What isn't one lands on the component's element. */
export const UI_SDK_PROPS: ReadonlySet<string> = new Set([
${[...svelteProps]
  .sort()
  .map((name) => `  ${JSON.stringify(name)},`)
  .join("\n")}
])
`
  )
)

// Svelte's icon package keeps each drawing inside a component. The plain
// `lucide` package has the same drawings as data, one file per icon, under
// the names lucide-react uses; the other names an icon answers to are read
// from lucide-react, which puts them in the class of the element it draws.
const svelteLucideDir = dirname(svelteRequire.resolve("lucide/package.json"))
const lucidePlainVersion = JSON.parse(readFileSync(join(svelteLucideDir, "package.json"), "utf8")).version
if (lucideVersion !== lucidePlainVersion) {
  throw new Error(
    `lucide is ${lucidePlainVersion} but lucide-react is ${lucideVersion}; icon names are only the same at the same version`
  )
}
const iconFiles = [...new Set(icons.map(([, file]) => file))].sort()
const svelteIconAliases = {}
for (const file of iconFiles) {
  if (!existsSync(join(svelteLucideDir, "dist/esm/icons", `${file}.mjs`))) {
    throw new Error(`lucide has no icon file ${file}.mjs`)
  }
  const source = readFileSync(join(lucideReactDir, "dist/esm/icons", `${file}.mjs`), "utf8")
  const name = /^\s*name: "([a-z0-9-]+)",?$/m.exec(source)?.[1]
  if (name !== file) throw new Error(`lucide-react's ${file}.mjs no longer reads as expected`)
  const aliases = /^\s*aliases: \[([^\]]*)\]/m.exec(source)?.[1]
  if (aliases !== undefined) {
    svelteIconAliases[file] = [...aliases.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1])
  }
}
for (const [name, file] of icons) {
  if (name !== file && !svelteIconAliases[file]?.includes(name)) {
    throw new Error(`lucide-react loads ${name} from ${file}.mjs without naming it an alias`)
  }
}
writeFileSync(
  join(root, "packages/svelte/src/primitives/icons.generated.ts"),
  `// Generated by scripts/generate-ui-sdk.mjs from lucide-react ${lucideVersion} and lucide ${lucidePlainVersion}.
// Do not edit by hand; run \`pnpm generate\`.

/** The shapes of one icon: each an SVG element name and its attributes. */
export type IconNode = [string, Record<string, string | number>][]

/** Loads one icon's shapes, by the name of its file. */
export const ICON_LOADERS: Record<string, () => Promise<{ default: IconNode }>> = {
${iconFiles.map((file) => `  ${JSON.stringify(file)}: () => import("lucide/dist/esm/icons/${file}.mjs"),`).join("\n")}
}

/** The other names lucide-react accepts for an icon. They are part of the class of what it draws. */
export const ICON_ALIASES: Record<string, string[]> = {
${Object.entries(svelteIconAliases)
  .map(([file, aliases]) => `  ${JSON.stringify(file)}: ${JSON.stringify(aliases)},`)
  .join("\n")}
}
`
)

// The web package has no components to import: each name stands for a custom
// element, and what differs from React (the native element a part wraps, which
// props are the element's own, which callbacks are its events) is read from
// how @ui-sdk/web defines that element.
const webRequire = createRequire(join(root, "packages/web/package.json"))
const webDir = dirname(webRequire.resolve("@ui-sdk/web/package.json"))
const webPackage = JSON.parse(readFileSync(join(webDir, "package.json"), "utf8"))
if (webPackage.version !== packageJson.version) {
  throw new Error(
    `@ui-sdk/web is ${webPackage.version} but @ui-sdk/react is ${packageJson.version}; upgrade them together`
  )
}
for (const slug of entries) {
  await import(pathToFileURL(webRequire.resolve(`@ui-sdk/web/${slug}`)).href)
}
if (tapped.size !== taps.length || webElements.size < 300) {
  throw new Error("@ui-sdk/web's element definitions were not seen; update the generator")
}
const { schemaOf } = await import(
  pathToFileURL(webRequire.resolve("@ui-sdk/core/renderer")).href
)

/** Which entry point defines each custom element, from the package's own manifest. */
const definedBy = new Map()
const manifest = JSON.parse(readFileSync(join(webDir, "custom-elements.json"), "utf8"))
for (const module of manifest.modules) {
  const slug = /entries\/(.+)\.js$/.exec(module.path)?.[1]
  if (!slug) continue
  definedBy.set(
    slug,
    new Set(
      (module.exports ?? [])
        .filter((item) => item.kind === "custom-element-definition")
        .map((item) => item.name)
    )
  )
}

const elementTag = (name) =>
  `ui-${name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()}`

/** The selectors a part looks for its own element with, read by letting it look. */
function soughtBy(find) {
  const selectors = []
  const found = {}
  const probe = {
    querySelector(selector) {
      selectors.push(selector)
      return found
    },
    hasAttribute: () => false,
    firstElementChild: found,
  }
  try {
    find(probe)
  } catch {
    return []
  }
  return selectors
}

/** The native elements a selector names, in the order it prefers them. */
function nativeTags(selectors) {
  if (selectors.some((selector) => selector.includes(":not("))) return []
  return selectors
    .flatMap((selector) => selector.split(","))
    .map((part) => /(?:^|[\s>(])([a-z][a-z0-9]*)(?:\[[^\]]*\])?\)?$/.exec(part.trim())?.[1])
    .filter((tag) => tag && !tag.includes("-"))
}

const kindOf = (spec) => (spec && typeof spec === "object" ? spec.kind : spec)
const callbacks = (props) =>
  Object.entries(props ?? {})
    .filter(([name, spec]) => /^on[A-Z]/.test(name) && ["callback", "action"].includes(kindOf(spec)))
    .map(([name]) => name)

// Assigning one of these would let markup rewrite the page.
const REWRITES = new Set(["innerHTML", "outerHTML", "textContent", "innerText", "outerText"])

const webParts = {}
const withoutElement = []
for (const [name, slug] of Object.entries(components)) {
  const tag = elementTag(name)
  const element = webElements.get(tag)
  if (!element) {
    withoutElement.push(name)
    continue
  }
  if (!definedBy.get(slug)?.has(tag)) {
    throw new Error(`@ui-sdk/web/${slug} does not define <${tag}>, which ${name} needs`)
  }
  const { config, kind, primitive } = element
  const schema = schemaOf(primitive)
  const root = kind === "owner"
  const slot = root ? "root" : config.slot
  const options = root
    ? [...Object.keys(config.attributes ?? {}), ...(config.properties ?? [])]
    : [...Object.keys(config.props ?? {}), ...(config.properties ?? [])]
  const live = Object.keys(config.state ?? {})
  for (const option of [...options, ...live]) {
    if (REWRITES.has(option)) throw new Error(`<${tag}> declares ${option}, which rewrites the DOM`)
  }
  const events = root
    ? callbacks(schema.options)
    : callbacks(schema.slots[slot] ?? config.feature?.slots?.[slot]?.props)
  // A root that is no part itself binds the first child it can't do without: an
  // input's <input>, a field set's <fieldset>.
  const boundChild =
    root && config.children && !config.self
      ? (config.children.root ??
        Object.entries(config.children).find(
          ([key]) => !(config.optionalChildren ?? []).includes(key)
        )?.[1])
      : undefined
  const sought = config.target ? soughtBy(config.target) : boundChild ? soughtBy(boundChild) : []
  const natives = nativeTags(sought)
  const drawn = reactTags.get(`${primitive.name}:${element.key}`)
  const inner = natives.includes(drawn) ? drawn : natives[0]
  const part = { tag }
  if (root) part.root = true
  // A root that is no part of the component stands where React draws nothing.
  if (root && !config.self && !config.children) part.bare = true
  if (inner) part.inner = inner
  if (options.length) part.options = [...new Set(options)].join(" ")
  if (live.length) part.live = live.join(" ")
  if (events.length) part.events = events.join(" ")
  if (root && config.events && Object.keys(config.events).length) part.eventNames = config.events
  webParts[name] = part
}
if (Object.keys(webParts).length < 300) {
  throw new Error("Too few components found their custom element; update the generator")
}

writeFileSync(
  join(root, "packages/web/src/registry/ui-sdk.generated.ts"),
  `${header.replace("@ui-sdk/react", "@ui-sdk/web")}
/** UI SDK version these tables were generated from. */
export const UI_SDK_VERSION = ${JSON.stringify(packageJson.version)}

/** Loads one UI SDK entry point, which defines its custom elements. Each becomes its own chunk. */
export const UI_SDK_LOADERS: Record<string, () => Promise<unknown>> = {
${entries.map((slug) => `  ${JSON.stringify(slug)}: () => import("@ui-sdk/web/${slug}"),`).join("\n")}
}

/** Which entry point each component comes from. */
export const UI_SDK_COMPONENTS: Record<string, string> = {
${Object.entries(components)
  .map(([name, slug]) => `  ${name}: ${JSON.stringify(slug)},`)
  .join("\n")}
}

/** How a component name is drawn with @ui-sdk/web. Lists are separated by spaces. */
export interface UiSdkElement {
  /** The custom element that stands for the component. */
  tag: string
  /** Whether the element holds the component's state, rather than being one of its parts. */
  root?: true
  /** Whether React draws no element for it: the component only holds state for its parts. */
  bare?: true
  /** The native element the part binds, which is written inside it. */
  inner?: string
  /** Props the element declares as its own properties. Anything else belongs to the bound element. */
  options?: string
  /** State the element keeps live, like \`value\` or \`open\`. */
  live?: string
  /** Callbacks the element reports as DOM events: \`onValueChange\` is \`valuechange\`. */
  events?: string
  /** Events named otherwise than by their callback. */
  eventNames?: Record<string, string>
}

export const UI_SDK_ELEMENTS: Record<string, UiSdkElement> = {
${Object.entries(webParts)
  .map(([name, part]) => `  ${name}: ${JSON.stringify(part)},`)
  .join("\n")}
}

/** Components @ui-sdk/web has no custom element for. The renderer draws these itself. */
export const UI_SDK_WITHOUT_ELEMENT: string[] = ${JSON.stringify(withoutElement)}
`
)

// lucide ships each icon's drawing without its names, so the names and
// aliases lucide-react gives an icon are written next to where it loads from.
const webLucideDir = dirname(webRequire.resolve("lucide/package.json"))
const lucideWebVersion = JSON.parse(readFileSync(join(webLucideDir, "package.json"), "utf8")).version
if (lucideVersion !== lucideWebVersion) {
  throw new Error(
    `lucide is ${lucideWebVersion} but lucide-react is ${lucideVersion}; icon names are only the same at the same version`
  )
}
const iconNames = {}
for (const [, file] of icons) {
  if (iconNames[file]) continue
  if (!existsSync(join(webLucideDir, "dist/esm/icons", `${file}.mjs`))) {
    throw new Error(`lucide has no icon file ${file}.mjs`)
  }
  const source = readFileSync(join(lucideReactDir, "dist/esm/icons", `${file}.mjs`), "utf8")
  const data = /const __iconData = \{\s*name: "([a-z0-9-]+)"/.exec(source)
  if (!data) throw new Error(`lucide-react's ${file}.mjs no longer reads as expected`)
  const aliases = /\n {2}aliases: \[([^\]]*)\]/.exec(source)?.[1] ?? ""
  iconNames[file] = [data[1], ...[...aliases.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1])]
}
writeFileSync(
  join(root, "packages/web/src/primitives/icons.generated.ts"),
  `// Generated by scripts/generate-ui-sdk.mjs from lucide-react ${lucideVersion} and lucide ${lucideWebVersion}.
// Do not edit by hand; run \`pnpm generate\`.
/// <reference path="./lucide.d.ts" />

/** What an icon is made of: the elements inside its \`<svg>\`. */
export type IconNode = [string, Record<string, string | number>][]

/** Loads one icon's drawing. Names and aliases are the ones lucide-react accepts. */
export const ICON_LOADERS: Record<string, () => Promise<{ default: IconNode }>> = {
${icons.map(([name, file]) => `  ${JSON.stringify(name)}: () => import("lucide/dist/esm/icons/${file}.mjs"),`).join("\n")}
}

/** The names lucide-react puts in an icon's class when they aren't just the name asked for. */
export const ICON_NAMES: Record<string, string[]> = {
${icons
  .filter(([name, file]) => iconNames[file].length > 1 || iconNames[file][0] !== name)
  .map(([name, file]) => `  ${JSON.stringify(name)}: ${JSON.stringify(iconNames[file])},`)
  .join("\n")}
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
  `UI SDK ${packageJson.version}: ${entries.length} entry points, ${Object.keys(components).length} components (${withoutElement.length} without a custom element), ${icons.length} icons`
)
