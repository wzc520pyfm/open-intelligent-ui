<script lang="ts">
  let { label = "Count" }: { label?: string } = $props()
  let count = $state(0)
</script>

<button onclick={() => (count += 1)}>{label} {count}</button>
