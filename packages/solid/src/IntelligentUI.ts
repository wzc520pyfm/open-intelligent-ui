import {
  type Design,
  type Diagnostic,
  parse,
  type StorageLike,
  Surface,
  type SurfaceAction,
  type Tool,
  type ToolEvent,
} from "@open-intelligent-ui/core"
import {
  claimId,
  copyText,
  designCss,
  guard,
  modelCss,
  openUrl,
  runMorph,
  styleText,
  TOAST_LIFETIME,
  TOAST_LIMIT,
  type Toast,
  usesMorph,
} from "@open-intelligent-ui/core/renderer"
import { isServer, type JSX } from "@solidjs/web"
import {
  createRenderEffect,
  createUniqueId,
  flush,
  getOwner,
  onCleanup,
  onSettled,
  untrack,
} from "solid-js"
import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk"
import { Children } from "./render/mount"
import { type AnyComponent, element, type Node } from "./render/node"
import { type RenderContext, renderNodes } from "./render/render"

/** What `ref` on `<IntelligentUI>` is called with. */
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
  design?: string | Design
  /** Which colors to use when the design has both. Defaults to `auto`. */
  scheme?: "light" | "dark" | "auto"
  /** Your own components, usable in markup by their PascalCase name. */
  components?: Record<string, AnyComponent>
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
  class?: string
  style?: JSX.CSSProperties | string
  /** Called once with the handle: `getState`, `setState`, `reset`, `refetch`. */
  ref?: (handle: IntelligentUIHandle) => void
}

const isDescribed = (node: Node): node is Exclude<Node, string | number | boolean | null | undefined | Node[]> =>
  typeof node === "object" && node !== null && !Array.isArray(node)

/**
 * Renders IUI markup: Markdown, layout primitives, UI SDK components and
 * preset widgets, with the state, queries and actions the markup declares.
 */
