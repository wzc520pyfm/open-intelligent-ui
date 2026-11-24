import {
  type Design,
  type Diagnostic,
  type Library,
  parse,
  type StorageLike,
  Surface,
  type SurfaceAction,
  type Tool,
  type ToolEvent,
} from "@open-intelligent-ui/core"
import {
  attachMotion,
  copyText,
  designCss as readDesignCss,
  guard,
  modelCss as readModelCss,
  openUrl,
  runMorph,
  styleText,
  TOAST_LIFETIME,
  TOAST_LIMIT,
  type Toast,
  usesMorph,
} from "@open-intelligent-ui/core/renderer"
import {
  type ComponentType,
  type CSSProperties,
  isValidElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { flushSync } from "react-dom"
import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk"
import { Boundary } from "./render/Boundary"
import { type AnyComponent, type RenderContext, renderNodes } from "./render/render"
import { alphanumeric, usePageId } from "./render/usePageId"

const useBeforePaint = typeof document === "undefined" ? useEffect : useLayoutEffect

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
  /**
   * What your product adds, made with `defineLibrary`: components with
   * their descriptions, the engines that draw charts and play motion, and
   * the design. Give the same library to `buildSystemPrompt`.
   */
  // biome-ignore lint/suspicious/noExplicitAny: a library holds components of any props
  library?: Library<ComponentType<any>> | undefined
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
    library,
    design = library?.design,
    scheme = "auto",
    components,
    allowUrl,
    className,
    style,
    ref,
  } = props
  const latest = useLatest(props)
  const id = usePageId(alphanumeric)
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())
  const reported = useRef(new Set<string>())

  const showToast = useCallback((message: string, tone?: string) => {
    const toast: Toast = { id: ++toastId.current, message, tone }
    setToasts((list) => [...list.slice(1 - TOAST_LIMIT), toast])
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
          else if (action.type === "copy") copyText(action.text)
          else if (action.type === "open") openUrl(action.url, latest.current.allowUrl)
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

  useEffect(() => () => surface.stop(), [surface])
  // Queries written later in the stream exist only after a re-parse.
  useEffect(() => {
    surface.start()
  }, [surface, doc])

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

  const write = useCallback(
    (work: () => unknown): unknown =>
      guard(work, (message) => {
        latest.current.onWarning?.(message)
        showToast(message, "danger")
      }),
    [latest, showToast]
  )

  const rootElement = useRef<HTMLDivElement>(null)
  const morphing = usesMorph(source)
  const invoke = useCallback(
    (work: () => unknown): unknown => {
      if (!morphing) return write(work)
      const ran = runMorph(
        () => rootElement.current,
        () => {
          flushSync(() => {
            write(work)
          })
        }
      )
      return ran ? undefined : write(work)
    },
    [write, morphing]
  )

  const designCss = useMemo(() => readDesignCss(design, id), [design, id])

  // Before the first paint, so nothing shows at rest and then plays its entrance.
  const motion = library?.motion
  useBeforePaint(() => attachMotion(rootElement.current, motion), [motion])

  const sheetKey = surface.styles.join("\u0000")
  const modelCss = useMemo(() => readModelCss(sheetKey.split("\u0000"), id), [sheetKey, id])

  const ctx: RenderContext = {
    surface,
    scope: surface.scope,
    slot: null,
    templateDepth: 0,
    options: {
      components: (components ?? {}) as Record<string, AnyComponent>,
      library,
      streaming,
      report,
      invoke,
      write,
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

  // While a tag is mid-token, the streaming parse can briefly yield no nodes.
  // Keep the last non-empty tree so the host frame does not flash empty.
  const stableBlocks = useRef(blocks)
  if (blocks.length > 0 || !streaming) stableBlocks.current = blocks
  const visible = streaming && blocks.length === 0 ? stableBlocks.current : blocks

  return (
    <div
      ref={rootElement}
      className={className ? `iui-root ${className}` : "iui-root"}
      style={style}
      data-iui-id={id}
      data-iui-scheme={scheme}
      data-streaming={streaming ? "" : undefined}
      data-empty={visible.length === 0 ? "" : undefined}
    >
      {designCss ? <style>{styleText(designCss)}</style> : null}
      {modelCss ? <style>{styleText(modelCss)}</style> : null}
      {visible}
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
