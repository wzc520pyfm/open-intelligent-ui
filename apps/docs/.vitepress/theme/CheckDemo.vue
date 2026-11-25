<script setup lang="ts">
import { type CheckResult, checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"
import { useData } from "vitepress"
import { computed, ref } from "vue"
import { wordsFor } from "./words"

const SAMPLES: { name: string; source: string }[] = [
  {
    name: "JSX habits",
    source: `<state count={0} open={false} />

<row gap={2}>
  <Button onClick={() => setCount(count + 1)}>Add one</Button>
  <text bold>{count}</text>
</row>

{open && <card>Details</card>}
`,
  },
  {
    name: "Another library's tags",
    source: `<state tab="week" />

<Stack spacing={4}>
  <Heading>Sales</Heading>
  <TabsPanel value="week">This week</TabsPanel>
  <Chart type="bars" values={[3, 5, 8]} />
</Stack>
`,
  },
  {
    name: "Names and tools",
    source: `<state amount={1200} />
<derive fee={amount * rate} />
<query id="orders" tool="listOrders" />

Fee: {currency(fee)} on {orders.data.length} orders, as of {fee.toLocaleDateString()}.

<Button on:click={fee = 0}>Waive the fee</Button>
`,
  },
  {
    name: "Cut short",
    source: `<state step={1} />

<card padding={4}>
  <title level={3}>Step {step} of 3</title>
  <row gap={2}>
    <Button on:click={step = step - 1}>Back</Button>
    <Button variant="solid" on:click={step = step + 1}>Next</But`,
  },
  {
    name: "A correct reply",
    source: `<state guests={2} />
<derive total={guests * 48} />

**{guests} guests, {currency(total)}.**

<row gap={2} align="center">
  <Button on:click={guests = max(guests - 1, 1)}>Fewer</Button>
  <Button variant="solid" on:click={guests = guests + 1}>More</Button>
</row>
`,
  },
]

const { lang } = useData()
const words = computed(() => wordsFor(lang.value))
const source = ref(SAMPLES[0]?.source ?? "")
const area = ref<HTMLTextAreaElement | null>(null)

const result = computed<CheckResult>(() => checkMarkup(source.value, { tools: ["listTickets", "updateTicket"] }))
const repair = computed(() => repairMessage(result.value))

/** Selects the line an issue is about, so it can be seen and fixed. */
function show(line: number) {
  const element = area.value
  if (!element) return
  const lines = source.value.split("\n")
  const start = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0)
  element.focus()
  element.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
}
</script>

<template>
  <div class="oi-check">
    <div class="oi-live-bar">
      <span class="oi-live-tag">checkMarkup()</span>
      <span class="oi-live-grow" />
      <span class="oi-check-label">{{ words.samples }}</span>
      <button
        v-for="sample in SAMPLES"
        :key="sample.name"
        type="button"
        class="oi-live-button"
        :aria-pressed="source === sample.source"
        @click="source = sample.source"
      >
        {{ sample.name }}
      </button>
    </div>
    <textarea
      ref="area"
      v-model="source"
      class="oi-check-source"
      spellcheck="false"
      rows="12"
      aria-label="Markup to check"
    />
    <div class="oi-check-result" :data-ok="result.ok">
      <p class="oi-check-summary">
        {{ result.issues.length ? words.found(result.errors, result.warnings) : words.clean }}
      </p>
      <ol v-if="result.issues.length" class="oi-check-issues">
        <li v-for="(issue, index) in result.issues" :key="index" :data-severity="issue.severity">
          <button type="button" class="oi-check-line" @click="show(issue.line)">{{ words.line(issue.line) }}</button>
          <code class="oi-check-code">{{ issue.code }}</code>
          <span>{{ issue.message }}</span>
          <span v-if="issue.hint" class="oi-check-hint">{{ issue.hint }}</span>
        </li>
      </ol>
    </div>
    <details class="oi-check-repair">
      <summary>{{ words.repair }}</summary>
      <pre v-if="repair">{{ repair }}</pre>
      <p v-else>{{ words.noRepair }}</p>
    </details>
  </div>
</template>
