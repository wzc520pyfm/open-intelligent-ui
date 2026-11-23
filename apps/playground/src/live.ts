export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/** Which protocol the endpoint speaks. */
export type ApiKind = "openai" | "anthropic"

export type ProviderId = "openai" | "anthropic" | "deepseek" | "custom"

export interface ProviderPreset {
  id: ProviderId
  /** English label; Chinese lives in the i18n table. */
  label: string
  api: ApiKind
  /** Empty for Custom — the reader fills it in. */
  baseUrl: string
  /** Suggested model name; the reader can change it. */
  model: string
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "openai",
    label: "OpenAI",
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    api: "openai",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  {
    id: "custom",
    label: "Custom",
    api: "openai",
    baseUrl: "",
    model: "",
  },
]

export function providerById(id: string | undefined): ProviderPreset {
  return PROVIDERS.find((item) => item.id === id) ?? (PROVIDERS[0] as ProviderPreset)
}

export interface LiveSettings {
  provider: ProviderId
  /**
   * Endpoint root. For OpenAI-compatible providers this is the `/v1` (or
   * equivalent) prefix; for Anthropic it is the host, e.g.
   * `https://api.anthropic.com`.
   */
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
 * Streams a chat completion, yielding the text as it arrives. Speaks either
 * the OpenAI Chat Completions protocol or Anthropic Messages. The key goes
 * from this browser tab straight to the endpoint; nothing else sees it.
 */
export async function* streamChat(options: StreamOptions): AsyncGenerator<string> {
  const preset = providerById(options.provider)
  if (preset.api === "anthropic") {
    yield* streamAnthropic(options)
    return
  }
  yield* streamOpenAI(options)
}

async function* streamOpenAI(options: StreamOptions): AsyncGenerator<string> {
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
  yield* readSse(response.body, (data) => {
    try {
      const parsed = JSON.parse(data) as {
        choices?: { delta?: { content?: unknown } }[]
      }
      const content = parsed.choices?.[0]?.delta?.content
      return typeof content === "string" ? content : ""
    } catch {
      return ""
    }
  })
}

async function* streamAnthropic(options: StreamOptions): AsyncGenerator<string> {
  const request = options.fetch ?? fetch
  const system = options.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
  const messages = options.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role, content: message.content }))
  const response = await request(`${options.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      ...(options.apiKey ? { "x-api-key": options.apiKey } : null),
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 8192,
      stream: true,
      ...(system ? { system } : null),
      messages,
    }),
    signal: options.signal ?? null,
  })
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "")
    throw new Error(`The model endpoint answered ${response.status}. ${readAnthropicError(detail)}`.trim())
  }
  yield* readSse(response.body, (data) => {
    try {
      const parsed = JSON.parse(data) as {
        type?: string
        delta?: { type?: string; text?: unknown }
      }
      if (parsed.type !== "content_block_delta") return ""
      if (parsed.delta?.type !== "text_delta") return ""
      return typeof parsed.delta.text === "string" ? parsed.delta.text : ""
    } catch {
      return ""
    }
  })
}

async function* readSse(
  body: ReadableStream<Uint8Array>,
  take: (data: string) => string
): AsyncGenerator<string> {
  const reader = body.getReader()
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
      const text = take(data)
      if (text) yield text
    }
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

function readAnthropicError(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: unknown }
      message?: unknown
    }
    if (typeof parsed.error?.message === "string") return parsed.error.message
    if (typeof parsed.message === "string") return parsed.message
    return ""
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
