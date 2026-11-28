import { parseDesign } from "@open-intelligent-ui/core"
import type { ChatMessage } from "./live"

/**
 * A Live session the reader owns: designs they asked a model to write, and
 * the conversation that produced them. It lives in localStorage. The API key
 * does not — that stays in the tab, in sessionStorage.
 */
export const STUDIO_KEY = "oiui.studio"

/** Query parameter that carries a shared design (and, when it fits, the interface). */
export const SHARE_PARAM = "studio"

/**
 * How long the encoded parameter may be. The design is compressed, and a
 * link has to survive chat apps and static hosts.
 */
export const SHARE_LIMIT = 7_500

const TEXT_LIMIT = 100_000
const DESIGN_CAP = 24
const TURN_CAP = 40
const EXPAND_LIMIT = 200_000
const SEEN_KEY = "oiui.studio.seen"

export type Lane = "design" | "interface"

export interface StoredDesign {
  id: string
  name: string
  source: string
  /** The request that produced this file, when there was one. */
  prompt?: string
}

export interface StoredTurn {
  role: "user" | "assistant" | "note" | "design"
  text: string
  lane?: Lane
  /** The reader attached a screenshot. The bytes are not stored. */
  image?: boolean
  round?: number
}

export interface StudioRecord {
  v: 1
  designs: StoredDesign[]
  designId?: string
  lane: Lane
  turns: StoredTurn[]
}

export interface DesignAssessment {
  source: string
  name: string
  description?: string
  /** Safe to put on the page: it has front matter and some color. */
  usable: boolean
  /** Fits the contract the design author was given. */
  ok: boolean
  issues: string[]
}

export interface SharePayload {
  /** A DESIGN.md. Omitted when the shared theme is one that ships with the page. */
  design?: string
  /** Id of a shipped theme, when the design is not a custom file. */
  theme?: string
  /** The latest interface, when there is one and it fits in the link. */
  markup?: string
}

export interface EncodedShare {
  param: string
  /** The interface was left out so the link would fit. */
  markupOmitted: boolean
}

export interface ImportedStudio {
  theme?: string
  designs: { source: string; prompt?: string }[]
  markup?: string
}

const EMPTY: StudioRecord = { v: 1, designs: [], lane: "design", turns: [] }

const PAGE_COLORS = ["background", "canvas", "bg", "surface"]
const INK_COLORS = ["foreground", "text", "ink", "on-background"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Stable id for a design file, so importing the same file twice is one entry. */
export function designId(source: string): string {
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `c${(hash >>> 0).toString(36)}`
}

/**
 * The DESIGN.md inside a model reply. Models sometimes add a sentence or a
 * code fence; the file starts at its front matter.
 */
export function extractDesignSource(reply: string): string {
  let text = reply.replace(/\r\n?/g, "\n").trim()
  if (!text.startsWith("---")) {
    const leading = /^\s*```[^\n]*\n/i.exec(text)
    if (leading) text = text.slice(leading[0].length).replace(/\n```\s*$/, "")
    else {
      const embedded = /\n```[^\n]*\n/i.exec(text)
      if (embedded) text = text.slice(embedded.index + embedded[0].length).replace(/\n```\s*$/, "")
    }
  }
  const start = text.search(/^---[ \t]*$/m)
  if (start < 0) return text.trim()
  return text.slice(start).trim()
}

/** What a reply is worth as a design: whether the page can wear it, and what is wrong. */
export function assessDesign(reply: string): DesignAssessment {
  const source = extractDesignSource(reply)
  const issues: string[] = []
  const front = /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/.test(source)
  if (!front) issues.push("Start with YAML front matter, opened and closed with ---.")
  const design = parseDesign(source)
  if (front) issues.push(...design.issues)
  const name = design.name?.trim() ?? ""
  if (front && !name) issues.push("The front matter needs a name.")
  const colorCount = Object.keys(design.colors).length
  const darkCount = Object.keys(design.darkColors).length
  if (front && !PAGE_COLORS.some((item) => design.colors[item])) {
    issues.push("colors.light needs a page color named background.")
  }
  if (front && !INK_COLORS.some((item) => design.colors[item])) {
    issues.push("colors.light needs a text color named foreground.")
  }
  if (front && colorCount < 8) {
    issues.push(
      "colors.light needs the role colors: background, surface, foreground, muted, muted-foreground, border, primary, on-primary, accent, on-accent, and the status colors."
    )
  }
  if (front && darkCount < 4) {
    issues.push("colors.dark needs the dark scheme: at least background, surface, foreground, and accent.")
  }
  if (front && design.prose.trim().length < 40) {
    issues.push("After the front matter, write how to use the color, type, and motion.")
  }
  return {
    source,
    name: name || "Custom",
    ...(design.description ? { description: design.description } : null),
    usable: front && colorCount > 0 && (name.length > 0 || colorCount >= 4),
    ok: issues.length === 0,
    issues,
  }
}

