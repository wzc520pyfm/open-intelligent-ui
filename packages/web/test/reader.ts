import { UI_SDK_ELEMENTS } from "../src/registry/ui-sdk.generated"

const REFERENCES = [
  "id",
  "for",
  "form",
  "list",
  "aria-controls",
  "aria-labelledby",
  "aria-describedby",
  "aria-owns",
  "aria-activedescendant",
  "aria-details",
  "aria-errormessage",
  "data-iui-id",
  "popovertarget",
  "commandfor",
]

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)

/** What each custom element takes as an option, which is its own business and not the reader's. */
const OPTIONS = new Map<string, Set<string>>()
for (const spec of Object.values(UI_SDK_ELEMENTS)) {
  const names = OPTIONS.get(spec.tag) ?? new Set<string>()
  for (const name of (spec.options ?? "").split(" ").filter(Boolean)) {
    names.add(kebab(name))
    names.add(name.toLowerCase())
  }
  OPTIONS.set(spec.tag, names)
}

/**
 * Roots that exist only as custom elements: the React component of the same
 * name holds state and renders no element of its own.
 */
const CONTEXT_ONLY = new Set(["ui-select", "ui-combobox", "ui-token-input"])

/** The role an element has without being given one. */
function implicitRole(element: Element): string | null {
  const tag = element.localName
  if (/^h[1-6]$/.test(tag)) return "heading"
  switch (tag) {
    case "button":
      return "button"
    case "a":
      return element.hasAttribute("href") ? "link" : null
    case "nav":
      return "navigation"
    case "ul":
    case "ol":
      return "list"
    case "li":
      return "listitem"
    case "p":
      return "paragraph"
    case "table":
      return "table"
    case "thead":
    case "tbody":
      return "rowgroup"
    case "tr":
      return "row"
    case "th":
      return "columnheader"
    case "td":
      return "cell"
    case "fieldset":
      return "group"
    case "hr":
      return "separator"
    case "select":
      return "combobox"
    case "textarea":
      return "textbox"
    case "input": {
      const type = element.getAttribute("type") ?? "text"
      if (type === "checkbox" || type === "radio") return type
      if (type === "range") return "slider"
      if (type === "number") return "spinbutton"
      if (type === "search") return "searchbox"
      if (type === "button" || type === "submit" || type === "reset") return "button"
      return "textbox"
    }
    default:
      return null
  }
}

export interface ReaderOptions {
  /**
   * Leaves out, for UI SDK parts, what only says how the part is built:
   * see `describeForReader`.
   */
  parts?: boolean
}

/**
 * Describes a surface as its reader gets it, so that a surface drawn with
 * UI SDK's React components and one drawn with its custom elements can be
 * held against each other. Everything that is not a UI SDK part is described
 * exactly as `describe` in `packages/vue/test/dom.ts` does: tag, every
 * attribute, every text. For UI SDK parts (elements carrying `data-slot`,
 * and the custom elements around them) the two libraries build different
 * elements on purpose, so those are described by what they are to a reader:
 *
 * - the part's name (`data-slot`) stands in for the tag;
 * - its role, with the role a native tag implies written out, and a
 *   heading's level;
 * - every `aria-*` attribute, `disabled`, `tabindex`, `hidden`, `class`, `style`, the
 *   `data-*` attributes that carry state and what markup put there, and for
 *   native controls `type`, `name`, `placeholder`, `href`, `alt`, `src` and
 *   the live `value` and `checked`;
 * - its text.
 *
 * Left out, each because one library has it and the other has no use for it:
 *
 * - a custom element that only wraps the native element its part is bound
 *   to (`<ui-tabs-tab>` around its `<button>`), and a root React renders no
 *   element for (`<ui-select>`): its children take its place;
 * - the options a custom element takes as attributes (`value`,
 *   `default-value`, `page-count`), which React takes as props;
 * - content that is hidden: React leaves a closed panel out, the custom
 *   elements keep it in the page with `hidden`. `<template>`s likewise;
 * - the visually hidden native `<input>` React's form controls add for
 *   form submission, where the custom elements are form-associated instead;
 * - `type="button"` on a part that is not a native control, `scope` on a
 *   header cell, and the `<thead>` and `<tbody>` React groups a grid's rows
 *   with, where the custom elements use wrappers with `role="rowgroup"`.
 */
