<script lang="ts" module>
  import type {
    Design,
    Diagnostic,
    StorageLike,
    Surface as SurfaceType,
    SurfaceAction,
    Tool,
    ToolEvent,
  } from "@open-intelligent-ui/core"
  import type { AnyComponent } from "./render/node.js"

  /** What `bind:this` on `<IntelligentUI>` gives you. */
  export interface IntelligentUIHandle {
    /** The surface's current state, as plain data. */
    getState(): Record<string, unknown>
    /** Writes state, as if the user had changed it. */
    setState(values: Record<string, unknown>): void
    /** Puts state back to its declared starting values. */
    reset(...names: string[]): void
    /** Reloads the named queries, or all of them. */
    refetch(...ids: string[]): void
    readonly surface: SurfaceType
  }

  /** The props `<IntelligentUI>` takes. */
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
    style?: string
  }
</script>

<script lang="ts">
  import { parse, Surface } from "@open-intelligent-ui/core"
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
  import { flushSync, onMount, untrack } from "svelte"
  import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk.js"
  import Boundary from "./render/Boundary.svelte"
  import Nodes from "./render/Nodes.svelte"
  import { type RenderContext, renderNodes } from "./render/render.js"

  /**
   * Renders IUI markup: Markdown, layout primitives, UI SDK components and
   * preset widgets, with the state, queries and actions the markup declares.
   */
  let {
    source,
    streaming = false,
    design,
    scheme = "auto",
    components,
    tools,
    callTool,
    onAction,
    onTool,
    onWarning,
    onDiagnostics,
    onStateChange,
    initialState,
    functions,
    actions,
    locale,
    currency,
    storage,
    storageKey,
    allowUrl,
    class: className,
    style,
  }: IntelligentUIProps = $props()

  const uid = $props.id()
  const id = uid.replace(/[^A-Za-z0-9]/g, "")

  let toasts = $state.raw<Toast[]>([])
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const reported = new Set<string>()
  let toastId = 0

  const showToast = (message: string, tone?: string) => {
    const toast: Toast = { id: ++toastId, message, tone }
    toasts = [...toasts.slice(1 - TOAST_LIMIT), toast]
    const timer = setTimeout(() => {
      timers.delete(timer)
      toasts = toasts.filter((item) => item.id !== toast.id)
    }, TOAST_LIFETIME)
    timers.add(timer)
  }

  // The top layer keeps toasts in the viewport corner however the surface is
  // nested or clipped.
  let toastRegion = $state<HTMLElement | null>(null)
  $effect(() => {
    const shown = toasts.length > 0
    try {
      if (shown) toastRegion?.showPopover?.()
      else toastRegion?.hidePopover?.()
    } catch {
      // A popover that is already in the wanted state throws; nothing to do.
    }
  })

  const report = (message: string) => {
    if (reported.has(message)) return
    reported.add(message)
    queueMicrotask(() => onWarning?.(message))
  }

  const first = untrack(() => ({ functions, actions, initialState, locale, currency, storage, storageKey }))

  export const surface: SurfaceType = new Surface({
    callTool: (name, input) => {
      if (tools && Object.hasOwn(tools, name)) return (tools[name] as Tool)(input)
      if (callTool) return callTool(name, input)
      throw new Error(`No tool named "${name}" is available`)
    },
    onAction: (action) => {
      if (onAction?.(action) === true) return
      if (action.type === "toast") showToast(action.message, action.tone)
      else if (action.type === "copy") copyText(action.text)
      else if (action.type === "open") openUrl(action.url)
    },
    onTool: (event) => onTool?.(event),
    onWarning: (message) => report(message),
    ...(first.functions ? { functions: first.functions } : {}),
    ...(first.actions ? { actions: first.actions } : {}),
    ...(first.initialState ? { initialState: first.initialState } : {}),
    ...(first.locale ? { locale: first.locale } : {}),
    ...(first.currency ? { currency: first.currency } : {}),
    ...(first.storage ? { storage: first.storage } : {}),
    ...(first.storageKey ? { storageKey: first.storageKey } : {}),
  })

  /** The surface's current state, as plain data. */
  export function getState(): Record<string, unknown> {
    return surface.snapshot()
  }

  /** Writes state, as if the user had changed it. */
  export function setState(values: Record<string, unknown>): void {
    surface.patch(values)
  }

  /** Puts state back to its declared starting values. */
  export function reset(...names: string[]): void {
    surface.reset(...names)
  }

  /** Reloads the named queries, or all of them. */
  export function refetch(...ids: string[]): void {
    surface.refetch(...ids)
  }

  const doc = $derived.by(() => {
    const parsed = parse(source, { streaming })
    // The surface has to know the new document before anything is drawn from it.
    surface.update(parsed)
    return parsed
  })

  // The surface and the UI SDK registry keep their own state; these two
  // numbers are how Svelte hears that it changed.
  let version = $state(surface.getVersion())
  let loaded = $state(getUiSdkVersion())

  onMount(() => {
    const stops = [
      surface.subscribe(() => {
        version = surface.getVersion()
      }),
      subscribeUiSdk(() => {
        loaded = getUiSdkVersion()
      }),
    ]
    version = surface.getVersion()
    loaded = getUiSdkVersion()
    return () => {
      for (const stop of stops) stop()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      surface.stop()
    }
  })

  $effect(() => {
    const next = doc
    untrack(() => {
      // Queries written later in the stream exist only after a re-parse.
      surface.start()
      onDiagnostics?.(next.diagnostics)
    })
  })

  $effect(() => {
    void version
    untrack(() => onStateChange?.(surface.snapshot()))
  })

  const write = (work: () => unknown): unknown =>
    guard(work, (message) => {
      onWarning?.(message)
      showToast(message, "danger")
    })

  let root = $state<HTMLElement | null>(null)
  const invoke = (work: () => unknown): unknown => {
    if (!usesMorph(source)) return write(work)
    const ran = runMorph(
      () => root,
      () => {
        write(work)
        // The transition pictures the surface once this returns.
        flushSync()
      }
    )
    return ran ? undefined : write(work)
  }

  const designSheet = $derived(designCss(design, id))
  let sheets: { key: string; css: string } | undefined
  const modelSheet = $derived.by(() => {
    void doc
    void version
    const key = surface.styles.join("\u0000")
    if (sheets?.key !== key) sheets = { key, css: modelCss(surface.styles, id) }
    return sheets.css
  })

  const onBlockError = (error: unknown) => report(error instanceof Error ? error.message : String(error))

  const blocks = $derived.by(() => {
    // Reading these is what makes a state change or a loaded component draw again.
    void version
    void loaded

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
        write,
        allowUrl,
      },
    }

    return renderNodes(doc.children, ctx).map((node, index) =>
      typeof node === "string" ? { key: `#${index}`, text: node } : { key: node.key, node }
    )
  })
</script>

<div
  bind:this={root}
  class={className ? `iui-root ${className}` : "iui-root"}
  {style}
  data-iui-id={id}
  data-iui-scheme={scheme}
  data-streaming={streaming ? "" : undefined}
  >{#if designSheet}<svelte:element this={"style"}>{styleText(designSheet)}</svelte:element
    >{/if}{#if modelSheet}<svelte:element this={"style"}>{styleText(modelSheet)}</svelte:element
    >{/if}{#each blocks as block (block.key)}{#if block.node}<Boundary
        resetKey={source}
        quiet={streaming}
        onError={onBlockError}><Nodes nodes={block.node} /></Boundary
      >{:else}{block.text}{/if}{/each}<div
    bind:this={toastRegion}
    class="iui-toasts"
    popover="manual"
    role="status"
    aria-live="polite"
    >{#each toasts as toast (toast.id)}<div class="iui-toast" data-tone={toast.tone}>{toast.message}</div
      >{/each}</div
  ></div
>
