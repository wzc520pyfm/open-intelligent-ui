<script lang="ts">
  import { imageView, type ViewProps } from "@open-intelligent-ui/core/renderer"
  import Nodes from "../render/Nodes.svelte"

  /** A picture that says so when it can't be loaded. */
  let props: ViewProps = $props()

  let failed = $state(false)
  const onError = () => {
    failed = true
  }
</script>

<Nodes nodes={imageView(props, { failed, onError })} />
