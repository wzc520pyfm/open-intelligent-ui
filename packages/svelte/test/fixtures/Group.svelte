<svelte:options namespace="svg" />

<script lang="ts">
  import type { Snippet } from "svelte"

  /** A host's part that belongs inside a drawing. */
  let { children }: { children?: Snippet } = $props()
</script>

<g data-group>{@render children?.()}</g>
