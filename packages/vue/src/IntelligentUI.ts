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
import {
  type Component,
  computed,
  defineComponent,
  h,
  isVNode,
  nextTick,
  onBeforeUnmount,
  onMounted,
  type PropType,
  ref,
  shallowRef,
  watch,
} from "vue"
import { getUiSdkVersion, subscribeUiSdk } from "./registry/ui-sdk"
import { Boundary } from "./render/Boundary"
import { type RenderContext, renderNodes } from "./render/render"
import { usePageId } from "./render/usePageId"

/** What a template ref to `<IntelligentUI>` gives you. */
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

type Scheme = "light" | "dark" | "auto"

/**
 * Renders IUI markup: Markdown, layout primitives, UI SDK components and
 * preset widgets, with the state, queries and actions the markup declares.
 */
export const IntelligentUI = defineComponent({
  name: "IntelligentUI",
  props: {
    /** IUI markup written by the model. May be incomplete while `streaming`. */
    source: { type: String, required: true },
    /** True while `source` is still arriving. */
    streaming: { type: Boolean, default: false },
    /** A DESIGN.md document, or one already read with `parseDesign`. */
    design: { type: [String, Object] as PropType<string | Design>, default: undefined },
    /** Which colors to use when the design has both. Defaults to `auto`. */
    scheme: { type: String as PropType<Scheme>, default: "auto" },
    /** Your own components, usable in markup by their PascalCase name. */
    components: { type: Object as PropType<Record<string, Component>>, default: undefined },
    /**
     * What your product adds, made with `defineLibrary`: components with
     * their descriptions, the engines that draw charts and play motion, and
     * the design. Give the same library to `buildSystemPrompt`.
     */
    library: { type: Object as PropType<Library<Component>>, default: undefined },
    /** Functions the surface reads with `<query>` and writes with `call()`. */
    tools: { type: Object as PropType<Record<string, Tool>>, default: undefined },
    /** Called for tools not found in `tools`. */
    callTool: {
      type: Function as PropType<(name: string, input: unknown) => unknown>,
      default: undefined,
    },
    /**
     * Called when the surface sends a message, opens a link, copies text or
     * shows a toast. Return `true` to replace the built-in handling.
     */
    onAction: {
      type: Function as PropType<(action: SurfaceAction) => boolean | undefined>,
      default: undefined,
    },
    onTool: { type: Function as PropType<(event: ToolEvent) => void>, default: undefined },
    /** Problems in the markup: unknown components, bad expressions, failed actions. */
    onWarning: { type: Function as PropType<(message: string) => void>, default: undefined },
    /** Parse problems for the current source. */
    onDiagnostics: {
      type: Function as PropType<(diagnostics: Diagnostic[]) => void>,
      default: undefined,
    },
    onStateChange: {
      type: Function as PropType<(state: Record<string, unknown>) => void>,
      default: undefined,
    },
    initialState: { type: Object as PropType<Record<string, unknown>>, default: undefined },
    /** Extra pure functions for expressions. */
    functions: {
      type: Object as PropType<Record<string, (...args: never[]) => unknown>>,
      default: undefined,
    },
    /** Extra actions for event handlers. */
    actions: {
      type: Object as PropType<Record<string, (...args: never[]) => unknown>>,
      default: undefined,
    },
    locale: { type: String, default: undefined },
    currency: { type: String, default: undefined },
    /** Where `<state persist>` values are kept. Needs `storageKey`. */
    storage: { type: Object as PropType<StorageLike>, default: undefined },
    storageKey: { type: String, default: undefined },
    /** Return false to refuse a link or media URL. */
    allowUrl: {
      type: Function as PropType<(url: string, kind: "link" | "media") => boolean>,
      default: undefined,
    },
  },
  setup(props, { expose }) {
    const id = usePageId((raw) => raw.replace(/[^A-Za-z0-9]/g, ""))
    const toasts = shallowRef<Toast[]>([])
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const reported = new Set<string>()
    let toastId = 0
    let stableBlocks: ReturnType<typeof renderNodes> = []

    const showToast = (message: string, tone?: string) => {
      const toast: Toast = { id: ++toastId, message, tone }
      toasts.value = [...toasts.value.slice(1 - TOAST_LIMIT), toast]
      const timer = setTimeout(() => {
        timers.delete(timer)
        toasts.value = toasts.value.filter((item) => item.id !== toast.id)
      }, TOAST_LIFETIME)
      timers.add(timer)
    }

    // The top layer keeps toasts in the viewport corner however the surface is
    // nested or clipped.
    const toastRegion = ref<HTMLElement | null>(null)
    watch(
      () => toasts.value.length > 0,
      (shown) => {
        try {
          if (shown) toastRegion.value?.showPopover?.()
          else toastRegion.value?.hidePopover?.()
        } catch {
          // A popover that is already in the wanted state throws; nothing to do.
        }
      },
      { flush: "post" }
    )

    const report = (message: string) => {
      if (reported.has(message)) return
      reported.add(message)
      queueMicrotask(() => props.onWarning?.(message))
    }

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
        else if (action.type === "open") openUrl(action.url, props.allowUrl)
      },
      onTool: (event) => props.onTool?.(event),
      onWarning: (message) => report(message),
      ...(props.functions ? { functions: props.functions } : {}),
      ...(props.actions ? { actions: props.actions } : {}),
      ...(props.initialState ? { initialState: props.initialState } : {}),
      ...(props.locale ? { locale: props.locale } : {}),
      ...(props.currency ? { currency: props.currency } : {}),
      ...(props.storage ? { storage: props.storage } : {}),
      ...(props.storageKey ? { storageKey: props.storageKey } : {}),
    })

    const doc = computed(() => parse(props.source, { streaming: props.streaming }))
    // The surface has to know the new document before anything is drawn from it.
    watch(doc, (next) => surface.update(next), { immediate: true, flush: "sync" })

    // The surface and the UI SDK registry keep their own state; these two
    // numbers are how Vue hears that it changed.
    const version = shallowRef(surface.getVersion())
    const loaded = shallowRef(getUiSdkVersion())
    const unsubscribe: (() => void)[] = []

    let announced = -1
    const announce = () => {
      const current = surface.getVersion()
      if (current === announced) return
      announced = current
      props.onStateChange?.(surface.snapshot())
    }

    onMounted(() => {
      unsubscribe.push(
        surface.subscribe(() => {
          version.value = surface.getVersion()
        }),
        subscribeUiSdk(() => {
          loaded.value = getUiSdkVersion()
        })
      )
      version.value = surface.getVersion()
      loaded.value = getUiSdkVersion()
      surface.start()
      announce()
      props.onDiagnostics?.(doc.value.diagnostics)
    })

    watch(version, announce, { flush: "post" })
    watch(
      doc,
      (next) => {
        // Queries written later in the stream exist only after a re-parse.
        surface.start()
        // State the new piece declared changed the surface without a notice.
        announce()
        props.onDiagnostics?.(next.diagnostics)
      },
      { flush: "post" }
    )

    onBeforeUnmount(() => {
      for (const stop of unsubscribe) stop()
      for (const timer of timers) clearTimeout(timer)
      timers.clear()
      surface.stop()
    })

    const handle: IntelligentUIHandle = {
      getState: () => surface.snapshot(),
      setState: (values) => surface.patch(values),
      reset: (...names) => surface.reset(...names),
      refetch: (...ids) => surface.refetch(...ids),
      surface,
    }
    expose(handle)

    const write = (work: () => unknown): unknown =>
      guard(work, (message) => {
        props.onWarning?.(message)
        showToast(message, "danger")
      })

    const root = ref<HTMLElement | null>(null)
    const invoke = (work: () => unknown): unknown => {
      if (!usesMorph(props.source)) return write(work)
      const ran = runMorph(
        () => root.value,
        async () => {
          write(work)
          // Vue draws on its next tick; the transition waits for that.
          await nextTick()
        }
      )
      return ran ? undefined : write(work)
    }

    const design = computed(() => designCss(props.design ?? props.library?.design, id))

    let detachMotion = () => {}
    watch(
      [root, () => props.library?.motion],
      ([element, motion]) => {
        detachMotion()
        detachMotion = attachMotion(element, motion)
      },
      // As soon as the surface is in the page, so nothing shows at rest and then plays its entrance.
      { flush: "post" }
    )
    onBeforeUnmount(() => detachMotion())
    let sheets: { key: string; css: string } | undefined
    const modelSheets = () => {
      // Keep the last closed sheet while a `<style>` tag is mid-stream.
      if (surface.styles.length === 0 && props.streaming && sheets) return sheets.css
      const key = surface.styles.join("\u0000")
      if (sheets?.key !== key) sheets = { key, css: modelCss(surface.styles, id) }
      return sheets.css
    }

    const onBlockError = (error: unknown) =>
      report(error instanceof Error ? error.message : String(error))

    return () => {
      // Reading these is what makes a state change or a loaded component draw again.
      void version.value
      void loaded.value

      const ctx: RenderContext = {
        surface,
        scope: surface.scope,
        slot: null,
        templateDepth: 0,
        options: {
          components: props.components ?? {},
          library: props.library,
          streaming: props.streaming,
          report,
          invoke,
          write,
          allowUrl: props.allowUrl,
        },
      }

      const blocks = renderNodes(doc.value.children, ctx).map((node, index) => {
        if (!isVNode(node)) return node
        return h(
          Boundary,
          {
            key: node.key ?? index,
            resetKey: props.source,
            quiet: props.streaming,
            onError: onBlockError,
          },
          { default: () => [node] }
        )
      })
      if (blocks.length > 0 || !props.streaming) stableBlocks = blocks
      const visible = props.streaming && blocks.length === 0 ? stableBlocks : blocks

      const sheet = modelSheets()
      return h(
        "div",
        {
          ref: root,
          class: "iui-root",
          "data-iui-id": id,
          "data-iui-scheme": props.scheme,
          "data-streaming": props.streaming ? "" : undefined,
          "data-empty": visible.length === 0 ? "" : undefined,
        },
        [
          design.value ? h("style", { key: "design" }, styleText(design.value)) : null,
          sheet ? h("style", { key: "model" }, styleText(sheet)) : null,
          ...visible,
          h(
            "div",
            {
              key: "toasts",
              ref: toastRegion,
              class: "iui-toasts",
              popover: "manual",
              role: "status",
              "aria-live": "polite",
            },
            toasts.value.map((toast) =>
              h("div", { key: toast.id, class: "iui-toast", "data-tone": toast.tone }, [
                toast.message,
              ])
            )
          ),
        ]
      )
    }
  },
})

/** The props `<IntelligentUI>` takes. */
export type IntelligentUIProps = InstanceType<typeof IntelligentUI>["$props"]
