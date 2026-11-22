export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LiveSettings {
  /** An OpenAI-compatible endpoint, such as `https://api.openai.com/v1`. */
  baseUrl: string
  model: string
  apiKey: string
}

export interface StreamOptions extends LiveSettings {
  messages: ChatMessage[]
  signal?: AbortSignal
  fetch?: typeof fetch
}

/**
 * Streams a chat completion from an OpenAI-compatible endpoint, yielding the
 * text as it arrives. The key goes from this browser tab straight to the
 * endpoint; nothing else sees it.
 */
export async function* streamChat(options: StreamOptions): AsyncGenerator<string> {
  const request = options.fetch ?? fetch
  const response = await request(`${options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : null),
    },
    body: JSON.stringify({ model: options.model, messages: options.messages, stream: true }),
    signal: options.signal ?? null,
  })
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "")
    throw new Error(`The model endpoint answered ${response.status}. ${readError(detail)}`.trim())
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
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
      if (data === "[DONE]") return
      const text = readDelta(data)
      if (text) yield text
    }
  }
}

function readDelta(data: string): string {
  try {
    const parsed = JSON.parse(data) as {
      choices?: { delta?: { content?: unknown } }[]
    }
    const content = parsed.choices?.[0]?.delta?.content
    return typeof content === "string" ? content : ""
  } catch {
    return ""
  }
}

function readError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } }
    return typeof parsed.error?.message === "string" ? parsed.error.message : ""
  } catch {
    return body.slice(0, 200)
  }
}

/**
 * Models sometimes wrap the whole reply in a code fence despite being told
 * not to. This drops an opening fence, and a closing one once it arrives.
 */
export function unwrapFence(text: string): string {
  const open = /^\s*```[a-z]*\n/i.exec(text)
  if (!open) return text
  const body = text.slice(open[0].length)
  return body.replace(/\n```\s*$/, "")
}
