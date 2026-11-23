import { flushPromises } from "@vue/test-utils"
import { librarySuite } from "../../core/test/library-suite"
import { draw, type Props } from "./helpers"

librarySuite({
  flush: flushPromises,
  draw: async (props) => {
    const { view, container } = await draw(props as Props)
    return {
      container,
      update: async (next) => {
        await view.setProps(next as Partial<Props>)
        await flushPromises()
      },
      unmount: () => view.unmount(),
    }
  },
})
