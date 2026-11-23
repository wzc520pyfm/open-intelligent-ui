import type { Design } from "../design/design"
import { isComponentName } from "../markup/elements"
import { parse } from "../markup/scan"
import type { ElementNode, Node } from "../markup/ast"
import type { View } from "../renderer/view"
import { normalizeProps, type PropSpec, type PropsInput } from "./schema"

/** An event a component reports, which markup listens to with `on:name`. */
export interface EventSpec {
  name: string
  description?: string
  /** What the handler receives as `$value`, in words or as a type. */
  payload?: string
}

/**
 * What the prompt and the renderer know about a component. Plain data: it
 * can be written to a file and read on a server that never loads the
 * component itself.
 */
export interface ComponentSpec {
  name: string
  /** What it shows and when to use it. The model reads this. */
  description: string
  props: PropSpec[]
  /** True when the props were declared, so the renderer drops any others. */
  strict: boolean
  events: EventSpec[]
  /** What goes between the tags. Left out, the component takes no children. */
  children?: string
  /** Complete uses in markup. The first is shown in the prompt. */
  examples: string[]
  /** False keeps it out of the prompt: a replacement for a preset that is described already. */
  prompt: boolean
}

/** What a widget can do besides draw. */
export interface WidgetHandle {
  /** Draws again with the props it was last given, after its own state changed. */
  redraw(): void
  /** Runs `work` when the widget leaves the screen. */
  cleanup(work: () => void): void
  /**
   * Gives the widget one of its elements. Call it once, in setup, and put
   * what it returns in the `pass` of that element's view. `work` runs with
   * the element when it is on the page; what `work` returns runs when the
   * element goes away.
   */
  attach(work: (element: HTMLElement) => undefined | (() => void)): Record<string, unknown>
  /** Tells the host about a problem, through `onWarning`. The surface keeps working. */
  report(message: string): void
}

/**
 * Draws a widget from its props and children. Props arrive under the names
 * markup uses (`class`, a `style` object, `onSelect` for `on:select`);
 * children are whatever the renderer drew for the markup between the tags
 * and go into a view as they are.
 */
export type WidgetDraw<P = Record<string, unknown>> = (
  props: P,
  children: unknown[]
) => View | null | undefined | unknown[]

/**
 * A component written once for every renderer. Called once per place the
 * widget is used; what it keeps between draws lives in its closure.
 */
export type WidgetSetup<P = Record<string, unknown>> = (handle: WidgetHandle) => WidgetDraw<P>

/** A component with what the prompt says about it and what draws it. */
export interface ComponentDefinition<C = unknown> extends ComponentSpec {
  /** The framework's own component. */
  component?: C
  /** Draws it with framework-neutral views instead, the same in every renderer. */
  // biome-ignore lint/suspicious/noExplicitAny: a library holds widgets of any props
  setup?: WidgetSetup<any>
}

interface DefinitionInput {
  /** The tag, in PascalCase: `OrderCard`. */
  name: string
  description: string
  props?: PropsInput
  /** Events by name, with what each means: `{ select: "A row was pressed; $value is the row." }`. */
  events?: Record<string, string | Omit<EventSpec, "name">>
  /** True, or a sentence on what the children are for. */
  children?: boolean | string
  example?: string
  examples?: string[]
  prompt?: boolean
}

export interface ComponentInput<C = unknown> extends DefinitionInput {
  /**
   * The component. It may be left out when the definition is shared with a
   * server: the renderer then takes the one given under the same name in
   * its `components`.
   */
  component?: C
}

export interface WidgetInput<P = Record<string, unknown>> extends DefinitionInput {
  setup: WidgetSetup<P>
}

const definitions = new WeakSet<object>()
const problems = new WeakMap<object, string[]>()

