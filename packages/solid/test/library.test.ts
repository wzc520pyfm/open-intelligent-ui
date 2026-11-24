import { librarySuite } from "../../core/test/library-suite"
import { draw, flushPromises, type Props } from "./helpers"

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
