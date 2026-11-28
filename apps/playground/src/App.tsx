import { Button, Chip, Drawer, Link, ScrollShadow, Spinner, Tooltip } from "@heroui/react"
import { defineLibrary, type SurfaceAction, type ToolEvent } from "@open-intelligent-ui/core"
import { checkMarkup, type Issue } from "@open-intelligent-ui/core/check"
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { Check, Menu, MessageSquare, Monitor, Moon, PanelRight, RotateCcw, Smartphone, Sun } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { askDesign, DESIGN_AUTHOR_PROMPT } from "./design-author"
import { DEMOS, type Demo } from "./demos"
import { LOCALES, readLocale, t, writeLocale, type Locale } from "./i18n"
import { CHARTS, type ChartsId, MOTIONS, type MotionId, useEngines } from "./library/engines"
import { askChecked, type ChatMessage, type LiveSettings, providerById } from "./live"
import type { Shot } from "./shot"
import { Surface } from "./surface/Surface"
import { RENDERERS, type RendererId, type SurfaceHandle } from "./surface/types"
import {
  assessDesign,
  decodeShare,
  designId,
  designLabel,
  downloadText,
  encodeShare,
  makeBundle,
  markShareApplied,
  modelMessages,
  parseImport,
  readStudio,
  SHARE_PARAM,
  shareHref,
  shareWasApplied,
  SPECIMEN,
  studioFilename,
  type Lane,
  type StoredTurn,
  upsertDesign,
  writeStudio,
} from "./studio"
import { THEMES } from "./themes"
import { createTicketTools, TICKET_TOOLS } from "./tools"
import { GitHubMark, Logo, Picker, Segmented } from "./ui/controls"
import { DesignCard } from "./ui/DesignCard"
import { Inspector, type LogEntry, type Panel } from "./ui/Inspector"
import { LiveComposer } from "./ui/LiveComposer"
import { LivePlaygroundPromo } from "./ui/LivePlaygroundPromo"
import { LiveSettingsButton } from "./ui/LiveSettings"
import { LIVE, Sidebar } from "./ui/Sidebar"

type Scheme = "light" | "dark"
type Mode = "demos" | "live"
type Width = "phone" | "chat" | "wide"

interface Turn {
  id: number
  role: "user" | "assistant" | "note" | "design"
  text: string
  /** Which lane this turn belongs to. Notes belong to neither. */
  lane?: Lane
  /** The reader attached a screenshot. The bytes are not kept. */
  image?: boolean
  /** Which attempt at this reply is shown. A repaired reply is a new surface, with its own state. */
  round?: number
}

const SPEEDS = [
  { id: "slow", charsPerSecond: 350 },
  { id: "normal", charsPerSecond: 1400 },
  { id: "fast", charsPerSecond: 6000 },
  { id: "instant", charsPerSecond: Number.POSITIVE_INFINITY },
] as const

type Speed = (typeof SPEEDS)[number]["id"]

const WIDTHS: Width[] = ["phone", "chat", "wide"]
const PANELS: Panel[] = ["source", "state", "events", "prompt"]

/** How many times a live reply that doesn't check out is sent back to the model. */
const REPAIRS = 2

const REPOSITORY = "https://github.com/wzc520pyfm/open-intelligent-ui"
const LIVE_KEY = "oiui.live"
let nextId = 1

function readLiveSettings(): LiveSettings {
  const openai = providerById("openai")
  const fallback: LiveSettings = {
    provider: "openai",
    baseUrl: openai.baseUrl,
    model: openai.model,
    apiKey: "",
  }
  try {
    const stored = JSON.parse(sessionStorage.getItem(LIVE_KEY) ?? "null") as Partial<LiveSettings> | null
    if (!stored) return fallback
    const provider = providerById(stored.provider)
    return {
      provider: provider.id,
      baseUrl: stored.baseUrl ?? provider.baseUrl,
      model: stored.model ?? provider.model,
      apiKey: stored.apiKey ?? "",
    }
  } catch {
    return fallback
  }
}

/**
 * What the address asks for, so a view can be linked to:
 * `?demo=dashboard&renderer=vue&design=…&charts=echarts&motion=gsap&scheme=dark&speed=instant&width=wide&inspect=state&lang=zh`.
 */
function readQuery() {
  const query = new URLSearchParams(window.location.search)
  const pick = <T extends string>(name: string, allowed: readonly T[]): T | undefined => {
    const value = query.get(name)
    return allowed.includes(value as T) ? (value as T) : undefined
  }
  const inspect = query.get("inspect")
  return {
    live: query.get("demo") === LIVE || query.has(SHARE_PARAM),
    demo: DEMOS.find((item) => item.id === query.get("demo")),
    design: THEMES.find((item) => item.id === query.get("design"))?.id,
    renderer: pick(
      "renderer",
      RENDERERS.map((item) => item.id)
    ),
    charts: pick(
      "charts",
      CHARTS.map((item) => item.id)
    ),
    motion: pick(
      "motion",
      MOTIONS.map((item) => item.id)
    ),
    scheme: pick("scheme", ["light", "dark"] as const),
    speed: pick(
      "speed",
      SPEEDS.map((item) => item.id)
    ),
    width: pick("width", WIDTHS),
    locale: pick(
      "lang",
      LOCALES.map((item) => item.id)
    ),
    panel: pick("inspect", PANELS),
    inspect: inspect === null ? undefined : inspect !== "0",
  }
}

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query)
      media.addEventListener("change", notify)
      return () => media.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches
  )
}

function preview(value: unknown): string {
  if (value === undefined) return ""
  try {
    const text = JSON.stringify(value)
    return text.length > 220 ? `${text.slice(0, 220)}…` : text
  } catch {
    return String(value)
  }
}

