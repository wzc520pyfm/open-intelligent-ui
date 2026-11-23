import {
  PRESET_NAMES,
  skeletonView,
  statView,
} from "@open-intelligent-ui/core/renderer"
import { stateless } from "../primitives/primitives.js"
import type { AnyComponent, Draw } from "../render/node.js"
import { PARTS } from "../render/view.js"
import Chart from "./Chart.svelte"
import CodeBlock from "./CodeBlock.svelte"
import DataTable from "./DataTable.svelte"
import AnimatedNumber from "./Number.svelte"

PARTS.number = AnimatedNumber

/** One headline figure with its label and how it changed. */
const Stat = stateless(statView as Draw)

/** A placeholder with the shape of content that is still loading. */
const Skeleton = stateless(skeletonView as Draw)

/** Small ready-made components for what UI SDK doesn't cover. */
export const PRESETS: Record<string, AnyComponent> = {
  Chart,
  Stat,
  Number: AnimatedNumber,
  Skeleton,
  CodeBlock,
  DataTable,
}

export { Chart, PRESET_NAMES }
