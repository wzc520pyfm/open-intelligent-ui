import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { checkMarkup, repairMessage, type Issue } from "@open-intelligent-ui/core/check"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type CheckedReply = {
  text: string
  ok: boolean
  issues: Issue[]
}

const DEMO_REPLY = `<state bill={86} tip={18} people={4} />
<derive total={bill * (1 + tip / 100)} each={total / people} />

**Split the bill.** Each person pays {currency(each, "USD", 2)}.

<card padding={4} gap={3}>
  <row gap={3} wrap>
    <box gap={1}>
      <text size="sm" color="muted">Each</text>
      <text size="3xl" weight="bold" tabular>{currency(each, "USD", 2)}</text>
    </box>
    <spacer />
    <badge variant="soft">Tip {tip}%</badge>
  </row>
  <Slider min={0} max={30} step={1} bind:value={tip}>
    <row>
      <text size="sm" color="muted">Tip</text>
      <spacer />
      <text size="sm" tabular>{tip}%</text>
    </row>
    <SliderControl>
      <SliderTrack><SliderIndicator /><SliderThumb aria-label="Tip percent" /></SliderTrack>
    </SliderControl>
  </Slider>
  <Button variant="solid" on:click={send("Request " + currency(each, "USD", 2) + " from each of " + people, { each, people, total })}>
    Request the money
  </Button>
</card>
`

export const systemPrompt = buildSystemPrompt({
  instructions:
    "You are a helpful product assistant. Prefer a short operable interface over a long prose answer when the reader would calculate, choose or edit something.",
})

export function unwrapFence(text: string): string {
  const open = /^\s*```[a-z]*\n/i.exec(text)
  if (!open) return text
  return text.slice(open[0].length).replace(/\n```\s*$/, "")
}

export function checkReply(text: string): CheckedReply {
  const result = checkMarkup(unwrapFence(text))
  return { text: unwrapFence(text), ok: result.ok, issues: result.issues }
}

/** Local demo: no network. Still runs the checker so the wiring is real. */
export function demoReply(): CheckedReply {
  return checkReply(DEMO_REPLY)
}

export async function liveReply(
  history: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<CheckedReply> {
  const key = import.meta.env.VITE_OPENAI_API_KEY
  if (!key) {
    throw new Error("Set VITE_OPENAI_API_KEY in .env for Live, or use Demo reply.")
  }
  const base = (import.meta.env.VITE_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "")
  const model = import.meta.env.VITE_OPENAI_MODEL || "gpt-4.1"

  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...history]
  let reply = await streamChat({ base, model, key, messages, onChunk, signal })
  reply = unwrapFence(reply)
  let result = checkMarkup(reply)

  for (let round = 0; !result.ok && round < 2; round++) {
    messages.push({ role: "assistant", content: reply }, { role: "user", content: repairMessage(result) })
    onChunk("")
    reply = unwrapFence(await streamChat({ base, model, key, messages, onChunk, signal }))
    result = checkMarkup(reply)
  }

  return { text: reply, ok: result.ok, issues: result.issues }
}

async function streamChat(options: {
  base: string
  model: string
  key: string
  messages: ChatMessage[]
  onChunk: (text: string) => void
  signal?: AbortSignal
}): Promise<string> {
  const response = await fetch(`${options.base}/chat/completions`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${options.key}`,
    },
    body: JSON.stringify({
      model: options.model,
      stream: true,
      messages: options.messages,
    }),
  })
  if (!response.ok) {
    throw new Error(`Model request failed (${response.status}): ${(await response.text()).slice(0, 240)}`)
  }
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let text = ""
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf("\n")
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (data === "[DONE]") return text
      try {
        const json = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
        const chunk = json.choices?.[0]?.delta?.content
        if (chunk) {
          text += chunk
          options.onChunk(text)
        }
      } catch {
        // ignore keep-alives
      }
    }
  }
  return text
}
