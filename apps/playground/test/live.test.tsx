import { describe, expect, test } from "vitest"
import { streamChat, unwrapFence } from "../src/live"

function sse(chunks: string[], status = 200): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { status }
    )) as unknown as typeof fetch
}

const delta = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

const anthropicDelta = (text: string) =>
  `event: content_block_delta\ndata: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text },
  })}\n\n`

describe("streaming from an OpenAI-compatible endpoint", () => {
  test("yields text as it arrives, across split network chunks", async () => {
    const wire = delta("<card>") + delta("Hi") + ": keep-alive\n\n" + delta("</card>") + "data: [DONE]\n\n"
    const middle = Math.floor(wire.length / 2)
    const parts: string[] = []
    const calls: { url: string; init: RequestInit }[] = []
    const fake = sse([wire.slice(0, 7), wire.slice(7, middle), wire.slice(middle)])
    const spy = ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return fake(url, init)
    }) as unknown as typeof fetch
    for await (const part of streamChat({
      provider: "openai",
      baseUrl: "https://example.test/v1/",
      model: "m",
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
      fetch: spy,
    })) {
      parts.push(part)
    }
    expect(parts.join("")).toBe("<card>Hi</card>")
    expect(calls[0]?.url).toBe("https://example.test/v1/chat/completions")
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer k")
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      model: "m",
      stream: true,
      max_tokens: 8192,
    })
    expect(JSON.parse(calls[0]?.init.body as string).thinking).toBeUndefined()
  })

  test("DeepSeek uses the OpenAI protocol against its own host and turns thinking off", async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fake = sse([delta("ok") + "data: [DONE]\n\n"])
    const spy = ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return fake(url, init)
    }) as unknown as typeof fetch
    for await (const _ of streamChat({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      apiKey: "k",
      messages: [{ role: "user", content: "hi" }],
      fetch: spy,
    })) {
      /* drain */
    }
    expect(calls[0]?.url).toBe("https://api.deepseek.com/chat/completions")
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      model: "deepseek-flash",
      stream: true,
      thinking: { type: "disabled" },
    })
  })

  test("skips null content and reports reasoning_content while waiting for markup", async () => {
    const reasoning = (text: string) =>
      `data: ${JSON.stringify({
        choices: [{ delta: { content: null, reasoning_content: text } }],
      })}\n\n`
    const wire =
      reasoning("plan") +
      reasoning("…") +
      delta("<card>") +
      delta("Hi") +
      delta("</card>") +
      "data: [DONE]\n\n"
    const parts: string[] = []
    const thoughts: string[] = []
    for await (const part of streamChat({
      provider: "openai",
      baseUrl: "https://example.test/v1",
      model: "m",
      apiKey: "k",
      messages: [],
      fetch: sse([wire]),
      onReasoning: (chunk) => thoughts.push(chunk),
    })) {
      parts.push(part)
    }
    expect(thoughts.join("")).toBe("plan…")
    expect(parts.join("")).toBe("<card>Hi</card>")
  })

  test("reports what the endpoint said when it refuses", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), {
        status: 401,
      })) as unknown as typeof fetch
    const run = async () => {
      const parts: string[] = []
      for await (const part of streamChat({
        provider: "openai",
        baseUrl: "x",
        model: "m",
        apiKey: "",
        messages: [],
        fetch: fake,
      })) {
        parts.push(part)
      }
    }
    await expect(run()).rejects.toThrow("The model endpoint answered 401. Incorrect API key")
  })

  test("drops a code fence around the whole reply", () => {
    expect(unwrapFence("```html\n<card>Hi</card>\n```")).toBe("<card>Hi</card>")
    expect(unwrapFence("```\n<card>Hi")).toBe("<card>Hi")
    expect(unwrapFence("Text\n```\ncode\n```")).toBe("Text\n```\ncode\n```")
  })
})

describe("streaming from Anthropic Messages", () => {
  test("sends the Messages body and yields text deltas", async () => {
    const wire = anthropicDelta("<card>") + anthropicDelta("Hi") + anthropicDelta("</card>") + "data: [DONE]\n\n"
    const parts: string[] = []
    const calls: { url: string; init: RequestInit }[] = []
    const fake = sse([wire])
    const spy = ((url: string, init: RequestInit) => {
      calls.push({ url, init })
      return fake(url, init)
    }) as unknown as typeof fetch
    for await (const part of streamChat({
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      apiKey: "sk-ant",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "hi" },
      ],
      fetch: spy,
    })) {
      parts.push(part)
    }
    expect(parts.join("")).toBe("<card>Hi</card>")
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages")
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers["x-api-key"]).toBe("sk-ant")
    expect(headers["anthropic-version"]).toBe("2023-06-01")
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({
      model: "claude-sonnet-4-5",
      stream: true,
      system: "Be brief.",
      messages: [{ role: "user", content: "hi" }],
    })
  })
})
