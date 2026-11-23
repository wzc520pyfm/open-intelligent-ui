import {
  type Design,
  type Diagnostic,
  type Document as IuiDocument,
  parse,
  type StorageLike,
  Surface,
  type SurfaceAction,
  type Tool,
  type ToolEvent,
} from "@open-intelligent-ui/core"
import {
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
import { type Child, component, h } from "./dom/node"
import { createRoot, flush } from "./dom/patch"
import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk"
import { Boundary } from "./render/Boundary"
import type { HostComponent } from "./render/host"
import { nextId } from "./render/ids"
import { type RenderContext, renderNodes } from "./render/render"

export type Scheme = "light" | "dark" | "auto"

/** What a surface is drawn from. Everything but `source` is optional. */
export interface IntelligentUIOptions {
  /** IUI markup written by the model. May be incomplete while `streaming`. */
  source: string
  /** True while `source` is still arriving. */
  streaming?: boolean | undefined
  /** A DESIGN.md document, or one already read with `parseDesign`. */
  design?: string | Design | undefined
  /** Which colors to use when the design has both. Defaults to `auto`. */
  scheme?: Scheme | undefined
  /** Your own components, usable in markup by their PascalCase name. */
  components?: Record<string, HostComponent> | undefined
  /** Functions the surface reads with `<query>` and writes with `call()`. */
  tools?: Record<string, Tool> | undefined
  /** Called for tools not found in `tools`. */
  callTool?: ((name: string, input: unknown) => unknown) | undefined
  /**
   * Called when the surface sends a message, opens a link, copies text or
   * shows a toast. Return `true` to replace the built-in handling.
   */
  // biome-ignore lint/suspicious/noConfusingVoidType: a handler that returns nothing is the usual one
  onAction?: ((action: SurfaceAction) => boolean | undefined | void) | undefined
  onTool?: ((event: ToolEvent) => void) | undefined
  /** Problems in the markup: unknown components, bad expressions, failed actions. */
  onWarning?: ((message: string) => void) | undefined
  /** Parse problems for the current source. */
  onDiagnostics?: ((diagnostics: Diagnostic[]) => void) | undefined
  onStateChange?: ((state: Record<string, unknown>) => void) | undefined
  /** Read once, when the surface is created. */
  initialState?: Record<string, unknown> | undefined
  /** Extra pure functions for expressions. Read once, when the surface is created. */
  functions?: Record<string, (...args: never[]) => unknown> | undefined
  /** Extra actions for event handlers. Read once, when the surface is created. */
  actions?: Record<string, (...args: never[]) => unknown> | undefined
  locale?: string | undefined
  currency?: string | undefined
  /** Where `<state persist>` values are kept. Needs `storageKey`. */
  storage?: StorageLike | undefined
  storageKey?: string | undefined
  /** Return false to refuse a link or media URL. */
  allowUrl?: ((url: string, kind: "link" | "media") => boolean) | undefined
  /** Class names for the surface's root element, next to its own. */
  class?: string | undefined
}

/** What a surface lets the application around it do. */
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

/** A surface on the page, as `mount()` returns it. */
export interface MountedUI extends IntelligentUIHandle {
  /** Changes some options and draws again: the next piece of a stream, a new design. */
  update(options: Partial<IntelligentUIOptions>): void
  /** Draws now whatever is waiting to be drawn. */
  flush(): void
  /** Takes the surface off the page and stops its queries and timers. */
  unmount(): void
}

/**
 * Renders IUI markup into `target`: Markdown, layout primitives, UI SDK
 * components and preset widgets, with the state, queries and actions the
 * markup declares. What is on the page is patched in place as `source`
 * grows and as state changes, so focus, typed text and scroll stay put.
 */
export function mount(target: Element, initial: IntelligentUIOptions): MountedUI {
  let options: IntelligentUIOptions = { ...initial }
  const claim = nextId("surface")
  const id = claim.id
  let toasts: Toast[] = []
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const reported = new Set<string>()
  let toastId = 0
  let alive = true

  const root = createRoot(target)
  const redraw = () => {
    if (alive) root.schedule(tree)
  }

  const showToast = (message: string, tone?: string) => {
    const toast: Toast = { id: ++toastId, message, tone }
    toasts = [...toasts.slice(1 - TOAST_LIMIT), toast]
    const timer = setTimeout(() => {
      timers.delete(timer)
      toasts = toasts.filter((item) => item.id !== toast.id)
      redraw()
    }, TOAST_LIFETIME)
    timers.add(timer)
    redraw()
  }

  const report = (message: string) => {
    if (reported.has(message)) return
    reported.add(message)
    queueMicrotask(() => options.onWarning?.(message))
  }

  const surface = new Surface({
    callTool: (name, input) => {
      const { tools, callTool } = options
      if (tools && Object.hasOwn(tools, name)) return (tools[name] as Tool)(input)
      if (callTool) return callTool(name, input)
      throw new Error(`No tool named "${name}" is available`)
    },
    onAction: (action) => {
      if (options.onAction?.(action) === true) return
      if (action.type === "toast") showToast(action.message, action.tone)
      else if (action.type === "copy") copyText(action.text)
      else if (action.type === "open") openUrl(action.url)
    },
    onTool: (event) => options.onTool?.(event),
    onWarning: (message) => report(message),
    ...(options.functions ? { functions: options.functions } : {}),
    ...(options.actions ? { actions: options.actions } : {}),
    ...(options.initialState ? { initialState: options.initialState } : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.currency ? { currency: options.currency } : {}),
    ...(options.storage ? { storage: options.storage } : {}),
    ...(options.storageKey ? { storageKey: options.storageKey } : {}),
  })

  let doc: IuiDocument = parse(options.source, { streaming: options.streaming === true })
  // The surface has to know the new document before anything is drawn from it.
  surface.update(doc)

  const write = (work: () => unknown): unknown =>
    guard(work, (message) => {
      options.onWarning?.(message)
      showToast(message, "danger")
    })

  let element: HTMLElement | null = null
  const invoke = (work: () => unknown): unknown => {
    if (!usesMorph(options.source)) return write(work)
    const ran = runMorph(
      () => element,
      async () => {
        write(work)
        // The transition takes its picture of the new page as soon as this returns.
        flush()
      }
    )
    return ran ? undefined : write(work)
  }

  let designSheet: { design: string | Design | undefined; css: string } | undefined
  const designText = () => {
    if (!designSheet || designSheet.design !== options.design) {
      designSheet = { design: options.design, css: designCss(options.design, id) }
    }
    return designSheet.css
  }
  let sheets: { key: string; css: string } | undefined
  const modelSheets = () => {
    const key = surface.styles.join("\u0000")
    if (sheets?.key !== key) sheets = { key, css: modelCss(surface.styles, id) }
    return sheets.css
  }

  const onBlockError = (error: unknown) =>
    report(error instanceof Error ? error.message : String(error))

  let announced: number | undefined
  let started: IuiDocument | undefined
  let region: HTMLElement | null = null
  let regionShown = false

  // Runs once what was drawn is on the page.
  const drawn = () => {
    if (!alive) return
    if (started !== doc) {
      started = doc
      // Queries written later in the stream exist only after a re-parse.
      surface.start()
      options.onDiagnostics?.(doc.diagnostics)
    }
    const version = surface.getVersion()
    if (announced !== version) {
      announced = version
      options.onStateChange?.(surface.snapshot())
    }
    const shown = toasts.length > 0
    if (shown !== regionShown) {
      regionShown = shown
      // The top layer keeps toasts in the viewport corner however the surface is
      // nested or clipped.
      try {
        if (shown) region?.showPopover?.()
        else region?.hidePopover?.()
      } catch {
        // A popover that is already in the wanted state throws; nothing to do.
      }
    }
  }

  function tree(): Child {
    const streaming = options.streaming === true
    const ctx: RenderContext = {
      surface,
      scope: surface.scope,
      slot: null,
      templateDepth: 0,
      options: {
        components: options.components ?? {},
        streaming,
        report,
        invoke,
        write,
        allowUrl: options.allowUrl,
      },
    }

    const blocks = renderNodes(doc.children, ctx).map((node, index) => {
      if (typeof node !== "object" || node === null || Array.isArray(node)) return node
      if (node.kind === "text") return node
      return component(
        Boundary,
        { resetKey: options.source, quiet: streaming, onError: onBlockError },
        node.key ?? index,
        [node]
      )
    })

    const design = designText()
    const sheet = modelSheets()
    return h(
      "div",
      {
        attrs: {
          class: options.class ? `iui-root ${options.class}` : "iui-root",
          "data-iui-id": id,
          "data-iui-scheme": options.scheme ?? "auto",
          "data-streaming": streaming ? "" : undefined,
        },
        hooks: {
          mounted: (target) => {
            element = target as HTMLElement
            drawn()
          },
          updated: drawn,
        },
      },
      [
        design ? h("style", { key: "design" }, styleText(design)) : null,
        sheet ? h("style", { key: "model" }, styleText(sheet)) : null,
        ...blocks,
        h(
          "div",
          {
            key: "toasts",
            attrs: {
              class: "iui-toasts",
              popover: "manual",
              role: "status",
              "aria-live": "polite",
            },
            hooks: {
              mounted: (target) => {
                region = target as HTMLElement
              },
            },
          },
          toasts.map((toast) =>
            h("div", { key: toast.id, attrs: { class: "iui-toast", "data-tone": toast.tone } }, [
              toast.message,
            ])
          )
        ),
      ]
    )
  }

  const unsubscribe = [surface.subscribe(redraw), subscribeUiSdk(redraw)]
  void getUiSdkVersion
  root.render(tree())

  return {
    getState: () => surface.snapshot(),
    setState: (values) => surface.patch(values),
    reset: (...names) => surface.reset(...names),
    refetch: (...ids) => surface.refetch(...ids),
    surface,
    update(next) {
      if (!alive) return
      const before = options
      options = { ...options, ...next }
      const streaming = options.streaming === true
      if (options.source !== before.source || streaming !== (before.streaming === true)) {
        doc = parse(options.source, { streaming })
        surface.update(doc)
      }
      root.render(tree())
    },
    flush,
    unmount() {
      if (!alive) return
      alive = false
      for (const stop of unsubscribe) stop()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      surface.stop()
      root.unmount()
      claim.release()
    },
  }
}