function specOf(input: DefinitionInput, issues: string[]): ComponentSpec {
  const name = typeof input.name === "string" ? input.name : ""
  if (!isComponentName(name)) {
    issues.push(`"${name}" is not a component name; use PascalCase, such as OrderCard`)
  }
  const propIssues: string[] = []
  const props = normalizeProps(input.props, propIssues)
  issues.push(...propIssues.map((issue) => `<${name}>: ${issue}`))
  const events: EventSpec[] = Object.entries(input.events ?? {}).map(([event, value]) =>
    typeof value === "string" ? { name: event, description: value } : { name: event, ...value }
  )
  const spec: ComponentSpec = {
    name,
    description: typeof input.description === "string" ? input.description.trim() : "",
    props,
    strict: input.props !== undefined,
    events,
    examples: [input.example, ...(input.examples ?? [])]
      .filter((example): example is string => typeof example === "string" && example.trim() !== "")
      .map((example) => example.trim()),
    prompt: input.prompt !== false,
  }
  if (!spec.description && spec.prompt) issues.push(`<${name}> has no description for the model to read`)
  if (input.children === true) spec.children = "content"
  else if (typeof input.children === "string" && input.children) spec.children = input.children
  return spec
}

/**
 * Describes one of your own components: what it is for, what it takes and
 * what draws it. The description is what the system prompt tells the model
 * and what the renderer holds markup to.
 *
 * ```ts
 * const OrderCard = defineComponent({
 *   name: "OrderCard",
 *   description: "One order with its status and total. Use it wherever an order is shown.",
 *   props: {
 *     order: { type: "object", required: true, description: "An order from listOrders." },
 *     tone: ["neutral", "urgent"],
 *   },
 *   events: { open: "The card was pressed; $value is the order id." },
 *   example: `<OrderCard order={order} on:open={picked = $value} />`,
 *   component: OrderCardView,
 * })
 * ```
 */
export function defineComponent<C = unknown>(input: ComponentInput<C>): ComponentDefinition<C> {
  const issues: string[] = []
  const definition: ComponentDefinition<C> = { ...specOf(input, issues) }
  if (input.component !== undefined) definition.component = input.component
  definitions.add(definition)
  problems.set(definition, issues)
  return definition
}

/**
 * Describes a component drawn with framework-neutral views, so one
 * definition runs in every renderer. It is how a preset widget is written.
 *
 * ```ts
 * const Rating = defineWidget({
 *   name: "Rating",
 *   description: "A row of stars showing a score out of five.",
 *   props: { value: { type: "number", required: true }, label: "string" },
 *   example: `<Rating value={4.5} label="Guest rating" />`,
 *   setup: () => (props) =>
 *     view("span", { class: "rating", role: "img", "aria-label": props.label }, [
 *       "★".repeat(Math.round(props.value)),
 *     ]),
 * })
 * ```
 */
export function defineWidget<P = Record<string, unknown>>(
  input: WidgetInput<P>
): ComponentDefinition<never> {
  const issues: string[] = []
  const definition: ComponentDefinition<never> = { ...specOf(input, issues), setup: input.setup }
  if (typeof input.setup !== "function") issues.push(`<${definition.name}> has no setup function`)
  definitions.add(definition)
  problems.set(definition, issues)
  return definition
}

/** What the prompt says about the engine that draws `<Chart>`. */
export interface ChartEngineSpec {
  /** The engine's name, as the prompt gives it: `ECharts`. */
  name: string
  /**
   * The chart types the engine draws. A type it leaves out is drawn by the
   * built-in SVG. Left out, it draws bar, line, area, donut, pie and spark.
   */
  types?: readonly string[]
  /** Chart types beyond the built-in ones, each with a line that tells the model when to use it. */
  extra?: Record<string, string>
  /** More for the prompt: props the engine adds, what it does well. */
  guide?: string
}

/** A named entrance beyond the built-in ones. */
export interface MotionPresetSpec {
  /** When to use it. The model reads this. */
  description: string
}

/** What the prompt says about the engine that plays motion. */
export interface MotionSpec {
  /** The engine's name: `Motion`, `GSAP`. */
  name: string
  /** Replaces the motion section of the prompt. */
  guide?: string
  /** Values for `motion="…"` beyond the built-in ones. */
  presets?: Record<string, MotionPresetSpec>
}

