<script setup lang="ts">
import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/vue"
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue"
// The demos, designs and the ticket system are the React playground's own files.
import { DEMOS } from "../../playground/src/demos"
import { THEMES } from "../../playground/src/themes"
import { createTicketTools } from "../../playground/src/tools"

const demo = shallowRef(DEMOS[0]!)
const themeId = ref(demo.value.theme ?? "paper")
const scheme = ref<"light" | "dark">("light")
const shown = ref(demo.value.source)
const streaming = ref(false)
const state = shallowRef<Record<string, unknown>>({})
const events = ref<{ id: number; kind: string; text: string }[]>([])
const surface = ref<IntelligentUIHandle | null>(null)

const theme = computed(() => THEMES.find((item) => item.id === themeId.value) ?? THEMES[0]!)
let tools = createTicketTools()
let timer: number | undefined
let nextId = 1

function note(kind: string, text: string) {
  events.value = [{ id: nextId++, kind, text }, ...events.value].slice(0, 40)
}

function stop() {
  window.clearInterval(timer)
  streaming.value = false
}

function pick(next: (typeof DEMOS)[number]) {
  stop()
  demo.value = next
  themeId.value = next.theme ?? "paper"
  tools = createTicketTools()
  shown.value = next.source
  events.value = []
}

/** Feeds the reply in a few characters at a time, the way a model would. */
function replay() {
  stop()
  const full = demo.value.source
  let length = 0
  shown.value = ""
  streaming.value = true
  timer = window.setInterval(() => {
    length = Math.min(full.length, length + 14)
    shown.value = full.slice(0, length)
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

watch(scheme, (value) => document.documentElement.setAttribute("data-scheme", value), {
  immediate: true,
})
onBeforeUnmount(stop)
</script>

<template>
  <div class="vd">
    <header class="vd-top">
      <strong>Open Intelligent UI</strong>
      <span class="vd-tag">Vue renderer</span>
      <span class="vd-grow" />
      <label>
        Design
        <select v-model="themeId">
          <option v-for="item in THEMES" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>
      <button type="button" @click="scheme = scheme === 'light' ? 'dark' : 'light'">
        {{ scheme === "light" ? "Dark" : "Light" }}
      </button>
      <button type="button" @click="streaming ? stop() : replay()">
        {{ streaming ? "Stop" : "Replay as a stream" }}
      </button>
      <button type="button" @click="surface?.reset()">Reset state</button>
    </header>

    <nav class="vd-side" aria-label="Demos">
      <button
        v-for="item in DEMOS"
        :key="item.id"
        type="button"
        :aria-current="item.id === demo.id"
        @click="pick(item)"
      >
        <strong>{{ item.title }}</strong>
        <span>{{ item.caption }}</span>
      </button>
    </nav>

    <main class="vd-main">
      <p class="vd-ask">{{ demo.prompt }}</p>
      <IntelligentUI
        :key="demo.id"
        ref="surface"
        class="vd-surface"
        :source="shown"
        :streaming="streaming"
        :design="theme.source"
        :scheme="scheme"
        :tools="tools"
        :on-action="onAction"
        :on-tool="onTool"
        :on-warning="(message: string) => note('warning', message)"
        :on-state-change="(next: Record<string, unknown>) => (state = next)"
      />
    </main>

    <aside class="vd-inspect">
      <h2>State</h2>
      <pre>{{ JSON.stringify(state, null, 2) }}</pre>
      <h2>Events</h2>
      <p v-if="events.length === 0" class="vd-dim">Actions, tool calls and warnings show up here.</p>
      <ul v-else>
        <li v-for="event in events" :key="event.id"><b>{{ event.kind }}</b> {{ event.text }}</li>
      </ul>
    </aside>
  </div>
</template>
