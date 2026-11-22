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
    expect(JSON.parse(calls[0]?.init.body as string)).toMatchObject({ model: "m", stream: true })
  })

  test("reports what the endpoint said when it refuses", async () => {
    const fake = (async () =>
      new Response(JSON.stringify({ error: { message: "Incorrect API key" } }), {
        status: 401,
      })) as unknown as typeof fetch
    const run = async () => {
      const parts: string[] = []
      for await (const part of streamChat({ baseUrl: "x", model: "m", apiKey: "", messages: [], fetch: fake })) {
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
