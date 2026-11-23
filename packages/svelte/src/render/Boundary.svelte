<script lang="ts">
  import { type Snippet, untrack } from "svelte"

  /**
   * Catches a block that fails to render, so one bad component doesn't take
   * down the rest of the surface.
   */
  let {
    resetKey,
    quiet = false,
    onError,
    children,
  }: {
    /** When this changes, a failed block is tried again. */
    resetKey: string
    /** While streaming, a broken block stays hidden instead of showing an error. */
    quiet?: boolean
    onError?: (error: unknown) => void
    children: Snippet
  } = $props()

  let retry: (() => void) | undefined

  $effect.pre(() => {
    void resetKey
    untrack(() => {
      const again = retry
      retry = undefined
      again?.()
    })
  })

  const caught = (error: unknown, reset: () => void) => {
    retry = reset
    onError?.(error)
  }

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error))
</script>

<svelte:boundary onerror={caught}
  >{@render children()}{#snippet failed(error)}{#if quiet}<span class="iui-pending" aria-hidden="true"
      ></span>{:else}<div class="iui-error" role="note"
        ><strong>This part couldn't be shown.</strong><span>{message(error)}</span></div
      >{/if}{/snippet}</svelte:boundary
>
