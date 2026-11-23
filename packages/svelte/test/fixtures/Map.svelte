<script lang="ts">
  import type { Snippet } from "svelte"

  let {
    city,
    zoom,
    onPick,
    children,
  }: { city?: string; zoom?: number; onPick?: (city?: string) => void; children?: Snippet } = $props()
</script>

<div data-testid="map" onclick={() => onPick?.(city)} role="presentation">{city}@{zoom}{@render children?.()}</div>