export function designLabel(design: StoredDesign, all: readonly StoredDesign[]): string {
  const twins = all.filter((item) => item.name === design.name)
  return twins.length > 1 ? `${design.name} · ${design.id.slice(-3)}` : design.name
}

export function upsertDesign(designs: readonly StoredDesign[], design: StoredDesign): StoredDesign[] {
  const index = designs.findIndex((item) => item.id === design.id)
  if (index === -1) return [...designs, design].slice(-DESIGN_CAP)
  const current = designs[index] as StoredDesign
  const next: StoredDesign = { ...design, prompt: design.prompt ?? current.prompt }
  if (current.source === next.source && current.name === next.name && current.prompt === next.prompt) {
    return designs as StoredDesign[]
  }
  const copy = designs.slice()
  copy[index] = next
  return copy
}

export function studioFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
  return `${slug || "design"}.studio.json`
}

/**
 * A file another Live session can import. The active design is first.
 * `kind` is how a random JSON file is refused.
 */
export function makeBundle(input: { theme?: string; designs: readonly StoredDesign[]; markup?: string }): string {
  return JSON.stringify(
    {
      version: 1,
      kind: "open-intelligent-ui-studio",
      ...(input.theme ? { theme: input.theme } : null),
      designs: input.designs.map((design) => ({
        name: design.name,
        source: design.source,
        ...(design.prompt ? { prompt: design.prompt } : null),
      })),
      ...(input.markup ? { markup: input.markup } : null),
    },
    null,
    2
  )
}

/** A studio JSON file, or a raw DESIGN.md. */
export function parseImport(text: string): ImportedStudio | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 500_000) return null
  if (trimmed.startsWith("{")) {
    try {
      return bundleFrom(JSON.parse(trimmed) as unknown)
    } catch {
      return null
    }
  }
  const source = extractDesignSource(trimmed)
  if (!source.startsWith("---") || !/\ncolors:/.test(source)) return null
  return { designs: [{ source }] }
}

function bundleFrom(value: unknown): ImportedStudio | null {
  if (!isRecord(value)) return null
  if (value.kind !== "open-intelligent-ui-studio" || value.version !== 1) return null
  const designs: { source: string; prompt?: string }[] = []
  if (Array.isArray(value.designs)) {
    for (const item of value.designs.slice(0, DESIGN_CAP)) {
      if (!isRecord(item) || typeof item.source !== "string" || !item.source.trim()) continue
      designs.push({
        source: item.source.slice(0, TEXT_LIMIT),
        ...(typeof item.prompt === "string" ? { prompt: item.prompt.slice(0, 4_000) } : null),
      })
    }
  }
  const markup = typeof value.markup === "string" && value.markup.trim() ? value.markup.slice(0, TEXT_LIMIT) : undefined
  const theme = typeof value.theme === "string" && /^[a-z0-9-]{1,40}$/.test(value.theme) ? value.theme : undefined
  if (!designs.length && !markup) return null
  return {
    designs,
    ...(markup ? { markup } : null),
    ...(theme ? { theme } : null),
  }
}

export function downloadText(filename: string, contents: string, type = "application/json"): void {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  if (!value.trim()) return undefined
  return value.length > max ? value.slice(0, max) : value
}