export interface LibraryInput<C = unknown> {
  name?: string
  /** The product's DESIGN.md, or one read with `parseDesign`. */
  design?: string | Design
  components?: readonly (ComponentDefinition<C> | ComponentDefinition<never>)[]
  /** What draws `<Chart>` instead of the built-in SVG. */
  charts?: ChartEngineSpec
  /** What plays motion instead of the built-in CSS. */
  motion?: MotionSpec
  /** Product-specific instructions for the prompt. */
  instructions?: string
}

/**
 * Everything a product adds to Open Intelligent UI, in one object the
 * renderer and the system prompt both read.
 */
export interface Library<C = unknown> {
  readonly name?: string
  readonly design?: string | Design
  readonly components: readonly ComponentDefinition<C>[]
  readonly charts?: ChartEngineSpec
  readonly motion?: MotionSpec
  readonly instructions?: string
  /** The definition of a component, by tag name. */
  get(name: string): ComponentDefinition<C> | undefined
}

/** A library as plain data: what `librarySpec` writes and `buildSystemPrompt` reads. */
export interface LibrarySpec {
  name?: string
  /** The DESIGN.md source. */
  design?: string
  components: ComponentSpec[]
  charts?: ChartEngineSpec
  motion?: MotionSpec
  instructions?: string
}

/**
 * Gathers a product's components, design and engines. Give the result to
 * `<IntelligentUI library>` and to `buildSystemPrompt({ library })`, and the
 * model is told about exactly what the renderer can draw.
 *
 * A component named like a preset (`Chart`, `DataTable`) or a UI SDK part
 * replaces it.
 */
