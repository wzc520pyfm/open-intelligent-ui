<script lang="ts">
  /** Takes no props of its own: everything it is given lands on its element. */
  let { ...rest }: Record<string, unknown> = $props()
</script>

<a href="https://example.com/a" {...rest}>plain</a>
