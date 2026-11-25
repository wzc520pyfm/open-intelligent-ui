<script setup lang="ts">
import type { Library, SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import * as designs from "@open-intelligent-ui/core/designs"
import { useData } from "vitepress"
import { type Component, computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue"
import { createTicketTools } from "../../../playground/src/tools"
import { wordsFor } from "./words"

const props = defineProps<{
  /** The markup, URI-encoded so it survives being an attribute. */
  source: string
  /** Uses the made-up product's components (`Steps`, `Person`, `PolicyCheck`). */
  product?: boolean
  /** Shows the design switch. */
  designs?: boolean
}>()

type DesignName = keyof typeof designs

const { isDark, lang } = useData()
const words = computed(() => wordsFor(lang.value))
const markup = computed(() => decodeURIComponent(props.source))

// The renderer is loaded in the browser only: it draws nothing on the server.
const Surface = shallowRef<Component | null>(null)
const library = shallowRef<Library<Component> | undefined>()
const shown = ref(markup.value)
const streaming = ref(false)
const design = ref<DesignName>("paper")
const round = ref(0)
const notes = ref<{ id: number; kind: string; text: string }[]>([])
let tools = createTicketTools(250)
let timer: number | undefined
let nextId = 1

function note(kind: string, text: string) {
  notes.value = [{ id: nextId++, kind, text }, ...notes.value].slice(0, 4)
}

function stop() {
  window.clearInterval(timer)
  streaming.value = false
}

/** Feeds the markup in a few characters at a time, the way a model's reply arrives. */
function replay() {
  stop()
  reset()
  const full = markup.value
  let length = 0
  shown.value = ""
  streaming.value = true
  timer = window.setInterval(() => {
    length = Math.min(full.length, length + 6)
    shown.value = full.slice(0, length)
    if (length === full.length) stop()
  }, 16)
}

function reset() {
  stop()
  tools = createTicketTools(250)
  notes.value = []
  shown.value = markup.value
  round.value += 1
}

function onAction(action: SurfaceAction) {
  if (action.type === "send") {
    const data = action.data === undefined ? "" : ` ${JSON.stringify(action.data)}`
    note(words.value.sent, `${action.text}${data}`)
    return true
  }
  return undefined
}

function onTool(event: ToolEvent) {
  if (event.status === "done" && event.kind === "write") note(words.value.called, event.tool)
}

onMounted(async () => {
  const [renderer, product] = await Promise.all([
    import("@open-intelligent-ui/vue"),
    props.product ? import("../../../playground/src/library/product") : undefined,
  ])
  library.value = product?.PRODUCT as Library<Component> | undefined
  Surface.value = renderer.IntelligentUI
})
onBeforeUnmount(stop)
</script>

<template>
  <div class="oi-live">
    <div class="oi-live-bar">
      <span class="oi-live-tag">{{ words.preview }}</span>
      <span class="oi-live-grow" />
      <label v-if="props.designs" class="oi-live-pick">
        {{ words.design }}
        <select v-model="design">
          <option v-for="name in Object.keys(designs)" :key="name" :value="name">
            {{ name[0]?.toUpperCase() + name.slice(1) }}
          </option>
        </select>
      </label>
      <button type="button" class="oi-live-button" @click="reset">{{ words.reset }}</button>
      <button type="button" class="oi-live-button" @click="replay">{{ words.replay }}</button>
    </div>
    <div class="oi-live-stage vp-raw">
      <component
        :is="Surface"
        v-if="Surface"
        :key="round"
        class="oi-live-surface"
        :source="shown"
        :streaming="streaming"
        :design="designs[design]"
        :scheme="isDark ? 'dark' : 'light'"
        :library="library"
        :tools="tools"
        :on-action="onAction"
        :on-tool="onTool"
        :on-warning="(message: string) => note(words.warned, message)"
      />
      <p v-else class="oi-live-wait">{{ words.loading }}</p>
    </div>
    <ul v-if="notes.length" class="oi-live-notes">
      <li v-for="item in notes" :key="item.id">
        <span class="oi-live-kind">{{ item.kind }}</span> {{ item.text }}
      </li>
    </ul>
    <div class="oi-live-code"><slot /></div>
  </div>
</template>
