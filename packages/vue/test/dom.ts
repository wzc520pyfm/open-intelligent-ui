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

/**
 * Describes what a renderer drew, leaving out what is the framework's own
 * business: comment placeholders, the order attributes were set in, how ids
 * are spelled, and whether a control's value sits in an attribute or a
 * property. Two renderers that agree here put the same interface on screen.
 */
export function describe(root: Element): string {
  const ids = new Map<string, string>()
  const rename = (id: string) => {
    if (!ids.has(id)) ids.set(id, `id${ids.size + 1}`)
    return ids.get(id) as string
  }
  const renameAll = (value: string) =>
    value
      .split(/\s+/)
      .filter(Boolean)
      .map(rename)
      .join(" ")

  // Ids are numbered in the order the document first mentions them.
  const lines: string[] = []
  const walk = (node: Node, depth: number) => {
    const pad = "  ".repeat(depth)
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? "").replace(/\s+/g, " ")
      if (text.trim()) lines.push(`${pad}"${text}"`)
      return
    }
    if (!(node instanceof Element)) return
    if (node.tagName === "STYLE" || node.classList.contains("iui-toasts")) return
    const attributes: string[] = []
    for (const attribute of [...node.attributes].sort((a, b) => a.name.localeCompare(b.name))) {
      const { name } = attribute
      let { value } = attribute
      const control = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
      if (control && (name === "value" || name === "checked")) continue
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
      else attributes.push(`.value=${JSON.stringify(node.value)}`)
    } else if (node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
      attributes.push(`.value=${JSON.stringify(node.value)}`)
    }
    lines.push(`${pad}<${node.tagName.toLowerCase()}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`)
    if (node instanceof HTMLTextAreaElement) return
    const copy = node.cloneNode(true)
    copy.normalize()
    // Walk the live children so property values are read from real elements,
    // but merge neighbouring text the way `normalize` would.
    let text = ""
    const flush = () => {
      const merged = text.replace(/\s+/g, " ")
      if (merged.trim()) lines.push(`${pad}  "${merged}"`)
      text = ""
    }
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text += child.textContent ?? ""
      else if (child.nodeType === Node.COMMENT_NODE) continue
      else {
        flush()
        walk(child, depth + 1)
      }
    }
    flush()
  }
  walk(root, 0)
  return lines.join("\n")
}
