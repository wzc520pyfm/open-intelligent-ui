import { afterEach } from "vitest"
import { librarySuite } from "../../core/test/library-suite"
import { cleanup, draw, flushPromises, type Props } from "./helpers.svelte"

afterEach(cleanup)

librarySuite({
  flush: flushPromises,
  draw: async (props) => {
    const { view, container } = await draw(props as Props)
    return {
      container,
      update: (next) => view.setProps(next as Partial<Props>),
      unmount: () => view.unmount(),
    }
  },
})
