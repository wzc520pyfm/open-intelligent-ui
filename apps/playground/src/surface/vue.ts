import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/vue"
import { createApp, h, shallowReactive, shallowRef } from "vue"
import type { Mount } from "./types"

export const mount: Mount = (target, props) => {
  const current = shallowReactive({ ...props })
  const surface = shallowRef<IntelligentUIHandle | null>(null)
  const app = createApp({
    render: () => h(IntelligentUI, { ...current, class: "pg-surface", ref: surface }),
  })
  app.mount(target)
  return {
    update: (next) => Object.assign(current, next),
    unmount: () => app.unmount(),
    reset: () => surface.value?.reset(),
  }
}
