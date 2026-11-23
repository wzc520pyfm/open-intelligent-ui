<script lang="ts" module>
  /** What the last one drawn was given. */
  export const dumped: { props: Record<string, unknown> } = { props: {} }
</script>

<script lang="ts">
  const props: Record<string, unknown> = $props()
  $effect.pre(() => {
    dumped.props = { ...props }
  })
</script>

<output data-testid="dump">{Object.keys(props).sort().join(" ")}</output>
