import { afterEach } from "vitest"
import { librarySuite } from "../../core/test/library-suite"
import { draw, flushPromises, type Props, unmountAll } from "./helpers"

afterEach(unmountAll)

librarySuite({
  flush: flushPromises,
  draw: async (props) => {
    const { view, container } = await draw(props as Props)
    return {
      container,
      update: async (next) => {
        view.update(next as Partial<Props>)
        await flushPromises()
      },
      unmount: () => view.unmount(),
    }
  },
})
