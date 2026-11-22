import {
  DEFAULT_DESIGN,
  type Design,
  type Diagnostic,
  designToCss,
  parse,
  parseDesign,
  type StorageLike,
  Surface,
  type SurfaceAction,
  scopeCss,
  type Tool,
  type ToolEvent,
} from "@open-intelligent-ui/core"
import {
  type ComponentType,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk"
import { Boundary } from "./render/Boundary"
import { type RenderContext, renderNodes } from "./render/render"

export interface IntelligentUIHandle {
  /** The surface's current state, as plain data. */
  getState(): Record<string, unknown>
  /** Writes state, as if the user had changed it. */
  setState(values: Record<string, unknown>): void
  /** Puts state back to its declared starting values. */
  reset(...names: string[]): void
  /** Reloads the named queries, or all of them. */
  refetch(...ids: string[]): void
  readonly surface: Surface
}

export interface IntelligentUIProps {
  /** IUI markup written by the model. May be incomplete while `streaming`. */
  source: string
  /** True while `source` is still arriving. */
  streaming?: boolean
  /** A DESIGN.md document, or one already read with `parseDesign`. */
  design?: string | Design | undefined
  /** Which colors to use when the design has both. Defaults to `auto`. */
  scheme?: "light" | "dark" | "auto"
  /** Your own components, usable in markup by their PascalCase name. */
  components?: Record<string, ComponentType<never>>
  /** Functions the surface reads with `<query>` and writes with `call()`. */
  tools?: Record<string, Tool>
  /** Called for tools not found in `tools`. */
  callTool?: (name: string, input: unknown) => unknown
  /**
   * Called when the surface sends a message, opens a link, copies text or
   * shows a toast. Return `true` to replace the built-in handling.
   */
  onAction?: (action: SurfaceAction) => boolean | undefined
  onTool?: (event: ToolEvent) => void
  /** Problems in the markup: unknown components, bad expressions, failed actions. */
  onWarning?: (message: string) => void
  /** Parse problems for the current source. */
  onDiagnostics?: (diagnostics: Diagnostic[]) => void
  onStateChange?: (state: Record<string, unknown>) => void
  initialState?: Record<string, unknown>
  /** Extra pure functions for expressions. */
  functions?: Record<string, (...args: never[]) => unknown>
  /** Extra actions for event handlers. */
  actions?: Record<string, (...args: never[]) => unknown>
  locale?: string
  currency?: string
  /** Where `<state persist>` values are kept. Needs `storageKey`. */
  storage?: StorageLike
  storageKey?: string
  /** Return false to refuse a link or media URL. */
  allowUrl?: (url: string, kind: "link" | "media") => boolean
  className?: string
  style?: CSSProperties
  ref?: Ref<IntelligentUIHandle>
}

interface Toast {
  id: number
  message: string
  tone: string | undefined
}

const TOAST_LIFETIME = 4000

function styleText(css: string): string {
  return css.replace(/<\//g, "<\\/")
}

function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value)
  ref.current = value
  return ref
}

/**
 * Renders IUI markup: Markdown, layout primitives, UI SDK components and
 * preset widgets, with the state, queries and actions the markup declares.
 */
