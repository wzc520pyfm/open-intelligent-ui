<script lang="ts">
  let { value = 0, onValueChange }: { value?: number; onValueChange?: (value: number) => void } = $props()
</script>

<button onclick={() => onValueChange?.(value + 1)}>Rated {value}</button>
