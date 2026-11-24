import { act, cleanup, render } from "@testing-library/react"
import { librarySuite, type SuiteProps } from "../../core/test/library-suite"
import { IntelligentUI } from "../src"

const flush = async () => {
  for (let turn = 0; turn < 4; turn++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

librarySuite({
  flush,
  draw: async (initial) => {
    let props: SuiteProps = initial
    const view = render(<IntelligentUI {...props} />)
    await flush()
    return {
      container: view.container.querySelector(".iui-root") as HTMLElement,
      update: async (next) => {
        props = { ...props, ...next }
        view.rerender(<IntelligentUI {...props} />)
        await flush()
      },
      unmount: () => {
        view.unmount()
        cleanup()
      },
    }
  },
})