export function describeForReader(root: Element): string {
  const ids = new Map<string, string>()
  const rename = (id: string) => {
    if (!ids.has(id)) ids.set(id, `id${ids.size + 1}`)
    return ids.get(id) as string
  }
  const renameAll = (value: string) => value.split(/\s+/).filter(Boolean).map(rename).join(" ")

  const lines: string[] = []

  const isWrapper = (element: Element) =>
    element.localName.startsWith("ui-") &&
    (!element.hasAttribute("data-slot") || CONTEXT_ONLY.has(element.localName))

  const isFormShadow = (element: Element) =>
    (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) &&
    element.hasAttribute("data-slot") &&
    ((element as HTMLInputElement).type === "hidden" ||
      (element.getAttribute("aria-hidden") === "true" && element.getAttribute("tabindex") === "-1"))

  /** A grid's rows are grouped by `<thead>` and `<tbody>` in React and by wrapper elements here. */
  const isRowGroup = (element: Element) =>
    (element.localName === "thead" || element.localName === "tbody") &&
    element.parentElement?.hasAttribute("data-slot") === true

  const textOf = (ids: string) =>
    ids
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => (root.ownerDocument.getElementById(id)?.textContent ?? "").replace(/\s+/g, " ").trim())
      .join(" ")

  /** A label around a custom element names it by reference, since only native controls are labelled by nesting. */
  const namesByNesting = (label: Element) => {
    const id = label.getAttribute("id")
    if (!id || label.localName !== "label") return false
    return [...label.querySelectorAll("[aria-labelledby]")].some(
      (inside) => inside.localName.startsWith("ui-") && inside.getAttribute("aria-labelledby") === id
    )
  }

  const walk = (node: Node, depth: number) => {
    const pad = "  ".repeat(depth)
    if (!(node instanceof Element)) return
    if (node.tagName === "STYLE" || node.tagName === "TEMPLATE") return
    if (node.classList.contains("iui-toasts")) return
    const part = node.hasAttribute("data-slot")
    const custom = node.localName.startsWith("ui-")
    if ((part || custom) && node.hasAttribute("hidden")) return
    if (isFormShadow(node)) return
    if (isWrapper(node) || isRowGroup(node)) {
      children(node, depth, pad.slice(2))
      return
    }
    const attributes: string[] = []
    const options = custom ? OPTIONS.get(node.localName) : undefined
    const control =
      node instanceof HTMLInputElement ||
      node instanceof HTMLTextAreaElement ||
      node instanceof HTMLSelectElement
    let role = node.getAttribute("role")
    for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
      const { name } = attribute
      let { value } = attribute
      if ((node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && (name === "value" || name === "checked")) continue
      if (name === "id" && namesByNesting(node)) continue
      if (part || custom) {
        if (name === "role" || name === "data-slot" || name === "data-text") continue
        if (name === "for" || name === "scope" || name.startsWith("data-iui-file")) continue
        if (custom && name === "value") continue
        if (name === "aria-labelledby") {
          const label = node.closest("label")
          if (custom && label && label.getAttribute("id") === value) continue
          attributes.push(`name=${JSON.stringify(textOf(value))}`)
        }
        if (options?.has(name) && !name.startsWith("aria-") && name !== "disabled") continue
        if (name === "type" && !control) continue
      }
      if (name === "style") {
        value = value
          .split(";")
          .map((declaration) => declaration.trim())
          .filter(Boolean)
          .sort()
          .join("; ")
        if (!value) continue
      } else if (name === "class") {
        value = value.split(/\s+/).filter(Boolean).join(" ")
        if (!value) continue
      } else if (REFERENCES.includes(name)) {
        value = renameAll(value)
      } else if (name === "href" && value.startsWith("#")) {
        value = `#${rename(value.slice(1))}`
      }
      value = value.replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${rename(id)})`)
      attributes.push(`${name}=${JSON.stringify(value)}`)
    }
    if (node instanceof HTMLInputElement) {
      if (node.type === "checkbox" || node.type === "radio") attributes.push(`.checked=${node.checked}`)
      attributes.push(`.value=${JSON.stringify(node.value)}`)
    } else if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      attributes.push(`.value=${JSON.stringify(node.value)}`)
    }
    let name = node.tagName.toLowerCase()
    if (part || custom) {
      role ??= implicitRole(node)
      if (role === "none" || role === "presentation") role = null
      const level = /^h([1-6])$/.exec(node.localName)
      if (level && !node.hasAttribute("aria-level")) attributes.unshift(`aria-level="${level[1]}"`)
      name = `@${node.getAttribute("data-slot") ?? node.localName}${role ? ` role=${role}` : ""}`
    }
    lines.push(`${pad}<${name}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`)
    if (node instanceof HTMLTextAreaElement) return
    children(node, depth + 1, pad)
  }

  const children = (node: Element, depth: number, pad: string) => {
    let text = ""
    let before = false
    const flush = (after: boolean) => {
      const merged = text.replace(/\s+/g, " ")
      if (merged.trim() || (merged && before && after)) lines.push(`${pad}  "${merged}"`)
      text = ""
    }
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ""
      else if (child.nodeType === Node.COMMENT_NODE) continue
      else {
        flush(true)
        walk(child, depth)
        before = true
      }
    }
    flush(false)
  }

  walk(root, 0)
  return lines.join("\n")
}
