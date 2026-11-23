import { type ClaimedId, claimId } from "@open-intelligent-ui/core/renderer"

const COUNTERS = Symbol.for("@open-intelligent-ui/web:ids")

type Counters = Record<string, number>

/**
 * A name no other surface or chart on the page has, to give back with
 * `release()` when its owner leaves. The count is kept on the page rather
 * than in this module: a page can load two copies of the package, and both
 * write ids into the same document, where a design's rules and a chart's
 * gradients are found by id. The name is then claimed across the page, so a
 * surface another renderer drew can't have it either.
 */
export function nextId(kind: "surface" | "chart"): ClaimedId {
  const page = globalThis as { [COUNTERS]?: Counters }
  const counters = (page[COUNTERS] ??= {})
  counters[kind] = (counters[kind] ?? 0) + 1
  const name = `w${counters[kind].toString(36)}`
  return claimId(kind === "chart" ? `iui-chart-${name}` : name)
}
