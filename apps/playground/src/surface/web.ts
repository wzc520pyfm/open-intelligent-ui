import { mount as draw } from "@open-intelligent-ui/web"
import type { Mount } from "./types"
// The site already has the stylesheet every renderer shares; this is what the custom elements add.
import "@open-intelligent-ui/web/elements.css"

export const mount: Mount = (target, props) => {
  const surface = draw(target, { ...props, class: "pg-surface" })
  return {
    update: (next) => surface.update(next),
    unmount: () => surface.unmount(),
    reset: () => surface.reset(),
  }
}
