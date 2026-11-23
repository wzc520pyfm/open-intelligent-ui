import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/vue"
import { createApp, h, shallowReactive, shallowRef } from "vue"
import type { Mount } from "./types"

let nextApp = 0

export const mount: Mount = (target, props) => {
  const current = shallowReactive({ ...props })
  const surface = shallowRef<IntelligentUIHandle | null>(null)
  const app = createApp({
    render: () => h(IntelligentUI, { ...current, class: "pg-surface", ref: surface }),
  })
  // Vue counts its ids per app, and a surface scopes its styles by that id.
  app.config.idPrefix = `s${nextApp++}`
  app.mount(target)
  return {
    update: (next) => Object.assign(current, next),
    unmount: () => app.unmount(),
    reset: () => surface.value?.reset(),
  }
}