export function defineLibrary<C = unknown>(input: LibraryInput<C> = {}): Library<C> {
  const issues: string[] = []
  const byName = new Map<string, ComponentDefinition<C>>()
  for (const item of input.components ?? []) {
    if (!definitions.has(item)) {
      issues.push("components must be made with defineComponent or defineWidget")
      continue
    }
    const definition = item as ComponentDefinition<C>
    if (byName.has(definition.name)) issues.push(`<${definition.name}> is defined twice; the last one is used`)
    byName.set(definition.name, definition)
    issues.push(...(problems.get(definition) ?? []))
  }
  const library: Library<C> = {
    components: [...byName.values()],
    get: (name) => byName.get(name),
    ...(input.name ? { name: input.name } : {}),
    ...(input.design ? { design: input.design } : {}),
    ...(input.charts ? { charts: input.charts } : {}),
    ...(input.motion ? { motion: input.motion } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {}),
  }
  problems.set(library, issues)
  return library
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function chartSpec(engine: ChartEngineSpec): ChartEngineSpec {
  const spec: ChartEngineSpec = { name: engine.name }
  if (engine.types) spec.types = [...engine.types]
  if (engine.extra) spec.extra = { ...engine.extra }
  if (engine.guide) spec.guide = engine.guide
  return spec
}

function motionSpec(motion: MotionSpec): MotionSpec {
  const spec: MotionSpec = { name: motion.name }
  if (motion.guide) spec.guide = motion.guide
  if (motion.presets) {
    spec.presets = {}
    for (const [name, preset] of Object.entries(motion.presets)) {
      spec.presets[name] = { description: preset.description }
    }
  }
  return spec
}

function componentSpec(definition: ComponentSpec): ComponentSpec {
  const spec: ComponentSpec = {
    name: definition.name,
    description: definition.description,
    props: plain(definition.props),
    strict: definition.strict,
    events: plain(definition.events),
    examples: [...definition.examples],
    prompt: definition.prompt,
  }
  if (definition.children) spec.children = definition.children
  return spec
}

/**
 * A library as JSON: the components' descriptions without the components.
 * Write it to a file when the app is built and read it where the prompt is
 * made, so a server never has to load the UI.
 *
 * ```ts
 * writeFileSync("library.json", JSON.stringify(librarySpec(library)))
 * buildSystemPrompt({ library: JSON.parse(readFileSync("library.json", "utf8")) })
 * ```
 */
export function librarySpec(library: Library | LibrarySpec): LibrarySpec {
  const spec: LibrarySpec = { components: library.components.map(componentSpec) }
  if (library.name) spec.name = library.name
  if (typeof library.design === "string") spec.design = library.design
  if (library.charts) spec.charts = chartSpec(library.charts)
  if (library.motion) spec.motion = motionSpec(library.motion)
  if (library.instructions) spec.instructions = library.instructions
  return spec
}

function elements(nodes: Node[], out: ElementNode[] = []): ElementNode[] {
  for (const node of nodes) {
    if (node.type === "element") {
      out.push(node)
      elements(node.children, out)
    } else if (node.type === "if") {
      for (const branch of node.branches) elements(branch.children, out)
    } else if (node.type === "each") {
      elements(node.children, out)
      if (node.empty) elements(node.empty, out)
    }
  }
  return out
}

/** Names the renderer keeps for itself or refuses, so a prop under them would never arrive. */
const RESERVED = new Set([
  "key",
  "show",
  "class",
  "className",
  "style",
  "motion",
  "delay",
  "stagger",
  "morph",
  "children",
  "ref",
  "render",
  "action",
  "form",
  "is",
  "innerHTML",
  "outerHTML",
  "dangerouslySetInnerHTML",
])

/** Attributes any component takes, whatever it declares. */
const ALWAYS = new Set(["key", "show", "class", "style", "motion", "delay", "stagger", "morph", "..."])

/**
 * Whether markup may pass `name` to a component with this description, and
 * as what. `name` is the attribute as written: `title`, `on:select`,
 * `bind:value`, `let:item`.
 */
export function acceptsAttribute(spec: ComponentSpec, name: string): boolean {
  if (!spec.strict) return true
  if (ALWAYS.has(name) || name.startsWith("aria-") || name.startsWith("data-")) return true
  const colon = name.indexOf(":")
  if (colon > 0) {
    const directive = name.slice(0, colon)
    const argument = name.slice(colon + 1)
    if (directive === "on") return spec.events.some((event) => event.name === argument)
    if (directive === "bind") return spec.props.some((prop) => prop.name === argument && prop.bindable)
    return directive === "class" || directive === "style" || directive === "let"
  }
  if (/^on[A-Z]/.test(name)) {
    const event = name.charAt(2).toLowerCase() + name.slice(3)
    return spec.events.some((item) => item.name === event)
  }
  return spec.props.some((prop) => prop.name === name)
}

/**
 * What is wrong with a library, as sentences: a name that isn't a component
 * name, a missing description, an example that doesn't parse or passes a
 * prop its component doesn't declare. Run it in a test.
 */
export function validateLibrary(library: Library | LibrarySpec): string[] {
  const issues = [...(problems.get(library) ?? [])]
  const byName = new Map(library.components.map((component) => [component.name, component]))
  for (const component of library.components) {
    const { name } = component
    for (const prop of component.props) {
      if (/^on/i.test(prop.name)) {
        issues.push(`<${name}>: the prop "${prop.name}" starts with "on", which is kept for handlers; declare an event instead`)
      } else if (RESERVED.has(prop.name)) {
        issues.push(`<${name}>: the prop "${prop.name}" is never passed to a component; give it another name`)
      }
    }
    component.examples.forEach((example, index) => {
      const where = `<${name}> example ${index + 1}`
      const doc = parse(example)
      for (const diagnostic of doc.diagnostics) issues.push(`${where}: ${diagnostic.message}`)
      const used = elements(doc.children)
      if (!used.some((element) => element.name === name)) issues.push(`${where} doesn't use <${name}>`)
      for (const element of used) {
        const spec = byName.get(element.name)
        if (!spec) continue
        for (const attr of element.attrs) {
          if (!acceptsAttribute(spec, attr.name)) {
            issues.push(`${where} passes "${attr.name}", which <${element.name}> doesn't declare`)
          }
        }
        for (const prop of spec.props) {
          const given = element.attrs.some(
            (attr) => attr.name === prop.name || attr.name === `bind:${prop.name}` || attr.name === "..."
          )
          if (prop.required && !given && prop.default === undefined) {
            issues.push(`${where} leaves out "${prop.name}", which <${element.name}> requires`)
          }
        }
        if (element.children.length && !spec.children) {
          const text = element.children.every((child) => child.type === "text" && !child.value.trim())
          if (!text) issues.push(`${where} gives <${element.name}> children, which it doesn't take`)
        }
      }
    })
  }
  return [...new Set(issues)]
}
