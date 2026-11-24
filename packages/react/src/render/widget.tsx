import type { WidgetSetup } from "@open-intelligent-ui/core"
import {
  type StyleMap,
  startWidget,
  type WidgetInstance,
} from "@open-intelligent-ui/core/renderer"
import {
  type ComponentType,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useReducer,
  useRef,
} from "react"
import { toReact, type ViewParts } from "./view"

type Props = Record<string, unknown> & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

const components = new WeakMap<WidgetSetup, ComponentType<Props>>()

/**
 * A widget written with framework-neutral views as a React component. The
 * widget's own state lives in its closure; React is only asked to draw
 * again when the widget says so.
 */
export function widgetComponent(setup: WidgetSetup, parts: ViewParts): ComponentType<Props> {
  const known = components.get(setup)
  if (known) return known

  function Widget(input: Props) {
    const [, redraw] = useReducer((count: number) => count + 1, 0)
    const mounted = useRef(false)
    const instance = useRef<WidgetInstance | null>(null)
    const start = () =>
      startWidget(setup, {
        redraw: () => {
          if (mounted.current) redraw()
        },
        ref: (set) => ({ ref: set }),
      })
    instance.current ??= start()

    useEffect(() => {
      mounted.current = true
      // An effect that ran, was undone and runs again finds the widget disposed: start it over.
      if (instance.current?.disposed) {
        instance.current = start()
        redraw()
      }
      return () => {
        mounted.current = false
        instance.current?.dispose()
      }
    }, [])

    const { children, className, style, ...rest } = input
    const content = children === undefined || children === null ? [] : Array.isArray(children) ? children : [children]
    return toReact(
      instance.current.draw({ ...rest, class: className, style: style as StyleMap | undefined }, content),
      parts
    )
  }
  Widget.displayName = "IuiWidget"
  components.set(setup, Widget)
  return Widget
}
