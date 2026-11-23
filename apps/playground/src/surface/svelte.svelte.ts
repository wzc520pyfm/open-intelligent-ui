import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/svelte"
import { mount as draw, unmount } from "svelte"
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
  // Raw, so the tools and the design are passed on as they are and not wrapped.
  let current = $state.raw(props)
  // A Svelte component reads its props when it needs them, so each is a getter
  // over the latest ones.
  const given = { class: "pg-surface" } as SurfaceProps & { class: string }
  for (const name of NAMES) {
    Object.defineProperty(given, name, { enumerable: true, get: () => current[name] })
  }
  const surface = draw(IntelligentUI, { target, props: given }) as unknown as IntelligentUIHandle
  return {
    update: (next) => {
      current = next
    },
    unmount: () => void unmount(surface),
    reset: () => surface.reset(),
  }
}
