<script lang="ts">
  import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
  import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/svelte"
  import { onDestroy } from "svelte"
  // The demos, designs and the ticket system are the React playground's own files.
  import { DEMOS } from "../../playground/src/demos"
  import { THEMES } from "../../playground/src/themes"
  import { createTicketTools } from "../../playground/src/tools"

  type Demo = (typeof DEMOS)[number]

  let demo = $state.raw(DEMOS[0] as Demo)
  let themeId = $state((DEMOS[0] as Demo).theme ?? "paper")
  let scheme = $state<"light" | "dark">("light")
  let shown = $state((DEMOS[0] as Demo).source)
  let streaming = $state(false)
  let snapshot = $state.raw<Record<string, unknown>>({})
  let events = $state.raw<{ id: number; kind: string; text: string }[]>([])
  let surface = $state<IntelligentUIHandle>()

  const theme = $derived(THEMES.find((item) => item.id === themeId) ?? THEMES[0])
  let tools = $state.raw(createTicketTools())
  let timer: number | undefined
  let nextId = 1

  function note(kind: string, text: string) {
    events = [{ id: nextId++, kind, text }, ...events].slice(0, 40)
  }

  function stop() {
    window.clearInterval(timer)
    streaming = false
  }

  function pick(next: Demo) {
    if (next.id === demo.id) return
    stop()
    demo = next
    themeId = next.theme ?? "paper"
    tools = createTicketTools()
    shown = next.source
    events = []
  }

  /** Feeds the reply in a few characters at a time, the way a model would. */
  function replay() {
    stop()
    const full = demo.source
    let length = 0
    shown = ""
    streaming = true
    timer = window.setInterval(() => {
      length = Math.min(full.length, length + 14)
      shown = full.slice(0, length)
      if (length === full.length) stop()
    }, 16)
  }

  function onAction(action: SurfaceAction) {
    if (action.type === "send") note("send", `${action.text} ${JSON.stringify(action.data ?? {})}`)
    else note(action.type, "url" in action ? action.url : "text" in action ? action.text : "")
    return undefined
  }

  function onTool(event: ToolEvent) {
    if (event.status !== "start") note(`tool ${event.status}`, `${event.tool} (${event.kind})`)
  }

  $effect(() => {
    document.documentElement.setAttribute("data-scheme", scheme)
  })
  onDestroy(stop)
</script>

<div class="sd">
  <header class="sd-top">
    <strong>Open Intelligent UI</strong>
    <span class="sd-tag">Svelte renderer</span>
    <span class="sd-grow"></span>
    <label>
      Design
      <select bind:value={themeId}>
        {#each THEMES as item (item.id)}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
    </label>
    <button type="button" onclick={() => (scheme = scheme === "light" ? "dark" : "light")}>
      {scheme === "light" ? "Dark" : "Light"}
    </button>
    <button type="button" onclick={() => (streaming ? stop() : replay())}>
      {streaming ? "Stop" : "Replay as a stream"}
    </button>
    <button type="button" onclick={() => surface?.reset()}>Reset state</button>
  </header>

  <nav class="sd-side" aria-label="Demos">
    {#each DEMOS as item (item.id)}
      <button type="button" aria-current={item.id === demo.id} onclick={() => pick(item)}>
        <strong>{item.title}</strong>
        <span>{item.caption}</span>
      </button>
    {/each}
  </nav>

  <main class="sd-main">
    <p class="sd-ask">{demo.prompt}</p>
    {#key demo.id}
      <IntelligentUI
        bind:this={surface}
        class="sd-surface"
        source={shown}
        {streaming}
        design={theme?.source}
        {scheme}
        {tools}
        {onAction}
        {onTool}
        onWarning={(message) => note("warning", message)}
        onStateChange={(next) => (snapshot = next)}
      />
    {/key}
  </main>

  <aside class="sd-inspect">
    <h2>State</h2>
    <pre>{JSON.stringify(snapshot, null, 2)}</pre>
    <h2>Events</h2>
    {#if events.length === 0}
      <p class="sd-dim">Actions, tool calls and warnings show up here.</p>
    {:else}
      <ul>
        {#each events as event (event.id)}
          <li><b>{event.kind}</b> {event.text}</li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>
