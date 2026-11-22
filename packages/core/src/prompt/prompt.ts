import { DEFAULT_DESIGN } from "../design/default.generated"
import { type Design, describeDesignTokens, parseDesign } from "../design/design"
import { CRAFT_GUIDE, LANGUAGE_GUIDE, MOTION_GUIDE, PRIMITIVES_GUIDE } from "./guide"
import { CORE_COMPONENTS, RECIPES, UNSUPPORTED } from "./recipes"
import {
  type CatalogEntry,
  UI_SDK_CATALOG,
  UI_SDK_VERSION,
} from "./ui-sdk-catalog.generated"

/** A tool the generated interface may read from or write to. */
export interface PromptTool {
  name: string
  description?: string
  /** What the tool takes: a JSON Schema, or a short description. */
  input?: unknown
  /** What it returns, described in a sentence or as an example. */
  output?: unknown
  /** `read` tools are for `<query>`; `write` tools are for `call()`. */
  kind?: "read" | "write"
}

/** A component the host application adds to the vocabulary. */
export interface PromptComponent {
  name: string
  description: string
  /** An example in markup. */
  example?: string
}

export interface PromptOptions {
  /** A DESIGN.md document, or one read with `parseDesign`. Defaults to the built-in design. */
  design?: string | Design
  /**
   * Which UI SDK components to show with examples: the `core` set, `all`,
   * or a list of entry points such as `["tabs", "dialog"]`. The others are
   * listed by name.
   */
  components?: "core" | "all" | string[]
  tools?: PromptTool[]
  hostComponents?: PromptComponent[]
  /** Leave out the motion section, for surfaces that shouldn't animate. */
  motion?: boolean
  /** Product-specific instructions, added at the end. */
  instructions?: string
}

const BY_SLUG = new Map(UI_SDK_CATALOG.map((entry) => [entry.slug, entry]))
const BY_PART = new Map(
  UI_SDK_CATALOG.flatMap((entry) => entry.parts.map((part) => [part, entry] as const))
)

function findEntry(name: string): CatalogEntry | undefined {
  return (
    BY_SLUG.get(name) ??
    BY_PART.get(name) ??
    BY_SLUG.get(name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase())
  )
}

function example(entry: CatalogEntry): string {
  return RECIPES[entry.slug] ?? entry.example
}

function fence(code: string): string {
  return `\`\`\`\n${code.trim()}\n\`\`\``
}

const BINDABLE = /^on([A-Z]\w*)Change$/

/** The props of a part that hold state, as `bind:` targets. */
function bindings(entry: CatalogEntry): string[] {
  const names = new Set<string>()
  for (const props of Object.values(entry.props)) {
    for (const prop of props) {
      const match = BINDABLE.exec(prop.name)
      if (!match) continue
      const name = (match[1] as string).replace(/^./, (ch) => ch.toLowerCase())
      if (props.some((other) => other.name === name)) names.add(name)
    }
  }
  return [...names]
}

/**
 * Everything a model needs to use one UI SDK component: what it is for, how
 * its parts nest, an example, and (with `props`) every prop of every part.
 * Returns null for a name UI SDK doesn't have.
 *
 * Meant for a "look up a component" tool, so the system prompt can stay
 * short and a model can ask for detail when it needs it.
 */
