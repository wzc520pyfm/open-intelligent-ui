/**
 * How a component says what props it takes. One description serves three
 * readers: the system prompt lists it for the model, the renderer checks what
 * markup passes against it, and `librarySpec` writes it out as JSON for a
 * backend that has no access to the components themselves.
 */

/** The part of JSON Schema this package reads. Other keywords are kept and ignored. */
export interface JsonSchema {
  type?: string | readonly string[]
  enum?: readonly unknown[]
  const?: unknown
  properties?: Record<string, JsonSchema>
  required?: readonly string[]
  items?: JsonSchema
  anyOf?: readonly JsonSchema[]
  oneOf?: readonly JsonSchema[]
  description?: string
  default?: unknown
  [keyword: string]: unknown
}

export type PropTypeName =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "any"

/** One prop, written out. */
export interface PropDescriptor {
  type?: PropTypeName | readonly PropTypeName[]
  /** The values it accepts. */
  enum?: readonly (string | number | boolean)[]
  /** What a list holds. */
  items?: PropInput
  /** The fields of an object. */
  properties?: Record<string, PropInput>
  /** What it is for, in a sentence the model reads. */
  description?: string
  /** Used when markup leaves the prop out. */
  default?: unknown
  required?: boolean
  /**
   * Whether markup can write to it with `bind:name`. The component reports a
   * change by calling `onNameChange` (`onValueChange` for `value`).
   */
  bindable?: boolean
  /** A JSON Schema for the value, when the fields above can't say it. */
  schema?: JsonSchema
}

/**
 * A prop in short or in full: a type name (`"string"`), a list of accepted
 * values (`["sm", "md", "lg"]`), or a descriptor.
 */
export type PropInput = PropTypeName | readonly (string | number)[] | PropDescriptor

/** A schema library's object that can describe itself as JSON Schema (Zod 4, Valibot, ArkType). */
export interface StandardJsonSchema {
  readonly "~standard": {
    readonly jsonSchema?: {
      readonly input?: (options: { target: string }) => unknown
    }
    readonly [key: string]: unknown
  }
}

/**
 * The props of a component: a record of props, a JSON Schema of an object
 * (`z.toJSONSchema(schema)` gives one), or a Standard Schema that can write
 * its own JSON Schema.
 */
export type PropsInput = Record<string, PropInput> | JsonSchema | StandardJsonSchema

/** One prop as the prompt and the renderer read it. Plain data. */
export interface PropSpec {
  name: string
  /** How the type reads in the prompt: `string`, `"sm" | "lg"`, `{ id: string }[]`. */
  type: string
  schema: JsonSchema
  required: boolean
  bindable: boolean
  description?: string
  default?: unknown
}

