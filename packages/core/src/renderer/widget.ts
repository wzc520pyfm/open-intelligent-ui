import type { WidgetDraw, WidgetHandle, WidgetSetup } from "../library/library"

/** What a framework supplies so a widget can run in it. */
export interface WidgetHost {
  /** Draws the widget again. Asked for after the widget's own state changed. */
  redraw(): void
  /**
   * Props that make the framework call `set` with an element when it is
   * made and with `null` when it is gone: a ref, in whatever form the
   * framework has one.
   */
  ref(set: (element: Element | null) => void): Record<string | symbol, unknown>
}

/**
 * The prop a widget's problems are reported through. The shared renderer
 * sets it on every widget it draws; markup can't write a name like it.
 */
export const WIDGET_REPORT = "#report"

/** One use of a widget on the page. */
export interface WidgetInstance {
  draw(props: Record<string, unknown>, children: unknown[]): unknown
  /** Runs the widget's cleanups. Call it when the widget leaves the page. */
  dispose(): void
  readonly disposed: boolean
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Starts a widget: calls its setup once and returns what draws it. A
 * widget that throws, in setup or in a draw, shows nothing and reports why;
 * it never takes the surface down.
 */
export function startWidget(setup: WidgetSetup, host: WidgetHost): WidgetInstance {
  const cleanups: (() => void)[] = []
  let disposed = false
  let report: ((text: string) => void) | undefined
  // What went wrong before the widget was first drawn, and so before it knew whom to tell.
  const unsaid: string[] = []
  const say = (text: string) => {
    if (report) report(text)
    else unsaid.push(text)
  }
  const fail = (error: unknown) => say(message(error))

  const handle: WidgetHandle = {
    redraw: () => {
      if (!disposed) host.redraw()
    },
    cleanup: (work) => {
      cleanups.push(work)
    },
    report: say,
    attach: (work) => {
      let current: Element | null = null
      let undo: (() => void) | undefined
      const stop = () => {
        const done = undo
        undo = undefined
        try {
          done?.()
        } catch (error) {
          fail(error)
        }
      }
      cleanups.push(() => {
        current = null
        stop()
      })
      const ref = host.ref((element) => {
        if (element === current) return
        stop()
        current = element
        if (!element) return
        // A framework hands the element over as it makes it; it is on the page once this pass is over.
        queueMicrotask(() => {
          if (current !== element || disposed) return
          try {
            undo = work(element as HTMLElement) ?? undefined
          } catch (error) {
            fail(error)
          }
        })
      })
      return ref as Record<string, unknown>
    },
  }

  let draw: WidgetDraw | undefined
  try {
    draw = setup(handle)
  } catch (error) {
    fail(error)
  }

  return {
    draw: (given, children) => {
      const { [WIDGET_REPORT]: told, ...props } = given
      if (typeof told === "function") {
        report = told as (text: string) => void
        for (const text of unsaid.splice(0)) report(text)
      }
      if (!draw) return null
      try {
        return draw(props, children) ?? null
      } catch (error) {
        fail(error)
        return null
      }
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const work of cleanups.splice(0)) {
        try {
          work()
        } catch (error) {
          fail(error)
        }
      }
    },
    get disposed() {
      return disposed
    },
  }
}