export function describeComponent(
  name: string,
  options: { props?: boolean } = {}
): string | null {
  const entry = findEntry(name)
  if (!entry) return null
  const lines = [`## ${entry.name}`, "", entry.description, ""]
  if (Object.hasOwn(UNSUPPORTED, entry.slug)) {
    lines.push(`Not available in markup: ${UNSUPPORTED[entry.slug]}.`)
    return lines.join("\n")
  }
  lines.push(`Parts: ${entry.parts.map((part) => `\`${part}\``).join(", ")}`, "")
  if (entry.composition) lines.push("Structure:", fence(entry.composition), "")
  lines.push("Example:", fence(example(entry)), "")
  const bound = bindings(entry)
  if (bound.length) {
    lines.push(`Bind state with: ${bound.map((prop) => `\`bind:${prop}\``).join(", ")}`, "")
  }
  if (options.props) {
    for (const [part, props] of Object.entries(entry.props)) {
      if (props.length === 0) continue
      lines.push(`### ${part}`, "")
      for (const prop of props) {
        const type = prop.type ? ` (\`${prop.type}\`)` : ""
        lines.push(`- \`${prop.name}\`${type}: ${prop.description}`)
      }
      const attributes = entry.attributes[part]
      if (attributes?.length) {
        lines.push(`- State attributes: ${attributes.map((item) => `\`${item}\``).join(", ")}`)
      }
      lines.push("")
    }
  } else {
    const styled = Object.entries(entry.attributes)
      .filter(([, attributes]) => attributes.length)
      .slice(0, 6)
      .map(
        ([part, attributes]) =>
          `\`${part}\` ${attributes
            .slice(0, 5)
            .map((item) => `\`[${item}]\``)
            .join(" ")}`
      )
    if (styled.length) lines.push(`State attributes for CSS: ${styled.join("; ")}`, "")
  }
  return lines.join("\n").trimEnd()
}

function componentsSection(selection: PromptOptions["components"]): string {
  const shown =
    selection === "all"
      ? UI_SDK_CATALOG.map((entry) => entry.slug)
      : Array.isArray(selection)
        ? selection.flatMap((name) => findEntry(name)?.slug ?? [])
        : CORE_COMPONENTS
  const shownSet = new Set(shown)
  const lines = [
    "# UI SDK components",
    "",
    `Behaviors from UI SDK ${UI_SDK_VERSION}: focus, keyboard, selection, popups and`,
    "accessibility are handled. They arrive lightly styled by the design system;",
    "restyle any part with `class`, `style` or CSS on its `[data-slot]`.",
    "",
    "- Compose them from their parts, as in the examples. A part only works",
    "  inside its parent.",
    "- Keep their value in state with `bind:`, or leave them uncontrolled with",
    "  `defaultValue`, `defaultOpen`, `defaultChecked`.",
    '- `<Button>` takes `variant="solid|soft|ghost|link|accent|destructive"`',
    '  (default is outlined) and `size="sm|lg"`. Use one solid button per view.',
    "- Triggers such as `DialogTrigger`, `PopoverTrigger` and `MenuTrigger` are",
    "  buttons and take the same `variant` and `size`.",
    "- Give controls without visible text an `aria-label`.",
    "",
  ]
  for (const slug of shown) {
    const entry = BY_SLUG.get(slug)
    if (!entry || Object.hasOwn(UNSUPPORTED, slug)) continue
    lines.push(`### ${entry.name}`, "", entry.description)
    const bound = bindings(entry)
    if (bound.length) {
      lines.push(`Bind: ${bound.map((prop) => `\`bind:${prop}\``).join(", ")}.`)
    }
    lines.push("", fence(example(entry)), "")
  }
  const rest = UI_SDK_CATALOG.filter(
    (entry) => !shownSet.has(entry.slug) && !Object.hasOwn(UNSUPPORTED, entry.slug)
  )
  if (rest.length) {
    lines.push(
      "### Also available",
      "",
      "Same conventions. Parts are named after the component, such as",
      "`TreeItem` or `CarouselNext`.",
      ""
    )
    for (const entry of rest) lines.push(`- **${entry.name}**: ${entry.description}`)
    lines.push("")
  }
  for (const [slug, instead] of Object.entries(UNSUPPORTED)) {
    const entry = BY_SLUG.get(slug)
    if (entry) lines.push(`${entry.name} is not available in markup: ${instead}.`)
  }
  return lines.join("\n").trimEnd()
}

function describe(value: unknown): string {
  if (value === undefined) return ""
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return ""
  }
}

function toolsSection(tools: PromptTool[] | undefined): string {
  if (!tools?.length) {
    return [
      "# Tools",
      "",
      "No tools are available to the interface. Keep its data in `<state>`, and",
      "use `send()` when the reader's choice needs you to act.",
    ].join("\n")
  }
  const lines = [
    "# Tools",
    "",
    "The interface can use these tools directly, without going through you.",
    "Read with `<query>`. Write with `call()` from a handler; queries reload",
    "afterwards.",
    "",
  ]
  for (const tool of tools) {
    const kind = tool.kind === "write" ? "write" : tool.kind === "read" ? "read" : "read or write"
    lines.push(`### ${tool.name} (${kind})`)
    if (tool.description) lines.push("", tool.description)
    const input = describe(tool.input)
    if (input) lines.push("", `Input: ${input}`)
    const output = describe(tool.output)
    if (output) lines.push("", `Returns: ${output}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

function hostComponentsSection(components: PromptComponent[] | undefined): string {
  if (!components?.length) return ""
  const lines = [
    "# Components from this product",
    "",
    "Prefer these over building the same thing yourself.",
    "",
  ]
  for (const component of components) {
    lines.push(`### ${component.name}`, "", component.description)
    if (component.example) lines.push("", fence(component.example))
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

function designSection(input: string | Design | undefined): string {
  const design = typeof input === "object" ? input : parseDesign(input || DEFAULT_DESIGN)
  const title = design.name ? `# Design system: ${design.name}` : "# Design system"
  const lines = [
    title,
    "",
    "The interface is already themed from this design. Follow its guidance for",
    "what to emphasize and how things relate; use its token names for `color`,",
    "`background`, `borderColor`, `radius` and spacing, and its typography",
    'levels with `<text variant="…">`.',
    "",
    "Tokens:",
    "",
    describeDesignTokens(design),
  ]
  if (design.prose) lines.push("", "Guidance from the design:", "", design.prose)
  return lines.join("\n").trimEnd()
}

/**
 * The system prompt that teaches a model to write IUI markup for one product:
 * the language, the primitives and presets, the UI SDK components, motion,
 * the design system and the tools.
 */
export function buildSystemPrompt(options: PromptOptions = {}): string {
  const sections = [
    LANGUAGE_GUIDE,
    PRIMITIVES_GUIDE,
    componentsSection(options.components),
    hostComponentsSection(options.hostComponents),
    options.motion === false ? "" : MOTION_GUIDE,
    CRAFT_GUIDE,
    designSection(options.design),
    toolsSection(options.tools),
    options.instructions ? `# For this product\n\n${options.instructions.trim()}` : "",
  ]
  return `${sections
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n\n")}\n`
}
