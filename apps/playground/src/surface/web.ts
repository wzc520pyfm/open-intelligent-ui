import { mount as draw } from "@open-intelligent-ui/web"
import type { Mount } from "./types"

export const mount: Mount = (target, props) => {
  const surface = draw(target, { ...props, class: "pg-surface" })
  return {
    update: (next) => surface.update(next),
    unmount: () => surface.unmount(),
    reset: () => surface.reset(),
  }
}