function revive(turns: StoredTurn[]): Turn[] {
  return turns.map((turn) => ({
    id: nextId++,
    role: turn.role,
    text: turn.text,
    ...(turn.lane ? { lane: turn.lane } : null),
    ...(turn.image ? { image: true } : null),
    ...(turn.round !== undefined ? { round: turn.round } : null),
  }))
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

export function App() {
  const query = useMemo(readQuery, [])
  const stored = useMemo(() => readStudio(), [])
  const [locale, setLocale] = useState<Locale>(() => query.locale ?? readLocale())
  const copy = t(locale)
  const [mode, setMode] = useState<Mode>(query.live ? "live" : "demos")
  const [demo, setDemo] = useState<Demo>(query.demo ?? (DEMOS[0] as Demo))
  const [designs, setDesigns] = useState(stored.designs)
  const [lane, setLane] = useState<Lane>(stored.lane)
  const [shot, setShot] = useState<Shot | null>(null)
  const [themeId, setThemeId] = useState(
    query.design ?? (query.live ? (stored.designId ?? "paper") : (demo.theme ?? "paper"))
  )
  const [scheme, setScheme] = useState<Scheme>(() => {
    if (query.scheme) return query.scheme
    const initialTheme = query.design ?? (query.demo ?? DEMOS[0])?.theme
    if (initialTheme === "noir") return "dark"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  })
  const [renderer, setRenderer] = useState<RendererId>(query.renderer ?? "react")
  const [chartsId, setChartsId] = useState<ChartsId>(query.charts ?? "svg")
  const [motionId, setMotionId] = useState<MotionId>(query.motion ?? "css")
  const [speed, setSpeed] = useState<Speed>(query.speed ?? "normal")
  const [width, setWidth] = useState<Width>(query.width ?? "chat")
  const [panel, setPanel] = useState<Panel>(query.panel ?? "source")
  const roomy = useMedia("(min-width: 1280px)")
  const desktop = useMedia("(min-width: 1024px)")
  const [inspecting, setInspecting] = useState(() => query.inspect ?? roomy)
  const [menu, setMenu] = useState(false)
  const [turns, setTurns] = useState<Turn[]>(() => (query.live ? revive(stored.turns) : []))
  const [streamingId, setStreamingId] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [surfaceState, setSurfaceState] = useState<Record<string, unknown>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [live, setLive] = useState<LiveSettings>(readLiveSettings)
  const [draft, setDraft] = useState("")
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const [useTools, setUseTools] = useState(true)

  const customTheme = designs.find((item) => item.id === themeId)
  const theme = customTheme
    ? { id: customTheme.id, name: customTheme.name, design: customTheme.source }
    : (THEMES.find((item) => item.id === themeId) ?? (THEMES[0] as (typeof THEMES)[number]))
  const liveTheme = useRef(query.live ? theme.id : (stored.designId ?? theme.id))
  const designBaseline = useRef<string | undefined>(undefined)
  /** The saved design a turn produced. Edits update that file, not whatever the picker shows. */
  const ownedDesign = useRef(new Map<number, string>())
  const designsRef = useRef(designs)
  designsRef.current = designs
  const themeIdRef = useRef(themeId)
  themeIdRef.current = themeId
  const tools = useMemo(() => createTicketTools(), [])
  const abort = useRef<AbortController | null>(null)
  const timer = useRef<number | null>(null)
  const thread = useRef<HTMLDivElement>(null)
  const handle = useRef<SurfaceHandle>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  const copyRef = useRef(copy)
  copyRef.current = copy

  const demoCopy = (item: Demo) =>
    copy.demos[item.id] ?? { title: item.title, caption: item.caption, prompt: item.prompt }

  // An engine made of one framework's components draws only in that framework's renderer.
  const drawnBy = CHARTS.find((item) => item.id === chartsId)
  const charts = drawnBy?.only && drawnBy.only !== renderer ? "svg" : chartsId
  const engines = useEngines(charts, motionId)
  // What the product adds: the demo's components and the engines chosen above.
  // The renderer and the prompt read the same object, so neither can promise what the other lacks.
  const product = mode === "demos" ? demo.library : undefined
  const library = useMemo(
    () =>
      product || engines.charts || engines.motion ? defineLibrary({ ...product, ...engines }) : undefined,
    [product, engines]
  )

  const systemPrompt = useMemo(
    () =>
      buildSystemPrompt({
        design: theme.design,
        ...(library ? { library } : null),
        ...(useTools ? { tools: TICKET_TOOLS } : null),
      }),
    [theme, library, useTools]
  )

  // What a reply is checked against: what the renderer below is given.
  const check = useCallback(
    (source: string) => checkMarkup(source, { library, tools: Object.keys(tools) }),
    [library, tools]
  )

  const record = useCallback((entry: Omit<LogEntry, "id" | "time">) => {
    const time = new Date().toLocaleTimeString([], { hour12: false })
    setLog((entries) => [{ ...entry, id: nextId++, time }, ...entries].slice(0, 200))
  }, [])

  const stop = useCallback(() => {
    if (timer.current !== null) cancelAnimationFrame(timer.current)
    timer.current = null
    abort.current?.abort()
    abort.current = null
    setStreamingId(null)
    setThinking(false)
  }, [])

  const patchTurn = useCallback((id: number, text: string) => {
    setTurns((list) => list.map((turn) => (turn.id === id ? { ...turn, text } : turn)))
  }, [])

  const playback = useCallback(
    (id: number, source: string, charsPerSecond: number) => {
      if (!Number.isFinite(charsPerSecond)) {
        patchTurn(id, source)
        setStreamingId(null)
        return
      }
      setStreamingId(id)
      let shown = 0
      // Set on the first frame so a long pause before the first rAF (boot, Strict
      // Mode remount) cannot dump thousands of characters in one catch-up tick.
      let last: number | null = null
      const step = (now: number) => {
        if (last === null) last = now
        // Cap so a backgrounded tab or a stalled main thread cannot skip ahead.
        const elapsed = Math.min(now - last, 50)
        last = now
        shown = Math.min(source.length, shown + (elapsed / 1000) * charsPerSecond)
        patchTurn(id, source.slice(0, Math.floor(shown)))
        if (shown >= source.length) {
          timer.current = null
          setStreamingId(null)
          return
        }
        timer.current = requestAnimationFrame(step)
      }
      timer.current = requestAnimationFrame(step)
    },
    [patchTurn]
  )

  const playDemo = useCallback(
    (next: Demo, speedId: string, prompt: string) => {
      stop()
      const user: Turn = { id: nextId++, role: "user", text: prompt }
      const reply: Turn = { id: nextId++, role: "assistant", text: "" }
      setTurns([user, reply])
      setLog([])
      setSurfaceState({})
      const rate = SPEEDS.find((item) => item.id === speedId)?.charsPerSecond ?? 1400
      playback(reply.id, next.source, rate)
    },
    [stop, playback]
  )

  const askModel = useCallback(
    async (history: Turn[], image?: Shot) => {
      stop()
      const reply: Turn = { id: nextId++, role: "assistant", text: "", lane: "interface" }
      setTurns([...history, reply])
      setStreamingId(reply.id)
      const controller = new AbortController()
      abort.current = controller
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...modelMessages(history, "interface", undefined, image),
      ]
      let text = ""
      setThinking(false)
      try {
        const done = await askChecked({
          ...live,
          messages,
          signal: controller.signal,
          check,
          repairs: REPAIRS,
          onReasoning: () => {
            if (!text) setThinking(true)
          },
          onText: (next) => {
            if (text.length === 0) setThinking(false)
            text = next
            patchTurn(reply.id, next)
          },
          onChecked: (result, round, willRepair) => {
            for (const issue of [...result.issues].reverse()) {
              record({
                kind: issue.severity === "error" ? "check" : "warning",
                title: `${copyRef.current.line(issue.line)}: ${issue.message}`,
                detail: issue.hint ?? issue.excerpt,
              })
            }
            if (!willRepair) return
            text = ""
            setTurns((list) => [
              ...list.filter((turn) => turn.id !== reply.id),
              {
                id: nextId++,
                role: "note",
                text: copyRef.current.fixing(result.errors, round + 1, REPAIRS),
              },
              { ...reply, round: round + 1 },
            ])
          },
        })
        if (done.rounds > 1) {
          const note = done.result.ok
            ? copyRef.current.fixed(done.rounds - 1)
            : copyRef.current.notFixed(done.result.errors)
          setTurns((list) => [...list, { id: nextId++, role: "note", text: note }])
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error)
          setTurns((list) => [...list, { id: nextId++, role: "note", text: message }])
        }
      } finally {
        if (abort.current === controller) {
          abort.current = null
          setStreamingId(null)
          setThinking(false)
        }
      }
    },
    [live, systemPrompt, patchTurn, stop, check, record]
  )

  const askForDesign = useCallback(
    async (history: Turn[], image: Shot | undefined, currentDesign: string | undefined) => {
      stop()
      const reply: Turn = { id: nextId++, role: "design", text: "", lane: "design" }
      setTurns([...history, reply])
      setStreamingId(reply.id)
      const controller = new AbortController()
      abort.current = controller
      const messages: ChatMessage[] = [
        { role: "system", content: DESIGN_AUTHOR_PROMPT },
        ...modelMessages(history, "design", currentDesign, image),
      ]
      let text = ""
      setThinking(false)
      try {
        const done = await askDesign({
          settings: live,
          messages,
          signal: controller.signal,
          repairs: REPAIRS,
          onReasoning: () => {
            if (!text) setThinking(true)
          },
          onText: (next) => {
            if (text.length === 0) setThinking(false)
            text = next
            patchTurn(reply.id, next)
          },
          onRound: (assessment, round, willRepair) => {
            if (!willRepair) return
            text = ""
            setTurns((list) => [
              ...list.filter((turn) => turn.id !== reply.id),
              {
                id: nextId++,
                role: "note",
                text: copyRef.current.designFixing(round + 1, REPAIRS),
              },
              { ...reply },
            ])
          },
        })
        if (done.rounds > 1) {
          const note = done.assessment.ok
            ? copyRef.current.fixed(done.rounds - 1)
            : done.assessment.usable
              ? copyRef.current.designPartial
              : copyRef.current.designLeft
          setTurns((list) => [...list, { id: nextId++, role: "note", text: note }])
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          const message = error instanceof Error ? error.message : String(error)
          setTurns((list) => [...list, { id: nextId++, role: "note", text: message }])
        }
      } finally {
        if (abort.current === controller) {
          abort.current = null
          setStreamingId(null)
          setThinking(false)
        }
      }
    },
    [live, patchTurn, stop]
  )

  const sendLive = useCallback(
    (text: string, nextLane: Lane, image?: Shot) => {
      const trimmed = text.trim()
      if (!trimmed && !image) return
      const body =
        trimmed ||
        (nextLane === "design" ? copyRef.current.shotDesignAsk : copyRef.current.shotInterfaceAsk)
      const user: Turn = {
        id: nextId++,
        role: "user",
        text: body,
        lane: nextLane,
        ...(image ? { image: true } : null),
      }
      setLane(nextLane)
      const history = [...turnsRef.current, user]
      if (!live.model) {
        setTurns([
          ...history,
          { id: nextId++, role: "note", text: copyRef.current.connectNote },
        ])
        return
      }
      const current = designsRef.current.find((item) => item.id === themeIdRef.current)
      if (nextLane === "design") void askForDesign(history, image, current?.source)
      else void askModel(history, image)
    },
    [live.model, askForDesign, askModel]
  )

  const say = useCallback(
    (text: string, data?: unknown) => {
      const content =
        data === undefined ? text : `${text}\n\n<interface-data>${JSON.stringify(data)}</interface-data>`
      if (mode === "live") {
        sendLive(content, "interface")
        return
      }
      const user: Turn = { id: nextId++, role: "user", text: content }
      setTurns((list) => [
        ...list,
        user,
        { id: nextId++, role: "note", text: copyRef.current.demoNote },
      ])
    },
    [mode, sendLive]
  )

  // Speed applies to the next playback, not the one running.
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => {
    if (mode !== "demos") return
    const prompt = t(locale).demos[demo.id]?.prompt ?? demo.prompt
    playDemo(demo, speedRef.current, prompt)
    // Strict Mode remounts effects: cancel the in-flight stream so the demo
    // does not finish once, wipe, and stream again.
    return () => stop()
  }, [mode, demo, locale, playDemo, stop])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", scheme === "dark")
    root.dataset.theme = scheme
  }, [scheme])

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"
    writeLocale(locale)
  }, [locale])

  useEffect(() => {
    sessionStorage.setItem(LIVE_KEY, JSON.stringify(live))
  }, [live])

  useEffect(() => {
    if (mode !== "live" || streamingId !== null) return
    writeStudio({
      v: 1,
      designs,
      designId: themeId,
      lane,
      turns: turns.map((turn) => ({
        role: turn.role,
        text: turn.text,
        ...(turn.lane ? { lane: turn.lane } : null),
        ...(turn.image ? { image: true } : null),
        ...(turn.round !== undefined ? { round: turn.round } : null),
      })),
    })
  }, [mode, streamingId, designs, themeId, lane, turns])

  useEffect(() => {
    if (mode !== "live") return
    const latest = [...turns].reverse().find((turn) => turn.role === "design")
    const text = latest?.text ?? ""
    const remember = () => {
      if (!latest || !text || ownedDesign.current.has(latest.id)) return
      const match = designsRef.current.find((item) => item.source === text)
      if (match) ownedDesign.current.set(latest.id, match.id)
    }
    if (designBaseline.current === undefined) {
      designBaseline.current = text
      remember()
      return
    }
    if (streamingId !== null) return
    if (text === designBaseline.current) {
      remember()
      return
    }
    designBaseline.current = text
    if (!text.trim() || !latest) return
    const assessment = assessDesign(text)
    if (!assessment.usable) return
    const prompt = [...turns].reverse().find((turn) => turn.role === "user" && turn.lane === "design")?.text
    const ownedId = ownedDesign.current.get(latest.id)
    if (ownedId && designsRef.current.some((item) => item.id === ownedId)) {
      setDesigns((prev) => {
        const current = prev.find((item) => item.id === ownedId)
        if (!current) return prev
        return upsertDesign(prev, {
          id: current.id,
          name: assessment.name,
          source: assessment.source,
          prompt: prompt ?? current.prompt,
        })
      })
      return
    }
    const id = designId(assessment.source)
    ownedDesign.current.set(latest.id, id)
    setDesigns((prev) => upsertDesign(prev, { id, name: assessment.name, source: assessment.source, prompt }))
    setThemeId(id)
    liveTheme.current = id
  }, [mode, turns, streamingId])

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get(SHARE_PARAM)
    if (!param) return
    let cancelled = false
    void decodeShare(param).then((payload) => {
      if (cancelled) return
      const seen = shareWasApplied(param)
      if (!payload) {
        if (seen) return
        markShareApplied(param)
        setMode("live")
        setTurns((list) => [...list, { id: nextId++, role: "note", text: copyRef.current.shareUnread }])
        return
      }
      if (!seen && payload.design) {
        const assessment = assessDesign(payload.design)
        if (assessment.usable) {
          const id = designId(assessment.source)
          setDesigns((prev) => upsertDesign(prev, { id, name: assessment.name, source: assessment.source }))
          setThemeId(id)
          liveTheme.current = id
        }
      } else if (!seen && payload.theme && THEMES.some((item) => item.id === payload.theme)) {
        setThemeId(payload.theme)
        liveTheme.current = payload.theme
      }
      if (seen) return
      markShareApplied(param)
      const next: Turn[] = [{ id: nextId++, role: "note", text: copyRef.current.openedShare }]
      if (payload.design) {
        const source = assessDesign(payload.design).source
        designBaseline.current = source
        next.push({ id: nextId++, role: "design", text: source, lane: "design" })
      } else {
        designBaseline.current = ""
      }
      if (payload.markup) next.push({ id: nextId++, role: "assistant", text: payload.markup, lane: "interface" })
      setMode("live")
      setTurns(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // A reply is read from its top, so only a follow-up message scrolls down.
  const turnCount = turns.length
  useEffect(() => {
    const node = thread.current
    if (!node) return
    if (turnCount <= 2) node.scrollTo({ top: 0 })
    else node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [turnCount])

  const latestMarkup = [...turns].reverse().find((turn) => turn.role === "assistant")
  const latestDocument = [...turns].reverse().find((turn) => turn.role === "assistant" || turn.role === "design")

  // The markup is checked once it has stopped arriving, and again as it is edited.
  const [issues, setIssues] = useState<Issue[] | null>(null)
  const settled = streamingId === null && latestDocument?.role === "assistant" ? (latestMarkup?.text ?? "") : null
  useEffect(() => {
    if (settled === null || !settled.trim()) {
      setIssues(null)
      return
    }
    const wait = window.setTimeout(() => setIssues(check(settled).issues), 120)
    return () => window.clearTimeout(wait)
  }, [settled, check])

  const onAction = useCallback(
    (action: SurfaceAction) => {
      if (action.type === "send") {
        record({ kind: "send", title: action.text, detail: preview(action.data ?? action.state) })
        say(action.text, action.data)
      } else if (action.type === "toast") {
        record({ kind: "toast", title: action.message })
      } else if (action.type === "copy") {
        record({ kind: "copy", title: action.text })
      } else {
        record({ kind: "open", title: action.url })
      }
      return undefined
    },
    [record, say]
  )

  const onTool = useCallback(
    (event: ToolEvent) => {
      if (event.status === "start") return
      record({
        kind: "tool",
        title: `${event.kind} ${event.tool}(${preview(event.input)})`,
        detail: event.status === "error" ? `failed: ${event.error}` : preview(event.result),
      })
    },
    [record]
  )

  const onWarning = useCallback(
    (message: string) => record({ kind: "warning", title: message }),
    [record]
  )

  const select = (id: string) => {
    setMenu(false)
    if (id === LIVE) {
      if (mode === "live") return
      stop()
      const saved = readStudio()
      setMode("live")
      setLane(saved.lane)
      setTurns(revive(saved.turns))
      setThemeId(liveTheme.current)
      setLog([])
      setSurfaceState({})
      designBaseline.current = undefined
      ownedDesign.current = new Map()
      return
    }
    const next = DEMOS.find((item) => item.id === id)
    if (!next) return
    setMode("demos")
    setDemo(next)
    // Keep the user's light/dark choice when switching demos. Noir still
    // defaults to dark on first load (see scheme state init), but never
    // overrides a scheme the user already picked.
    if (next.theme) setThemeId(next.theme)
    else if (demo.theme) setThemeId("paper")
  }

  const chooseRenderer = (next: RendererId) => {
    // Another renderer starts the surface over, so what the old one held is gone.
    setSurfaceState({})
    setRenderer(next)
  }

  const fitDraft = useCallback(() => {
    const el = draftRef.current
    if (!el) return
    el.style.height = "0px"
    const styles = getComputedStyle(el)
    const line = Number.parseFloat(styles.lineHeight) || 20
    const pad =
      (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
    el.style.height = `${Math.min(el.scrollHeight, line * 4 + pad)}px`
  }, [])

  useEffect(() => {
    fitDraft()
    const el = draftRef.current
    if (!el) return
    const column = el.closest(".pg-column")
    const ro = new ResizeObserver(() => fitDraft())
    ro.observe(el)
    if (column) ro.observe(column)
    return () => ro.disconnect()
  }, [draft, width, fitDraft])

  const markupNow = () =>
    [...turnsRef.current].reverse().find((turn) => turn.role === "assistant" && turn.text.trim())?.text

  const share = useCallback(async () => {
    const custom = designs.find((item) => item.id === theme.id)
    const markup = markupNow()
    const shipped = THEMES.some((item) => item.id === theme.id) ? theme.id : undefined
    if (!custom && !markup) {
      const href = shareHref(window.location.href, null, shipped)
      const copied = await copyText(href)
      if (copied) window.history.replaceState(null, "", href)
      return copied ? copyRef.current.shareCopied : href
    }
    const encoded = await encodeShare({
      ...(custom ? { design: custom.source } : null),
      ...(!custom && shipped ? { theme: shipped } : null),
      ...(markup ? { markup } : null),
    })
    if (!encoded) return copyRef.current.shareTooBig
    const href = shareHref(window.location.href, encoded.param)
    const copied = await copyText(href)
    if (copied) {
      window.history.replaceState(null, "", href)
      markShareApplied(encoded.param)
    }
    if (!copied) return href
    return encoded.markupOmitted ? copyRef.current.shareDesignOnly : copyRef.current.shareCopied
  }, [designs, theme.id])

  const exportStudio = useCallback(() => {
    const active = designs.find((item) => item.id === theme.id)
    const ordered = active ? [active, ...designs.filter((item) => item.id !== active.id)] : designs
    const shipped = THEMES.some((item) => item.id === theme.id) ? theme.id : undefined
    const markup = mode === "live" ? markupNow() : undefined
    downloadText(
      studioFilename(active?.name ?? theme.name),
      makeBundle({
        ...(shipped ? { theme: shipped } : null),
        designs: ordered,
        ...(markup ? { markup } : null),
      })
    )
  }, [designs, theme.id, theme.name, mode])

  const importFile = useCallback(
    async (file: File) => {
      if (file.size > 500_000) return copyRef.current.importFailed
      let text = ""
      try {
        text = await file.text()
      } catch {
        return copyRef.current.importFailed
      }
      const imported = parseImport(text)
      if (!imported) return copyRef.current.importFailed
      const usable = imported.designs.flatMap((item) => {
        const assessment = assessDesign(item.source)
        if (!assessment.usable) return []
        return [
          {
            id: designId(assessment.source),
            name: assessment.name,
            source: assessment.source,
            ...(item.prompt ? { prompt: item.prompt } : null),
          },
        ]
      })
      const shipped = imported.theme && THEMES.some((item) => item.id === imported.theme) ? imported.theme : undefined
      if (!usable.length && !imported.markup) return copyRef.current.importFailed
      const first = usable[0]
      if (usable.length) {
        setDesigns((prev) => usable.reduce((list, design) => upsertDesign(list, design), prev))
      }
      if (shipped) {
        setThemeId(shipped)
        liveTheme.current = shipped
        designBaseline.current = ""
      } else if (first) {
        setThemeId(first.id)
        liveTheme.current = first.id
        designBaseline.current = first.source
      }
      const next: Turn[] = [{ id: nextId++, role: "note", text: copyRef.current.imported }]
      if (!shipped && first) next.push({ id: nextId++, role: "design", text: first.source, lane: "design" })
      if (imported.markup) {
        next.push({ id: nextId++, role: "assistant", text: imported.markup, lane: "interface" })
      }
      stop()
      setMode("live")
      setLane(!shipped && usable.length ? "design" : "interface")
      setTurns(next)
      setLog([])
      setSurfaceState({})
      setShot(null)
      window.history.replaceState(null, "", shareHref(window.location.href, null))
      return copyRef.current.imported
    },
    [stop]
  )

  const fresh = () => {
    stop()
    setTurns([])
    setLog([])
    setSurfaceState({})
    setLane("interface")
    setDraft("")
    setShot(null)
    designBaseline.current = ""
    ownedDesign.current = new Map()
    window.history.replaceState(null, "", shareHref(window.location.href, null))
  }

  const submit = () => {
    const text = draft.trim()
    if (mode !== "live") {
      if (!text) return
      setDraft("")
      say(text)
      return
    }
    if (!text && !shot) return
    const image = shot ?? undefined
    setDraft("")
    setShot(null)
    sendLive(text, lane, image)
  }

  const canExport =
    designs.length > 0 || turns.some((turn) => turn.role === "assistant" && turn.text.trim().length > 0)

  const streaming = streamingId !== null
  const status = streaming ? (thinking ? copy.thinking : copy.writing) : copy.done

  const sidebar = (
    <Sidebar
      copy={copy}
      demos={DEMOS}
      demoCopy={demoCopy}
      selected={mode === "live" ? LIVE : demo.id}
      onSelect={select}
    />
  )

  const inspector = (
    <Inspector
      copy={copy}
      panel={panel}
      onPanel={setPanel}
      source={latestDocument?.text ?? ""}
      onSource={(text) => {
        if (!latestDocument) return
        stop()
        patchTurn(latestDocument.id, text)
      }}
      sourceLabel={latestDocument?.role === "design" ? "DESIGN.md" : undefined}
      sourceHint={latestDocument?.role === "design" ? copy.designHint : undefined}
      issues={issues}
      state={surfaceState}
      onReset={() => handle.current?.reset()}
      log={log}
      prompt={systemPrompt}
      promptHint={copy.promptHint(theme.name, Math.round(systemPrompt.length / 4 / 100) / 10)}
    />
  )

  return (
    <div className="flex h-full flex-col bg-background-secondary text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-separator bg-background px-3 sm:px-4">
        {desktop ? null : (
          <Button isIconOnly size="sm" variant="ghost" aria-label={copy.examples} onPress={() => setMenu(true)}>
            <Menu className="size-4" aria-hidden="true" />
          </Button>
        )}
        <a href={REPOSITORY} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <Logo className="size-8 shrink-0 sm:size-11" />
          <span className="truncate text-[15px] font-semibold tracking-tight whitespace-nowrap">
            Open Intelligent UI
          </span>
        </a>
        <Chip size="sm" variant="soft" className="hidden sm:inline-flex">
          v{__VERSION__}
        </Chip>
        <span className="flex-1" />
        <Link
          href={copy.docsUrl}
          className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-muted no-underline hover:bg-default hover:text-foreground sm:inline-flex"
        >
          {copy.docs}
        </Link>
        <Segmented
          label="Language"
          className="hidden sm:inline-flex"
          value={locale}
          options={LOCALES}
          onChange={setLocale}
        />
        <Link
          href={REPOSITORY}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          className="grid size-8 place-items-center rounded-full text-muted no-underline hover:bg-default hover:text-foreground"
        >
          <GitHubMark className="size-[18px]" />
        </Link>
        <Tooltip delay={300}>
          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            data-pg="scheme"
            aria-label={scheme === "dark" ? copy.switchToLight : copy.switchToDark}
            onPress={() => setScheme(scheme === "dark" ? "light" : "dark")}
          >
            {scheme === "dark" ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Tooltip.Content>{scheme === "dark" ? copy.switchToLight : copy.switchToDark}</Tooltip.Content>
        </Tooltip>
        <Button
          size="sm"
          variant={inspecting && roomy ? "secondary" : "ghost"}
          data-pg="inspect"
          aria-label={copy.inspect}
          aria-pressed={inspecting}
          onPress={() => setInspecting(!inspecting)}
        >
          <PanelRight className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">{copy.inspect}</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {desktop ? (
          <nav aria-label={copy.examples} className="w-72 shrink-0 border-r border-separator bg-background">
            {sidebar}
          </nav>
        ) : null}

        <main className="@container flex min-w-0 flex-1 flex-col">
          <div
            className={
              mode === "live"
                ? "flex shrink-0 flex-nowrap items-center gap-2 overflow-x-hidden border-b border-separator bg-background px-3 py-2 sm:flex-wrap sm:overflow-visible sm:px-4"
                : "flex shrink-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-separator bg-background px-3 py-2 sm:flex-wrap sm:overflow-visible sm:px-4"
            }
          >
            <Chip size="sm" variant="soft" color={streaming ? "accent" : "success"} className="order-1 shrink-0 self-center" data-pg="status" data-live={streaming}>
              {streaming ? <Spinner size="sm" color="current" className="size-3" /> : <Check className="size-3" aria-hidden="true" />}
              {status}
            </Chip>
            {/* Mobile/wide one-row: pickers sit right next to actions. sm–58rem: actions top, pickers below. */}
            <div
              className={
                mode === "live"
                  ? "order-2 ml-auto flex min-w-0 flex-nowrap items-center justify-end gap-2 sm:order-3 sm:ml-0 sm:w-full sm:flex-none sm:flex-wrap sm:justify-start @[58rem]:order-2 @[58rem]:ml-0 @[58rem]:w-auto @[58rem]:min-w-0 @[58rem]:flex-1 @[58rem]:justify-end"
                  : "order-2 ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-2 sm:order-3 sm:ml-0 sm:w-full sm:flex-none sm:flex-wrap sm:justify-start @[58rem]:order-2 @[58rem]:ml-0 @[58rem]:w-auto @[58rem]:min-w-0 @[58rem]:flex-1 @[58rem]:justify-end"
              }
            >
              {/* LIVE: below ~430px drop the renderer so Design + model keep room. */}
              <span
                title={copy.rendererHint}
                className={mode === "live" ? "max-[431px]:hidden" : undefined}
                data-pg="renderer"
              >
                <Picker
                  label={copy.renderer}
                  className={mode === "live" ? "min-w-0 max-w-[7.5rem] sm:max-w-none" : undefined}
                  value={renderer}
                  onChange={chooseRenderer}
                  options={RENDERERS}
                />
              </span>
              <Picker
                label={copy.design}
                className={mode === "live" ? "min-w-0 max-w-[9.5rem] sm:max-w-none" : undefined}
                value={theme.id}
                onChange={(id) => {
                  setThemeId(id)
                  if (mode === "live") liveTheme.current = id
                }}
                options={[
                  ...THEMES.map((item) => ({ id: item.id, label: item.name })),
                  ...designs.map((item) => ({ id: item.id, label: designLabel(item, designs) })),
                ]}
              />
              <Picker
                label={copy.charts}
                className="hidden sm:flex"
                value={charts}
                onChange={setChartsId}
                options={CHARTS.filter((item) => !item.only || item.only === renderer)}
              />
              <Picker
                label={copy.motion}
                className="hidden sm:flex"
                value={motionId}
                onChange={setMotionId}
                options={MOTIONS}
              />
              {mode === "demos" ? (
                <Picker
                  label={copy.speed}
                  className="hidden sm:flex"
                  value={speed}
                  onChange={setSpeed}
                  options={[
                    { id: "slow", label: copy.slow },
                    { id: "normal", label: copy.normal },
                    { id: "fast", label: copy.fast },
                    { id: "instant", label: copy.instant },
                  ]}
                />
              ) : null}
            </div>
            <div
              className={
                mode === "live"
                  ? "order-3 flex min-w-0 items-center gap-2 sm:order-2 sm:ml-auto sm:max-w-full @[58rem]:order-3 @[58rem]:ml-0"
                  : "order-3 flex shrink-0 items-center gap-2 sm:order-2 sm:ml-auto sm:min-w-0 sm:max-w-full @[58rem]:order-3 @[58rem]:ml-0"
              }
            >
              <Segmented
                label={copy.width}
                className="hidden shrink-0 sm:inline-flex"
                iconOnly
                value={width}
                onChange={setWidth}
                options={[
                  { id: "phone", label: copy.phone, icon: <Smartphone className="size-4" aria-hidden="true" /> },
                  { id: "chat", label: copy.chat, icon: <MessageSquare className="size-4" aria-hidden="true" /> },
                  { id: "wide", label: copy.wide, icon: <Monitor className="size-4" aria-hidden="true" /> },
                ]}
              />
              {mode === "demos" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  data-pg="replay"
                  aria-label={copy.replay}
                  onPress={() => playDemo(demo, speed, demoCopy(demo).prompt)}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{copy.replay}</span>
                </Button>
              ) : (
                <LiveSettingsButton
                  copy={copy}
                  live={live}
                  onLive={setLive}
                  useTools={useTools}
                  onUseTools={setUseTools}
                />
              )}
            </div>
          </div>

          <div className="pg-stage flex min-h-0 min-w-0 flex-1 flex-col" data-live={mode === "live" ? "" : undefined}>
            <ScrollShadow
              ref={thread}
              orientation="vertical"
              size={mode === "live" ? 72 : 48}
              className={
                mode === "live"
                  ? "min-h-0 min-w-0 flex-1 overflow-x-hidden px-3 py-6 sm:px-6"
                  : "min-h-0 flex-1 px-3 py-6 sm:px-6"
              }
            >
              <div className="pg-column" data-width={width}>
                {turns.length === 0 ? (
                  <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
                    <div className="mb-1 flex items-center gap-2.5">
                      <Logo className="size-11" />
                      <span className="text-lg font-semibold tracking-tight">Open Intelligent UI</span>
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight text-balance">{copy.emptyTitle}</h2>
                    <p className="text-sm leading-relaxed text-muted text-balance">
                      {mode === "live" ? copy.emptyLive : copy.emptyBody(theme.name)}
                    </p>
                    {mode === "live" ? (
                      <div className="mt-3 flex w-full max-w-full flex-col items-center gap-4">
                        <div className="flex w-full flex-col items-center gap-2">
                          <p className="text-xs font-medium tracking-wide text-muted uppercase">{copy.interfaceSuggestLabel}</p>
                          <div className="flex w-full flex-wrap justify-center gap-2">
                            {copy.suggest.map((text) => (
                              <Button
                                key={text}
                                size="sm"
                                variant="outline"
                                className="h-auto! max-w-full bg-background py-1.5 text-left whitespace-normal"
                                onPress={() => sendLive(text, "interface")}
                              >
                                {text}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="flex w-full flex-col items-center gap-2">
                          <p className="text-xs font-medium tracking-wide text-muted uppercase">{copy.designSuggestLabel}</p>
                          <div className="flex w-full flex-wrap justify-center gap-2">
                            {copy.designSuggest.map((text) => (
                              <Button
                                key={text}
                                size="sm"
                                variant="outline"
                                className="h-auto! max-w-full bg-background py-1.5 text-left whitespace-normal"
                                onPress={() => sendLive(text, "design")}
                              >
                                {text}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex w-full max-w-full flex-wrap justify-center gap-2">
                        {copy.suggest.map((text) => (
                          <Button key={text} size="sm" variant="outline" className="bg-background" onPress={() => say(text)}>
                            {text}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
                {turns.map((turn) =>
                  turn.role === "user" ? (
                    <div
                      key={turn.id}
                      data-pg="user"
                      className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-accent-foreground"
                    >
                      {turn.image ? <span className="mb-1 block text-xs opacity-80">{copy.screenshot}</span> : null}
                      {turn.text.replace(/\n\n<interface-data>[\s\S]*$/, "")}
                    </div>
                  ) : turn.role === "note" ? (
                    <div
                      key={turn.id}
                      data-pg="note"
                      className="max-w-[85%] self-center rounded-2xl bg-default px-3.5 py-1.5 text-center text-xs leading-relaxed text-muted"
                    >
                      {turn.text}
                    </div>
                  ) : turn.role === "design" ? (
                    <div key={turn.id} className="flex flex-col gap-3">
                      {turn.id === streamingId && !turn.text ? (
                        <div data-pg="pending" className="flex items-center gap-2 self-start text-sm text-muted">
                          <Spinner size="sm" />
                          {thinking ? copy.thinking : copy.writing}
                        </div>
                      ) : null}
                      <DesignCard source={turn.text} streaming={turn.id === streamingId} copy={copy}>
                        <Surface
                          key={`${renderer}:specimen:${turn.id}`}
                          renderer={renderer}
                          source={SPECIMEN}
                          streaming={false}
                          design={turn.text}
                          scheme={scheme}
                          tools={tools}
                          library={library}
                          onAction={onAction}
                          onTool={onTool}
                          onWarning={onWarning}
                          failed={copy.rendererFailed}
                          retry={copy.retry}
                        />
                      </DesignCard>
                    </div>
                  ) : (
                    <div key={turn.id} className="pg-reply contents">
                      {turn.id === streamingId ? (
                        <div
                          data-pg="pending"
                          className="flex items-center gap-2 self-start text-sm text-muted"
                        >
                          <Spinner size="sm" />
                          {thinking ? copy.thinking : copy.writing}
                        </div>
                      ) : null}
                      <Surface
                        key={`${renderer}:${turn.id}:${turn.round ?? 0}`}
                        renderer={renderer}
                        handle={turn.id === latestMarkup?.id ? handle : undefined}
                        source={turn.text}
                        streaming={turn.id === streamingId}
                        design={theme.design}
                        scheme={scheme}
                        tools={tools}
                        library={library}
                        onAction={onAction}
                        onTool={onTool}
                        onWarning={onWarning}
                        onStateChange={turn.id === latestMarkup?.id ? setSurfaceState : undefined}
                        failed={copy.rendererFailed}
                        retry={copy.retry}
                      />
                      {mode === "demos" &&
                      streamingId === null &&
                      turn.id === latestMarkup?.id &&
                      turn.text.trim() ? (
                        <LivePlaygroundPromo
                          titlePrefix={copy.liveGuideTitlePrefix}
                          titleAccent={copy.liveGuideTitleAccent}
                          titleSuffix={copy.liveGuideTitleSuffix}
                          body={copy.liveGuideBody}
                          action={copy.liveGuideAction}
                          onOpen={() => select(LIVE)}
                        />
                      ) : null}
                    </div>
                  )
                )}
              </div>
            </ScrollShadow>

            <LiveComposer
              copy={copy}
              mode={mode}
              width={width}
              lane={lane}
              onLane={setLane}
              draft={draft}
              onDraft={setDraft}
              draftRef={draftRef}
              shot={shot}
              onShot={setShot}
              streaming={streaming}
              onSubmit={submit}
              onStop={stop}
              onShare={share}
              onExport={exportStudio}
              onImport={importFile}
              onNew={fresh}
              canExport={canExport}
            />
          </div>
        </main>

        {roomy ? (
          <aside
            aria-label={copy.inspect}
            aria-hidden={!inspecting}
            inert={!inspecting ? true : undefined}
            className={
              inspecting
                ? "pg-inspect pg-inspect-open shrink-0 overflow-hidden border-l border-separator bg-background pt-2"
                : "pg-inspect shrink-0 overflow-hidden border-l border-transparent bg-background pt-2"
            }
          >
            <div className="pg-inspect-pane h-full w-[24rem]">{inspector}</div>
          </aside>
        ) : null}
      </div>

      {desktop ? null : (
        <Drawer.Backdrop isOpen={menu} onOpenChange={setMenu}>
          <Drawer.Content placement="left">
            <Drawer.Dialog aria-label={copy.examples} className="w-[20rem] max-w-[88vw] p-0">
              <Drawer.Body className="p-0">
                {sidebar}
                <div className="border-t border-separator p-4 sm:hidden">
                  <Segmented label="Language" value={locale} options={LOCALES} onChange={setLocale} />
                </div>
              </Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      )}

      {roomy ? null : (
        <Drawer.Backdrop isOpen={inspecting} onOpenChange={setInspecting}>
          <Drawer.Content placement="right">
            <Drawer.Dialog aria-label={copy.inspect} className="w-[24rem] max-w-[92vw] p-0 pt-2">
              <Drawer.Body className="h-full p-0">{inspector}</Drawer.Body>
            </Drawer.Dialog>
          </Drawer.Content>
        </Drawer.Backdrop>
      )}
    </div>
  )
}