export function IntelligentUI(props: IntelligentUIProps): ReactNode {
  const {
    source,
    streaming = false,
    design,
    scheme = "auto",
    components,
    allowUrl,
    className,
    style,
    ref,
  } = props
  const latest = useLatest(props)
  const id = useId().replace(/[^A-Za-z0-9]/g, "")
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const reported = useRef(new Set<string>())

  const showToast = useCallback((message: string, tone?: string) => {
    const toast: Toast = { id: ++toastId.current, message, tone }
    setToasts((list) => [...list.slice(-3), toast])
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setToasts((list) => list.filter((item) => item.id !== toast.id))
    }, TOAST_LIFETIME)
    timers.current.add(timer)
  }, [])

  // The top layer keeps toasts in the viewport corner however the surface is
  // nested or clipped.
  const toastRegion = useRef<HTMLDivElement>(null)
  const hasToasts = toasts.length > 0
  useEffect(() => {
    const region = toastRegion.current
    if (!region || !hasToasts) return
    try {
      region.showPopover?.()
    } catch {
      return
    }
    return () => {
      try {
        region.hidePopover?.()
      } catch {
        return
      }
    }
  }, [hasToasts])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const report = useCallback(
    (message: string) => {
      if (reported.current.has(message)) return
      reported.current.add(message)
      queueMicrotask(() => latest.current.onWarning?.(message))
    },
    [latest]
  )

  const [surface] = useState(
    () =>
      new Surface({
        callTool: (name, input) => {
          const { tools, callTool } = latest.current
          if (tools && Object.hasOwn(tools, name)) return (tools[name] as Tool)(input)
          if (callTool) return callTool(name, input)
          throw new Error(`No tool named "${name}" is available`)
        },
        onAction: (action) => {
          if (latest.current.onAction?.(action) === true) return
          if (action.type === "toast") showToast(action.message, action.tone)
          else if (action.type === "copy") {
            void navigator.clipboard?.writeText(action.text).catch(() => {})
          } else if (action.type === "open") {
            if (/^(https?:|mailto:|tel:)/i.test(action.url)) {
              window.open(action.url, "_blank", "noopener,noreferrer")
            }
          }
        },
        onTool: (event) => latest.current.onTool?.(event),
        onWarning: (message) => report(message),
        ...(props.functions ? { functions: props.functions } : {}),
        ...(props.actions ? { actions: props.actions } : {}),
        ...(props.initialState ? { initialState: props.initialState } : {}),
        ...(props.locale ? { locale: props.locale } : {}),
        ...(props.currency ? { currency: props.currency } : {}),
        ...(props.storage ? { storage: props.storage } : {}),
        ...(props.storageKey ? { storageKey: props.storageKey } : {}),
      })
  )

  const doc = useMemo(() => parse(source, { streaming }), [source, streaming])
  surface.update(doc)

  const version = useSyncExternalStore(
    surface.subscribe,
    surface.getVersion,
    surface.getVersion
  )
  useSyncExternalStore(subscribeUiSdk, getUiSdkVersion, getUiSdkVersion)

  useEffect(() => {
    surface.start()
    return () => surface.stop()
  }, [surface])

  const stateVersion = useRef(-1)
  useEffect(() => {
    if (stateVersion.current === version) return
    stateVersion.current = version
    latest.current.onStateChange?.(surface.snapshot())
  }, [version, surface, latest])

  useEffect(() => {
    latest.current.onDiagnostics?.(doc.diagnostics)
  }, [doc, latest])

  useImperativeHandle(
    ref,
    () => ({
      getState: () => surface.snapshot(),
      setState: (values) => surface.patch(values),
      reset: (...names) => surface.reset(...names),
      refetch: (...ids) => surface.refetch(...ids),
      surface,
    }),
    [surface]
  )

  const invoke = useCallback(
    (work: () => unknown): unknown => {
      const fail = (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        latest.current.onWarning?.(message)
        showToast(message, "danger")
      }
      try {
        const result = work()
        if (result instanceof Promise) {
          return result.catch((error: unknown) => {
            fail(error)
          })
        }
        return result
      } catch (error) {
        fail(error)
        return undefined
      }
    },
    [latest, showToast]
  )

  const designCss = useMemo(() => {
    const parsed =
      typeof design === "object" ? design : parseDesign(design || DEFAULT_DESIGN)
    return designToCss(parsed, { selector: `.iui-root[data-iui-id="${id}"]` })
  }, [design, id])

  const sheetKey = surface.styles.join("\u0000")
  const modelCss = useMemo(
    () =>
      sheetKey
        .split("\u0000")
        .filter(Boolean)
        .map((css) => scopeCss(css, `.iui-root[data-iui-id="${id}"]`, id).css)
        .join("\n"),
    [sheetKey, id]
  )

  const ctx: RenderContext = {
    surface,
    scope: surface.scope,
    slot: null,
    templateDepth: 0,
    options: {
      components: components ?? {},
      streaming,
      report,
      invoke,
      allowUrl,
    },
  }

  const blocks = renderNodes(doc.children, ctx).map((node, index) => {
    if (!isValidElement(node)) return node
    return (
      <Boundary
        key={node.key ?? index}
        resetKey={source}
        quiet={streaming}
        onError={(error) =>
          report(error instanceof Error ? error.message : String(error))
        }
      >
        {node}
      </Boundary>
    )
  })

  return (
    <div
      className={className ? `iui-root ${className}` : "iui-root"}
      style={style}
      data-iui-id={id}
      data-iui-scheme={scheme}
      data-streaming={streaming ? "" : undefined}
    >
      {designCss ? <style>{styleText(designCss)}</style> : null}
      {modelCss ? <style>{styleText(modelCss)}</style> : null}
      {blocks}
      <div
        ref={toastRegion}
        className="iui-toasts"
        popover="manual"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="iui-toast" data-tone={toast.tone}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  )
}