function normalize(value: unknown): StudioRecord {
  if (!isRecord(value)) return EMPTY
  const designs: StoredDesign[] = []
  if (Array.isArray(value.designs)) {
    for (const item of value.designs.slice(-DESIGN_CAP)) {
      if (!isRecord(item)) continue
      const source = clip(item.source, TEXT_LIMIT)
      if (!source) continue
      const name = clip(item.name, 80)?.trim() || "Custom"
      const id = clip(item.id, 40)?.trim() || designId(source)
      const prompt = clip(item.prompt, 4_000)?.trim()
      designs.push({
        id,
        name,
        source,
        ...(prompt ? { prompt } : null),
      })
    }
  }
  const turns: StoredTurn[] = []
  if (Array.isArray(value.turns)) {
    for (const item of value.turns.slice(-TURN_CAP)) {
      if (!isRecord(item)) continue
      const role = item.role
      if (role !== "user" && role !== "assistant" && role !== "note" && role !== "design") continue
      const text = typeof item.text === "string" ? item.text.slice(0, TEXT_LIMIT) : ""
      const lane = item.lane === "design" || item.lane === "interface" ? item.lane : undefined
      turns.push({
        role,
        text,
        ...(lane ? { lane } : null),
        ...(item.image === true ? { image: true } : null),
        ...(typeof item.round === "number" ? { round: item.round } : null),
      })
    }
  }
  const designIdValue = clip(value.designId, 40)
  return {
    v: 1,
    designs,
    ...(designIdValue ? { designId: designIdValue } : null),
    lane: value.lane === "interface" ? "interface" : "design",
    turns,
  }
}

export function readStudio(): StudioRecord {
  try {
    const raw = localStorage.getItem(STUDIO_KEY)
    if (!raw) return EMPTY
    return normalize(JSON.parse(raw) as unknown)
  } catch {
    return EMPTY
  }
}

export function writeStudio(record: StudioRecord): void {
  const bounded = normalize(record)
  const save = (value: StudioRecord) => localStorage.setItem(STUDIO_KEY, JSON.stringify(value))
  try {
    save(bounded)
  } catch {
    try {
      save({ ...bounded, turns: bounded.turns.slice(-8) })
    } catch {
      // The browser refused the write. The session still works in memory.
    }
  }
}

interface Wire {
  v: 1
  d?: string
  t?: string
  m?: string
}

function wireFrom(payload: SharePayload): Wire | null {
  const wire: Wire = { v: 1 }
  if (payload.design) wire.d = payload.design
  if (payload.theme && /^[a-z0-9-]{1,40}$/.test(payload.theme)) wire.t = payload.theme
  if (payload.markup) wire.m = payload.markup
  if (!wire.d && !wire.m && !wire.t) return null
  return wire
}

function streamFrom(bytes: Uint8Array): ReadableStream<BufferSource> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(copy)
      controller.close()
    },
  })
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = streamFrom(bytes).pipeThrough(new CompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflate(bytes: Uint8Array, limit: number): Promise<Uint8Array | null> {
  const stream = streamFrom(bytes).pipeThrough(new DecompressionStream("deflate-raw"))
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ""
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlToBytes(param: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(param)) return null
  const pad = (4 - (param.length % 4)) % 4
  const base64 = param.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad)
  try {
    const binary = atob(base64)
    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

async function pack(payload: SharePayload): Promise<string | null> {
  const wire = wireFrom(payload)
  if (!wire) return null
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(wire))
    return bytesToBase64Url(await deflate(bytes))
  } catch {
    return null
  }
}

/**
 * Compresses a share into one query value. When the interface makes the link
 * too long, it is dropped and the design is kept. Returns null when even the
 * design does not fit — the reader exports a file instead.
 */
export async function encodeShare(payload: SharePayload): Promise<EncodedShare | null> {
  const full = await pack(payload)
  if (full && full.length <= SHARE_LIMIT) return { param: full, markupOmitted: false }
  if (!payload.markup) return null
  const slim = await pack({ design: payload.design, theme: payload.theme })
  if (slim && slim.length <= SHARE_LIMIT) return { param: slim, markupOmitted: true }
  return null
}

export async function decodeShare(param: string): Promise<SharePayload | null> {
  if (!param || param.length > 20_000) return null
  const bytes = base64UrlToBytes(param)
  if (!bytes) return null
  let json = ""
  try {
    const raw = await inflate(bytes, EXPAND_LIMIT)
    if (!raw) return null
    json = new TextDecoder().decode(raw)
  } catch {
    return null
  }
  try {
    const wire = JSON.parse(json) as unknown
    if (!isRecord(wire) || wire.v !== 1) return null
    const design = clip(wire.d, TEXT_LIMIT)
    const markup = clip(wire.m, TEXT_LIMIT)
    const theme = typeof wire.t === "string" && /^[a-z0-9-]{1,40}$/.test(wire.t) ? wire.t : undefined
    if (!design && !markup && !theme) return null
    if (design && !design.includes("colors:")) return null
    return {
      ...(design ? { design } : null),
      ...(theme ? { theme } : null),
      ...(markup ? { markup } : null),
    }
  } catch {
    return null
  }
}

