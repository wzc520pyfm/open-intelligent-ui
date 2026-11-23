import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/solid"
import { createComponent, render } from "@solidjs/web"
import { createSignal } from "solid-js"
import type { Mount, SurfaceProps } from "./types"

const NAMES = [
  "source",
  "streaming",
  "design",
  "scheme",
  "tools",
  "library",
  "onAction",
  "onTool",
  "onWarning",
  "onStateChange",
] as const satisfies readonly (keyof SurfaceProps)[]

export const mount: Mount = (target, props) => {
  const [current, setCurrent] = createSignal(props)
  let surface: IntelligentUIHandle | undefined
  // A Solid component reads its props when it needs them, so each is a getter
  // over the latest ones.
  const given = {
    class: "pg-surface",
    ref: (handle: IntelligentUIHandle) => {
      surface = handle
    },
  } as Parameters<typeof IntelligentUI>[0]
  for (const name of NAMES) {
    Object.defineProperty(given, name, { enumerable: true, get: () => current()[name] })
  }
  const dispose = render(() => createComponent(IntelligentUI, given), target)
  return {
    update: (next) => setCurrent(() => next),
    unmount: dispose,
    reset: () => surface?.reset(),
  }
}
