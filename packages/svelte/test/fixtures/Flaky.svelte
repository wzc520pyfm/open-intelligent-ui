<script lang="ts" module>
  export const flaky = { broken: true }
</script>

<script lang="ts">
  if (flaky.broken) throw new Error("boom")
</script>

<span>fine</span>
