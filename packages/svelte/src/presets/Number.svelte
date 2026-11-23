<script lang="ts">
  import { numberTarget, numberView, type ViewProps } from "@open-intelligent-ui/core/renderer"
  import Nodes from "../render/Nodes.svelte"
  import { useTween } from "./tween.svelte.js"

  /** A number that counts up or down to its new value. */
  let props: ViewProps = $props()

  const goal = $derived(numberTarget(props))
  const tween = useTween(
    () => [goal.target],
    () => goal.duration
  )
</script>

<Nodes nodes={numberView(props, tween.current()[0] ?? goal.target)} />
