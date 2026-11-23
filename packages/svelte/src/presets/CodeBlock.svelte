<script lang="ts">
  import {
    COPIED_LIFETIME,
    codeText,
    codeView,
    copyCode,
    type ViewProps,
  } from "@open-intelligent-ui/core/renderer"
  import Nodes from "../render/Nodes.svelte"

  /** Code with its language and a copy button. */
  let props: ViewProps = $props()

  let copied = $state(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  $effect(() => () => clearTimeout(timer))

  const code = $derived(codeText(props, undefined))
  const onCopy = () =>
    copyCode(props, code, () => {
      copied = true
      clearTimeout(timer)
      timer = setTimeout(() => {
        copied = false
      }, COPIED_LIFETIME)
    })
</script>

<Nodes nodes={codeView(props, { code, copied, onCopy })} />