/** The address of a Live session. `param` is the compressed share; without it the link only selects a shipped theme. */
export function shareHref(base: string, param: string | null, themeId?: string): string {
  const url = new URL(base, "https://open-intelligent-ui.local")
  const lang = url.searchParams.get("lang")
  const scheme = url.searchParams.get("scheme")
  url.search = ""
  url.hash = ""
  url.searchParams.set("demo", "live")
  if (lang === "en" || lang === "zh") url.searchParams.set("lang", lang)
  if (scheme === "light" || scheme === "dark") url.searchParams.set("scheme", scheme)
  if (param) url.searchParams.set(SHARE_PARAM, param)
  else if (themeId && /^[a-z0-9-]{1,40}$/.test(themeId)) url.searchParams.set("design", themeId)
  return url.toString()
}

export function shareWasApplied(param: string): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === designId(param)
  } catch {
    return false
  }
}

export function markShareApplied(param: string): void {
  try {
    sessionStorage.setItem(SEEN_KEY, designId(param))
  } catch {
    // Applying still happens; a refresh may apply the link again.
  }
}

export interface ThreadTurn {
  role: "user" | "assistant" | "note" | "design"
  text: string
  lane?: Lane
}

function laneOf(turn: ThreadTurn): Lane | null {
  if (turn.role === "note") return null
  if (turn.role === "design") return "design"
  if (turn.role === "assistant") return "interface"
  return turn.lane ?? "interface"
}

/**
 * The turns one lane sends to the model. A design reply is the DESIGN.md;
 * an interface reply is markup. The other lane stays out, so a design file
 * is not answered as if it were a page.
 */
export function modelMessages(
  turns: readonly ThreadTurn[],
  lane: Lane,
  currentDesign: string | undefined,
  image?: { mediaType: string; data: string }
): ChatMessage[] {
  const relevant = turns.filter((turn) => {
    if (laneOf(turn) !== lane) return false
    if ((turn.role === "assistant" || turn.role === "design") && !turn.text.trim()) return false
    return true
  })
  const lastDesign = [...relevant].reverse().find((turn) => turn.role === "design")?.text
  return relevant.map((turn, index) => {
    const role = turn.role === "user" ? "user" : "assistant"
    let text = turn.text
    const last = index === relevant.length - 1 && turn.role === "user"
    if (last && lane === "design" && currentDesign && currentDesign !== lastDesign) {
      text = `${text}\n\nThe design currently applied follows. Change it if the request edits it, or replace it if the request is a different design. Reply with the whole DESIGN.md and nothing else.\n\n${currentDesign}`
    }
    if (last && image) {
      return {
        role,
        content: [
          { type: "text", text },
          { type: "image", mediaType: image.mediaType, data: image.data },
        ],
      }
    }
    return { role, content: text }
  })
}

/**
 * A board and a form in the new design, so type, color, cards and controls
 * are visible before anyone asks for an interface.
 */
