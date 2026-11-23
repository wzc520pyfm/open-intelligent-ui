<script lang="ts">
  import type { WidgetSetup } from "@open-intelligent-ui/core"
  import { startWidget } from "@open-intelligent-ui/core/renderer"
  import { onDestroy, type Snippet, untrack } from "svelte"
  import { createAttachmentKey } from "svelte/attachments"
  import type { RenderNode } from "./node.js"
  import Nodes from "./Nodes.svelte"

  /**
   * A widget written with framework-neutral views, from a host's library.
   * The widget's own state lives in its closure; Svelte is only asked to
   * draw again when the widget says so.
   */
  let { setup, props }: { setup: WidgetSetup; props: Record<string, unknown> } = $props()

  let redrawn = $state(0)
  const instance = startWidget(
    untrack(() => setup),
    {
      redraw: () => {
        redrawn += 1
      },
      ref: (set) => ({
        [createAttachmentKey()]: (element: Element) => {
          set(element)
          return () => set(null)
        },
      }),
    }
  )
  onDestroy(() => instance.dispose())

  const drawn = $derived.by(() => {
    // Read so the widget's own changes draw it again.
    void redrawn
    const given: Record<string, unknown> = {}
    let content: RenderNode[] = []
    for (const [name, value] of Object.entries(props)) {
      if (name === "children") {
        if (typeof value === "function") content = [{ kind: "snippet", key: "0", snippet: value as Snippet }]
      } else if (!name.startsWith("$$") && !name.startsWith("bind:")) given[name] = value
    }
    return instance.draw(given, content)
  })
</script>

<Nodes nodes={drawn} />
