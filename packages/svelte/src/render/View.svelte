<script lang="ts">
  import type { Snippet } from "svelte"
  import type { Draw, RenderNode } from "./node"
  import Nodes from "./Nodes.svelte"

  /**
   * One of the renderer's stateless parts as a component, for use outside a
   * surface. Inside one they are drawn straight into their parent's list.
   */
  let { draw, props }: { draw: Draw; props: Record<string, unknown> } = $props()

  const drawn = $derived.by(() => {
    const given: Record<string, unknown> = {}
    let content: RenderNode[] = []
    for (const [name, value] of Object.entries(props)) {
      if (name === "children") {
        if (typeof value === "function") content = [{ kind: "snippet", key: "0", snippet: value as Snippet }]
      } else if (!name.startsWith("$$")) given[name] = value
    }
    return draw(given, content)
  })
</script>

<Nodes nodes={drawn} />
