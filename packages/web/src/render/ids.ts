const COUNTERS = Symbol.for("@open-intelligent-ui/web:ids")

type Counters = Record<string, number>

/**
 * A name no other surface or chart on the page has. The count is kept on
 * the page rather than in this module: a page can load two copies of the
 * package, and both write ids into the same document, where a design's
 * rules and a chart's gradients are found by id.
 */
export function nextId(kind: "surface" | "chart"): string {
  const page = globalThis as { [COUNTERS]?: Counters }
  const counters = (page[COUNTERS] ??= {})
  counters[kind] = (counters[kind] ?? 0) + 1
  return `w${counters[kind].toString(36)}`
}
