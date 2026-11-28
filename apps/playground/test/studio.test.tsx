import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { beforeEach, describe, expect, test } from "vitest"
import { checkMarkup } from "@open-intelligent-ui/core/check"
import { askDesign } from "../src/design-author"
import type { ChatMessage } from "../src/live"
import { shotFromBlob } from "../src/shot"
import {
  assessDesign,
  decodeShare,
  designId,
  encodeShare,
  extractDesignSource,
  makeBundle,
  modelMessages,
  parseImport,
  readStudio,
  shareHref,
  SPECIMEN,
  upsertDesign,
  writeStudio,
} from "../src/studio"

const design = (name: string) => readFileSync(resolve(`design/${name}.DESIGN.md`), "utf8")

function sse(chunks: string[]): typeof fetch {
  return (async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
      { status: 200 }
    )) as unknown as typeof fetch
}

const delta = (text: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe("a design file pulled out of a reply", () => {
  test("keeps a file that already starts at the front matter", () => {
    const source = design("signal")
    expect(extractDesignSource(`Sure.\n\n${source}`)).toBe(source.trim())
    expect(extractDesignSource(`Sure.\n\n${source}\n\nHope that helps.`)).toContain("Hope that helps.")
    expect(extractDesignSource("```markdown\n" + source + "\n```")).toBe(source.trim())
  })

  test("accepts the designs that ship with the package", () => {
    for (const name of ["default", "signal", "noir", "heritage"]) {
      const assessment = assessDesign(design(name))
      expect(assessment.issues, name).toEqual([])
      expect(assessment.ok, name).toBe(true)
      expect(assessment.name.length, name).toBeGreaterThan(0)
    }
  })

  test("refuses a reply that is not a design", () => {
    const assessment = assessDesign("A calm editorial system with warm paper.")
    expect(assessment.ok).toBe(false)
    expect(assessment.usable).toBe(false)
    expect(assessment.issues[0]).toContain("front matter")
  })
})

describe("the specimen", () => {
  test("is an interface the renderer can draw", () => {
    expect(checkMarkup(SPECIMEN).issues).toEqual([])
  })
})

describe("a shared link", () => {
  test("round-trips a design, including text outside ASCII", async () => {
    const source = design("heritage").replace("name: Heritage", "name: 纸本")
    const encoded = await encodeShare({ design: source, theme: "paper", markup: "<card>Hi</card>" })
    expect(encoded?.markupOmitted).toBe(false)
    const href = shareHref("https://example.test/play?lang=zh&scheme=dark&demo=dashboard", encoded?.param ?? "")
    const url = new URL(href)
    expect(url.searchParams.get("demo")).toBe("live")
    expect(url.searchParams.get("lang")).toBe("zh")
    expect(url.searchParams.get("scheme")).toBe("dark")
    expect(url.searchParams.get("studio")).toBe(encoded?.param)
    const payload = await decodeShare(url.searchParams.get("studio") ?? "")
    expect(payload?.design).toContain("name: 纸本")
    expect(payload?.markup).toBe("<card>Hi</card>")
  })

  test("drops the interface when the link would be too long, and keeps the design", async () => {
    const bytes = new Uint8Array(60_000)
    crypto.getRandomValues(bytes)
    let markup = ""
    for (let i = 0; i < bytes.length; i += 0x8000) {
      markup += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    }
    const encoded = await encodeShare({ design: design("signal"), markup })
    expect(encoded?.markupOmitted).toBe(true)
    const payload = await decodeShare(encoded?.param ?? "")
    expect(payload?.design).toContain("name: Signal")
    expect(payload?.markup).toBeUndefined()
  })

  test("rejects a parameter that is not a share", async () => {
    expect(await decodeShare("not a share")).toBeNull()
    expect(await decodeShare("")).toBeNull()
  })
})

describe("import and local storage", () => {
  test("reads a DESIGN.md and a studio file, and refuses anything else", () => {
    const source = design("default")
    expect(parseImport(source)?.designs[0]?.source).toContain("name: Paper")
    const bundle = makeBundle({
      theme: "paper",
      designs: [{ id: "c1", name: "Paper", source, prompt: "warm" }],
      markup: "<card>Hi</card>",
    })
    expect(parseImport(bundle)).toMatchObject({
      theme: "paper",
      markup: "<card>Hi</card>",
      designs: [{ source, prompt: "warm" }],
    })
    expect(parseImport('{"hello":1}')).toBeNull()
    expect(parseImport("just some notes")).toBeNull()
  })

  test("stores designs in this browser and folds a second copy of the same file into one", () => {
    const source = design("noir")
    const id = designId(source)
    writeStudio({
      v: 1,
      lane: "design",
      designId: id,
      designs: [{ id, name: "Noir", source, prompt: "dark" }],
      turns: [{ role: "user", text: "dark", lane: "design" }],
    })
    const stored = readStudio()
    expect(stored.designs).toEqual([{ id, name: "Noir", source, prompt: "dark" }])
    expect(stored.turns).toEqual([{ role: "user", text: "dark", lane: "design" }])
    const again = upsertDesign(stored.designs, { id, name: "Noir", source })
    expect(again).toHaveLength(1)
    expect(again[0]?.prompt).toBe("dark")
  })
})

describe("what a lane sends to the model", () => {
  test("keeps a design file out of an interface request, and attaches a screenshot once", () => {
    const turns = [
      { role: "user" as const, text: "Warm paper", lane: "design" as const },
      { role: "design" as const, text: "---\nname: Paper\n---" },
      { role: "user" as const, text: "Make it warmer", lane: "design" as const },
      { role: "user" as const, text: "A ledger", lane: "interface" as const },
      { role: "assistant" as const, text: "<card>Ledger</card>" },
    ]
    expect(modelMessages(turns, "interface", undefined).map((message) => message.content)).toEqual([
      "A ledger",
      "<card>Ledger</card>",
    ])
    const designMessages = modelMessages(turns, "design", "---\nname: Other\n---", {
      mediaType: "image/png",
      data: "aaaa",
    })
    const last = designMessages.at(-1)
    expect(last?.content).toEqual([
      { type: "text", text: expect.stringContaining("name: Other") as unknown as string },
      { type: "image", mediaType: "image/png", data: "aaaa" },
    ])
    // The file already in the thread is the applied design, so it is not pasted twice.
    const same = modelMessages(turns, "design", "---\nname: Paper\n---")
    expect(same.at(-1)?.content).toBe("Make it warmer")
  })
})

describe("a design the model has to fix", () => {
  test("is sent back with what is wrong", async () => {
    const fixed = design("signal")
    const replies = ["not a design", fixed]
    const asked: ChatMessage[][] = []
    const request = ((_url: string, init: RequestInit) => {
      asked.push((JSON.parse(init.body as string) as { messages: ChatMessage[] }).messages)
      const reply = replies[asked.length - 1] ?? ""
      return sse([delta(reply.slice(0, 12)) + delta(reply.slice(12)) + "data: [DONE]\n\n"])("", init)
    }) as unknown as typeof fetch
    const done = await askDesign({
      settings: { provider: "openai", baseUrl: "https://example.test/v1", model: "m", apiKey: "k" },
      fetch: request,
      messages: [
        { role: "system", content: "Write a design." },
        { role: "user", content: "A console" },
      ],
      onText: () => {},
    })
    expect(done.assessment.ok).toBe(true)
    expect(done.rounds).toBe(2)
    expect(asked[1]?.at(-1)?.content).toContain("front matter")
  })
})

describe("a screenshot file", () => {
  test("refuses what is not an image", async () => {
    expect(await shotFromBlob(new Blob(["hi"], { type: "text/plain" }))).toEqual({ ok: false, reason: "type" })
  })

  test("reads a small PNG when it cannot be resized", async () => {
    const png = Uint8Array.from(
      atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
      (char) => char.charCodeAt(0)
    )
    const result = await shotFromBlob(new Blob([png], { type: "image/png" }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.shot.data.length).toBeGreaterThan(10)
  })
})