export const SPECIMEN = `<state lanes={[{ id: "backlog", name: "Backlog" }, { id: "doing", name: "Doing" }, { id: "done", name: "Done" }]} draft="" who="" note="" lane="backlog" urgent={false} />
<state cards={[
  { id: 1, title: "Match the type in the reference", lane: "backlog", who: "Mina Park", urgent: false },
  { id: 2, title: "Write the empty state", lane: "backlog", who: "Priya Nair", urgent: true },
  { id: 3, title: "Token pass on buttons", lane: "doing", who: "Jonas Weber", urgent: false },
  { id: 4, title: "Check the form in dark mode", lane: "doing", who: "Mina Park", urgent: true },
  { id: 5, title: "Ship the specimen", lane: "done", who: "Priya Nair", urgent: false }
]} />
<derive done={cards.filter(c => c.lane == "done").length} open={cards.filter(c => c.lane != "done").length} urgentCount={cards.filter(c => c.urgent && c.lane != "done").length} />

<define name="Ticket" props="card">
  <card padding={3} gap={2}>
    <row gap={2}>
      <text size="sm" weight="medium">{card.title}</text>
      {#if card.urgent}<badge color="danger">Urgent</badge>{/if}
    </row>
    {#if card.note}<text size="xs" color="muted">{card.note}</text>{/if}
    <row gap={2} align="center">
      <Avatar class="who"><AvatarFallback>{initials(card.who)}</AvatarFallback></Avatar>
      <text size="xs" color="muted">{card.who}</text>
      <spacer />
      <Button size="sm" variant="ghost" aria-label="Move back" disabled={card.lane == "backlog"} on:click={card.lane = card.lane == "done" ? "doing" : "backlog"}><icon name="arrow-left" size="sm" /></Button>
      <Button size="sm" variant="ghost" aria-label="Move forward" disabled={card.lane == "done"} on:click={card.lane = card.lane == "backlog" ? "doing" : "done"}><icon name="arrow-right" size="sm" /></Button>
    </row>
  </card>
</define>

<style>
  .lane { background: var(--iui-color-muted); border-radius: var(--iui-radius-lg); min-height: 160px; }
  .who { width: 22px; height: 22px; font-size: 10px; }
  .lane-count { min-width: 1.25rem; text-align: center; }
  .studio { display: grid; gap: 12px; align-items: start; }
  .lanes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
  .fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  @container iui (width >= 960px) {
    .studio { grid-template-columns: minmax(0, 1fr) minmax(240px, 300px); }
    .fields { grid-template-columns: minmax(0, 1fr); }
  }
  @container iui (width < 520px) {
    .lanes { grid-template-columns: minmax(0, 1fr); }
    .fields { grid-template-columns: minmax(0, 1fr); }
  }
</style>

<row gap={3} wrap align="end">
  <box gap={1}>
    <title level={2}>Northwind</title>
    <text size="sm" color="muted">A sprint board in this design. Move a card, or add one with the form.</text>
  </box>
  <spacer />
  <row gap={4}>
    <box gap={0}>
      <text size="xs" color="muted">Open</text>
      <text size="xl" weight="semibold" tabular>{open}</text>
    </box>
    <box gap={0}>
      <text size="xs" color="muted">Urgent</text>
      <text size="xl" weight="semibold" tabular color="danger">{urgentCount}</text>
    </box>
    <box gap={0}>
      <text size="xs" color="muted">Done</text>
      <text size="xl" weight="semibold" tabular>{done}</text>
    </box>
  </row>
</row>

<Progress value={done} max={cards.length} aria-label="Cards done">
  <ProgressTrack><ProgressIndicator /></ProgressTrack>
</Progress>

<div class="studio">
<div class="lanes">
  {#each lanes as column (column.id)}
    <box class="lane" padding={2} gap={2}>
      <row paddingX={1} align="center">
        <text size="sm" weight="semibold">{column.name}</text>
        <spacer />
        <badge class="lane-count">{cards.filter(c => c.lane == column.id).length}</badge>
      </row>
      {#each cards.filter(c => c.lane == column.id) as card (card.id)}
        <Ticket {card} />
      {/each}
    </box>
  {/each}
</div>

<card padding={4} gap={3}>
  <text weight="semibold">Add a card</text>
  <div class="fields">
    <Field>
      <FieldLabel>Title</FieldLabel>
      <Input bind:value={draft} placeholder="What needs doing?" />
    </Field>
    <Field>
      <FieldLabel>Owner</FieldLabel>
      <Input bind:value={who} placeholder="Name" />
    </Field>
  </div>
  <Field>
    <FieldLabel>Note</FieldLabel>
    <Textarea bind:value={note} placeholder="Context for whoever picks it up" rows={2} />
  </Field>
  <row gap={3} wrap align="center">
    <Select bind:value={lane}>
      <SelectLabel>Lane</SelectLabel>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="backlog">Backlog</SelectItem>
        <SelectItem value="doing">Doing</SelectItem>
        <SelectItem value="done">Done</SelectItem>
      </SelectContent>
    </Select>
    <row gap={2} align="center">
      <Switch bind:checked={urgent} aria-label="Urgent"><SwitchThumb /></Switch>
      <text size="sm">Urgent</text>
    </row>
    <spacer />
    <Button variant="ghost" on:click={draft = ""; who = ""; note = ""; lane = "backlog"; urgent = false}>Clear</Button>
    <Button variant="solid" disabled={draft == ""} on:click={cards.push({ id: uid(), title: draft, lane: lane, who: who == "" ? "You" : who, urgent: urgent, note: note }); draft = ""; note = ""}>Add card</Button>
  </row>
</card>
</div>`