const TYPE_NAMES = new Set(["string", "number", "integer", "boolean", "array", "object", "any"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isObjectSchema(value: unknown): value is JsonSchema {
  return isRecord(value) && value.type === "object" && isRecord(value.properties)
}

function toSchema(input: PropInput): JsonSchema {
  if (typeof input === "string") return input === "any" ? {} : { type: input }
  if (Array.isArray(input)) return { enum: [...input] }
  const descriptor = input as PropDescriptor
  if (descriptor.schema) return descriptor.schema
  const schema: JsonSchema = {}
  if (descriptor.type !== undefined && descriptor.type !== "any") {
    schema.type = descriptor.type as string | readonly string[]
  }
  if (descriptor.enum) schema.enum = [...descriptor.enum]
  if (descriptor.items !== undefined) {
    schema.type ??= "array"
    schema.items = toSchema(descriptor.items)
  }
  if (descriptor.properties) {
    schema.type ??= "object"
    schema.properties = {}
    const required: string[] = []
    for (const [name, field] of Object.entries(descriptor.properties)) {
      schema.properties[name] = toSchema(field)
      if (isRecord(field) && (field as PropDescriptor).required) required.push(name)
    }
    if (required.length) schema.required = required
  }
  if (descriptor.description) schema.description = descriptor.description
  return schema
}

const quote = (value: unknown) => (typeof value === "string" ? JSON.stringify(value) : String(value))

/** A JSON Schema as a short type a model can read. */
export function describeType(schema: JsonSchema | undefined, depth = 0): string {
  if (!schema || typeof schema !== "object") return "any"
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum.map(quote).join(" | ")
  if (schema.const !== undefined) return quote(schema.const)
  const union = schema.anyOf ?? schema.oneOf
  if (Array.isArray(union) && union.length) {
    const members = [...new Set(union.map((member) => describeType(member, depth + 1)))]
    return members.filter((member) => member !== "null").join(" | ") || "any"
  }
  if (Array.isArray(schema.type)) {
    const names = schema.type.filter((name) => name !== "null")
    return names.map((name) => describeType({ ...schema, type: name }, depth)).join(" | ") || "any"
  }
  switch (schema.type) {
    case "string":
      return "string"
    case "number":
    case "integer":
      return "number"
    case "boolean":
      return "boolean"
    case "array": {
      const item = describeType(schema.items, depth + 1)
      return item.includes(" ") && !item.startsWith("{") ? `(${item})[]` : `${item}[]`
    }
    case "object": {
      const fields = Object.entries(schema.properties ?? {})
      if (fields.length === 0 || depth > 2) return "object"
      const required = new Set(schema.required ?? [])
      const shown = fields
        .slice(0, 12)
        .map(([name, field]) => `${name}${required.has(name) ? "" : "?"}: ${describeType(field, depth + 1)}`)
      if (fields.length > shown.length) shown.push("…")
      return `{ ${shown.join(", ")} }`
    }
    default:
      return "any"
  }
}

function propSpec(name: string, schema: JsonSchema, more: Partial<PropSpec> = {}): PropSpec {
  const spec: PropSpec = {
    name,
    type: describeType(schema),
    schema,
    required: more.required ?? false,
    bindable: more.bindable ?? false,
  }
  const description = more.description ?? schema.description
  if (typeof description === "string" && description) spec.description = description
  const fallback = more.default ?? schema.default
  if (fallback !== undefined) {
    spec.default = fallback
    // What has a default can be left out, whatever the schema's output type says.
    spec.required = false
  }
  return spec
}

/**
 * Reads a component's props, in any of the forms `PropsInput` allows, into
 * one list. Problems are added to `issues`; what can be read is kept.
 */
export function normalizeProps(input: PropsInput | undefined, issues: string[] = []): PropSpec[] {
  if (input === undefined || input === null) return []
  if (!isRecord(input)) {
    issues.push("props must be an object")
    return []
  }
  const fromSchema = (schema: JsonSchema): PropSpec[] => {
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    return Object.entries(schema.properties ?? {}).map(([name, field]) =>
      propSpec(name, isRecord(field) ? field : {}, {
        required: required.has(name),
        bindable: isRecord(field) && field.bindable === true,
      })
    )
  }
  // A JSON Schema first: one written by a schema library may still carry the library's own marker.
  if (isObjectSchema(input)) return fromSchema(input)
  const standard = (input as Partial<StandardJsonSchema>)["~standard"]
  if (isRecord(standard)) {
    const write = (standard as StandardJsonSchema["~standard"]).jsonSchema?.input
    if (typeof write !== "function") {
      issues.push(
        "props is a schema that can't describe itself as JSON Schema; pass its JSON Schema instead, such as z.toJSONSchema(schema)"
      )
      return []
    }
    try {
      const written = write({ target: "draft-2020-12" })
      if (isObjectSchema(written)) return fromSchema(written)
      issues.push("props must be the schema of an object")
    } catch (error) {
      issues.push(`props could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
    return []
  }
  const specs: PropSpec[] = []
  for (const [name, value] of Object.entries(input as Record<string, PropInput>)) {
    if (typeof value === "string" && !TYPE_NAMES.has(value)) {
      issues.push(`prop "${name}" has the unknown type "${value}"`)
      continue
    }
    if (typeof value !== "string" && !Array.isArray(value) && !isRecord(value)) {
      issues.push(`prop "${name}" must be a type name, a list of values or a descriptor`)
      continue
    }
    const descriptor = isRecord(value) ? (value as PropDescriptor) : undefined
    const more: Partial<PropSpec> = {
      required: descriptor?.required === true,
      bindable: descriptor?.bindable === true,
    }
    if (descriptor?.description) more.description = descriptor.description
    if (descriptor?.default !== undefined) more.default = descriptor.default
    specs.push(propSpec(name, toSchema(value), more))
  }
  return specs
}

export type PropCheck = { ok: true; value: unknown } | { ok: false; expected: string }

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  return typeof value
}

function matches(schema: JsonSchema, value: unknown): PropCheck {
  if (Array.isArray(schema.enum)) {
    if (schema.enum.includes(value)) return { ok: true, value }
    // `size="2"` in markup is text; a list of numbers means the number.
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN
    if (schema.enum.includes(number)) return { ok: true, value: number }
    return { ok: false, expected: describeType(schema) }
  }
  if (schema.const !== undefined) {
    return schema.const === value ? { ok: true, value } : { ok: false, expected: describeType(schema) }
  }
  const union = schema.anyOf ?? schema.oneOf
  if (Array.isArray(union) && union.length) {
    for (const member of union) {
      const result = matches(member, value)
      if (result.ok) return result
    }
    return { ok: false, expected: describeType(schema) }
  }
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (types.length === 0) return { ok: true, value }
  const actual = typeOf(value)
  for (const type of types as string[]) {
    if (type === "number" || type === "integer") {
      if (actual === "number" && !Number.isNaN(value)) return { ok: true, value }
      if (actual === "string" && (value as string).trim() !== "" && Number.isFinite(Number(value))) {
        return { ok: true, value: Number(value) }
      }
    } else if (type === "string") {
      if (actual === "string") return { ok: true, value }
      if (actual === "number") return { ok: true, value: String(value) }
    } else if (type === "boolean") {
      if (actual === "boolean") return { ok: true, value }
      if (value === "true" || value === "") return { ok: true, value: true }
      if (value === "false") return { ok: true, value: false }
    } else if (type === actual) {
      return { ok: true, value }
    }
  }
  return { ok: false, expected: describeType(schema) }
}

/**
 * Checks what markup passed for one prop. The top level is checked, not what
 * is inside a list or an object: a component has to hold up against data a
 * model wrote, and the check is there to catch a wrong kind of value early.
 * Text a model wrote where a number or a flag belongs is read as one.
 */
export function checkProp(spec: PropSpec, value: unknown): PropCheck {
  if (value === undefined || value === null) return { ok: true, value }
  if (typeof value === "function") return { ok: false, expected: spec.type }
  return matches(spec.schema, value)
}
