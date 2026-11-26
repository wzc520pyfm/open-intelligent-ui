interface Node {
  type: string
  lang?: string | null
  meta?: string | null
  value?: string
  children?: Node[]
  [key: string]: unknown
}

const FLAGS = ["product", "designs"]

/** The markup is close enough to Svelte's for its grammar to colour it. */
const GRAMMAR = "svelte"

/**
 * Turns a fence written as ```iui live [product] [designs] into the example
 * drawn above its source: a `<LiveExample>` around the code block. It also
 * drops HTML comments, which a Markdown file brought in with `<include>` may
 * have and MDX can't take.
 */
export function remarkLive() {
  return (tree: Node) => walk(tree)
}

function walk(node: Node) {
  if (!node.children) return
  node.children = node.children
    .filter((child) => !(child.type === "html" && /^<!--[\s\S]*-->$/.test((child.value ?? "").trim())))
    .map((child) => {
      if (child.type !== "code" || child.lang !== "iui") {
        walk(child)
        return child
      }
      const flags = (child.meta ?? "").split(/\s+/)
      const code = { ...child, lang: GRAMMAR, meta: null }
      if (!flags.includes("live")) return code
      return {
        type: "mdxJsxFlowElement",
        name: "LiveExample",
        attributes: [
          { type: "mdxJsxAttribute", name: "source", value: child.value ?? "" },
          ...FLAGS.filter((flag) => flags.includes(flag)).map((flag) => ({
            type: "mdxJsxAttribute",
            name: flag,
            value: null,
          })),
        ],
        children: [code],
      }
    })
}
