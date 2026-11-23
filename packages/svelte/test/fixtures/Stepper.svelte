<script lang="ts">
  let { value = $bindable(0) }: { value?: number } = $props()
</script>

<button onclick={() => (value += 1)}>Step {value}</button>
