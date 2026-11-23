<script lang="ts">
  import { exitAnimations } from "@open-intelligent-ui/core/renderer"
  import { type Snippet, tick, untrack } from "svelte"

  /**
   * Keeps its child on screen while the exit animation plays. The child gets
   * `data-iui-exit` on its wrapper during that time, and is removed once every
   * animation inside that ends has finished.
   */
  let { show, children }: { show: boolean; children: Snippet } = $props()

  let mounted = $state(untrack(() => show))
  let exiting = $state(false)
  let element = $state<HTMLElement | null>(null)
  let shown = untrack(() => show)
  let run = 0

  $effect.pre(() => {
    const next = show
    if (next === shown) return
    shown = next
    untrack(() => {
      const mine = ++run
      if (next) {
        mounted = true
        exiting = false
        return
      }
      if (!mounted) return
      exiting = true
      const done = () => {
        if (run !== mine) return
        mounted = false
        exiting = false
      }
      // The exit styles have to be applied before their animations exist.
      void tick().then(() => {
        if (run !== mine) return
        const exit = exitAnimations(element)
        if (exit) void exit.then(done)
        else done()
      })
    })
  })
</script>

{#if mounted}<span bind:this={element} class="iui-presence" data-iui-exit={exiting ? "" : undefined}
    >{@render children()}</span
  >{/if}