export function IntelligentUI(props: IntelligentUIProps): JSX.Element {
  // The surface is drawn straight into the DOM, which a server doesn't have.
  if (isServer) return undefined

  // Solid numbers its ids from a counter in the module, so two copies of it
  // on one page hand out the same ones. A surface scopes its styles by its
  // id, so the id is claimed across the page.
  const claim = claimId(createUniqueId().replace(/[^A-Za-z0-9]/g, ""))
  const id = claim.id
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const reported = new Set<string>()
  let toasts: Toast[] = []
  let toastId = 0
  let gone = false

  const showToast = (message: string, tone?: string) => {
    const toast: Toast = { id: ++toastId, message, tone }
    toasts = [...toasts.slice(1 - TOAST_LIMIT), toast]
    const timer = setTimeout(() => {
      timers.delete(timer)
      toasts = toasts.filter((item) => item.id !== toast.id)
      schedule()
    }, TOAST_LIFETIME)
    timers.add(timer)
    schedule()
  }

  const report = (message: string) => {
    if (reported.has(message)) return
    reported.add(message)
    queueMicrotask(() => props.onWarning?.(message))
  }

  const first = untrack(() => ({
    functions: props.functions,
    actions: props.actions,
    initialState: props.initialState,
    locale: props.locale,
    currency: props.currency,
    storage: props.storage,
    storageKey: props.storageKey,
  }))

  const surface = new Surface({
    callTool: (name, input) => {
      const { tools, callTool } = props
      if (tools && Object.hasOwn(tools, name)) return (tools[name] as Tool)(input)
      if (callTool) return callTool(name, input)
      throw new Error(`No tool named "${name}" is available`)
    },
    onAction: (action) => {
      if (props.onAction?.(action) === true) return
      if (action.type === "toast") showToast(action.message, action.tone)
      else if (action.type === "copy") copyText(action.text)
      else if (action.type === "open") openUrl(action.url)
    },
    onTool: (event) => props.onTool?.(event),
    onWarning: (message) => report(message),
    ...(first.functions ? { functions: first.functions } : {}),
    ...(first.actions ? { actions: first.actions } : {}),
    ...(first.initialState ? { initialState: first.initialState } : {}),
    ...(first.locale ? { locale: first.locale } : {}),
    ...(first.currency ? { currency: first.currency } : {}),
    ...(first.storage ? { storage: first.storage } : {}),
    ...(first.storageKey ? { storageKey: first.storageKey } : {}),
  })

  // What the surface is drawn from. Solid tells us when one of these changes.
  const given = () => ({
    source: props.source,
    streaming: Boolean(props.streaming),
    design: props.design,
    scheme: props.scheme ?? "auto",
    class: props.class,
    style: props.style,
    components: props.components,
    allowUrl: props.allowUrl,
  })
  let now = untrack(given)
  let doc = parse(now.source, { streaming: now.streaming })
  // The surface has to know the new document before anything is drawn from it.
  surface.update(doc)

  const handle: IntelligentUIHandle = {
    getState: () => surface.snapshot(),
    setState: (values) => surface.patch(values),
    reset: (...names) => surface.reset(...names),
    refetch: (...ids) => surface.refetch(...ids),
    surface,
  }
  untrack(() => props.ref)?.(handle)

  const write = (work: () => unknown): unknown =>
    guard(work, (message) => {
      props.onWarning?.(message)
      showToast(message, "danger")
    })

  let root: HTMLElement | null = null
  let toastRegion: HTMLElement | null = null
  const invoke = (work: () => unknown): unknown => {
    if (!usesMorph(now.source)) return write(work)
    const ran = runMorph(
      () => root,
      () => {
        write(work)
        // The transition takes its second picture as soon as this returns.
        redraw()
      }
    )
    return ran ? undefined : write(work)
  }

  let designSheet: { from: string | Design | undefined; css: string } | undefined
  const designSheets = () => {
    if (!designSheet || designSheet.from !== now.design) {
      designSheet = { from: now.design, css: designCss(now.design, id) }
    }
    return designSheet.css
  }
  let modelSheet: { key: string; css: string } | undefined
  const modelSheets = () => {
    const key = surface.styles.join("\u0000")
    if (modelSheet?.key !== key) modelSheet = { key, css: modelCss(surface.styles, id) }
    return modelSheet.css
  }

  const onBlockError = (error: unknown) =>
    report(error instanceof Error ? error.message : String(error))

  const mounted = new Children({ owner: getOwner(), space: "html" })

  const draw = () => {
    const ctx: RenderContext = {
      surface,
      scope: surface.scope,
      slot: null,
      templateDepth: 0,
      options: {
        components: now.components ?? {},
        streaming: now.streaming,
        report,
        invoke,
        write,
        allowUrl: now.allowUrl,
      },
    }

    const blocks = renderNodes(doc.children, ctx).map((node, index): Node => {
      if (!isDescribed(node)) return node
      return {
        kind: "boundary",
        key: node.key ?? index,
        child: node,
        resetKey: now.source,
        quiet: now.streaming,
        onError: onBlockError,
      }
    })

    const design = designSheets()
    const sheet = modelSheets()
    mounted.patch([
      element(
        "div",
        {
          ref: (node: HTMLElement) => {
            root = node
          },
          class: now.class ? `iui-root ${now.class}` : "iui-root",
          style: now.style,
          "data-iui-id": id,
          "data-iui-scheme": now.scheme,
          "data-streaming": now.streaming ? "" : undefined,
        },
        [
          design ? element("style", {}, [styleText(design)], "design") : null,
          sheet ? element("style", {}, [styleText(sheet)], "model") : null,
          { kind: "fragment", key: "blocks", children: blocks },
          element(
            "div",
            {
              ref: (node: HTMLElement) => {
                toastRegion = node
              },
              class: "iui-toasts",
              popover: "manual",
              role: "status",
              "aria-live": "polite",
            },
            toasts.map((toast) =>
              element("div", { class: "iui-toast", "data-tone": toast.tone }, [toast.message], toast.id)
            ),
            "toasts"
          ),
        ]
      ),
    ])
  }

  // The top layer keeps toasts in the viewport corner however the surface is
  // nested or clipped.
  let toastsShown = false
  const showToasts = () => {
    const shown = toasts.length > 0
    if (shown === toastsShown) return
    toastsShown = shown
    try {
      if (shown) toastRegion?.showPopover?.()
      else toastRegion?.hidePopover?.()
    } catch {
      // A popover that is already in the wanted state throws; nothing to do.
    }
  }

  let announced = -1
  const announce = () => {
    const version = surface.getVersion()
    if (version === announced) return
    announced = version
    props.onStateChange?.(surface.snapshot())
  }

  /** Draws the surface again and has Solid put the result in the DOM at once. */
  const redraw = () => {
    draw()
    flush()
    showToasts()
  }

  // The surface and the UI SDK registry keep their own state and say when it
  // changed. However many changes one event makes, the surface is drawn once.
  let queued = false
  function schedule() {
    if (queued || gone) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (gone) return
      redraw()
      announce()
    })
  }

  draw()

  let settled = false
  createRenderEffect(given, (next) => {
    // The first run reports what was drawn above.
    if (!settled) {
      settled = true
      return
    }
    const reparse = next.source !== now.source || next.streaming !== now.streaming
    now = next
    if (reparse) {
      doc = parse(now.source, { streaming: now.streaming })
      surface.update(doc)
    }
    draw()
    if (reparse) {
      // Queries written later in the stream exist only after a re-parse.
      surface.start()
      props.onDiagnostics?.(doc.diagnostics)
    }
  })

  const stops = [surface.subscribe(schedule), subscribeUiSdk(schedule)]
  const drawnWith = getUiSdkVersion()

  onSettled(() => {
    surface.start()
    announce()
    props.onDiagnostics?.(doc.diagnostics)
    // A component that finished loading before anyone was listening.
    if (getUiSdkVersion() !== drawnWith) schedule()
  })

  onCleanup(() => {
    gone = true
    for (const stop of stops) stop()
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    surface.stop()
    mounted.dispose()
    claim.release()
  })

  return mounted.read as unknown as JSX.Element
}
