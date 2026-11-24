import { Button, Chip, Drawer, InputGroup, Link, Spinner, Tooltip } from "@heroui/react"
import { defineLibrary, type SurfaceAction, type ToolEvent } from "@open-intelligent-ui/core"
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import {
  ArrowUp,
  Check,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  PanelRight,
  RotateCcw,
  Smartphone,
  Square,
  Sun,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { DEMOS, type Demo } from "./demos"
import { LOCALES, readLocale, t, writeLocale, type Locale } from "./i18n"
import { CHARTS, type ChartsId, MOTIONS, type MotionId, useEngines } from "./library/engines"
import { type ChatMessage, type LiveSettings, providerById, streamChat, unwrapFence } from "./live"
import { Surface } from "./surface/Surface"
import { RENDERERS, type RendererId, type SurfaceHandle } from "./surface/types"
import { THEMES } from "./themes"
import { createTicketTools, TICKET_TOOLS } from "./tools"
import { GitHubMark, Logo, Picker, Segmented } from "./ui/controls"
import { Inspector, type LogEntry, type Panel } from "./ui/Inspector"
import { LiveSettingsButton } from "./ui/LiveSettings"
import { LIVE, Sidebar } from "./ui/Sidebar"

type Scheme = "light" | "dark"
type Mode = "demos" | "live"
type Width = "phone" | "chat" | "wide"

interface Turn {
  id: number
  role: "user" | "assistant" | "note"
  text: string
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
    live: query.get("demo") === LIVE,
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

export function App() {
  const query = useMemo(readQuery, [])
  const [locale, setLocale] = useState<Locale>(() => query.locale ?? readLocale())
  const copy = t(locale)
  const [mode, setMode] = useState<Mode>(query.live ? "live" : "demos")
  const [demo, setDemo] = useState<Demo>(query.demo ?? (DEMOS[0] as Demo))
  const [themeId, setThemeId] = useState(query.design ?? demo.theme ?? "paper")
  const [scheme, setScheme] = useState<Scheme>(
    () => query.scheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
  )
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
  const [turns, setTurns] = useState<Turn[]>([])
  const [streamingId, setStreamingId] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [surfaceState, setSurfaceState] = useState<Record<string, unknown>>({})
  const [log, setLog] = useState<LogEntry[]>([])
  const [live, setLive] = useState<LiveSettings>(readLiveSettings)
  const [draft, setDraft] = useState("")
  const [useTools, setUseTools] = useState(true)

  const theme = THEMES.find((item) => item.id === themeId) ?? (THEMES[0] as (typeof THEMES)[number])
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
      let last = performance.now()
      const step = (now: number) => {
        shown = Math.min(source.length, shown + ((now - last) / 1000) * charsPerSecond)
        last = now
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
    async (history: Turn[]) => {
      stop()
      const reply: Turn = { id: nextId++, role: "assistant", text: "" }
      setTurns([...history, reply])
      setStreamingId(reply.id)
      const controller = new AbortController()
      abort.current = controller
      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...history
          .filter((turn) => turn.role !== "note")
          .map((turn) => ({ role: turn.role as "user" | "assistant", content: turn.text })),
      ]
      let text = ""
      setThinking(false)
      try {
        for await (const part of streamChat({
          ...live,
          messages,
          signal: controller.signal,
          onReasoning: () => {
            if (!text) setThinking(true)
          },
        })) {
          if (text.length === 0) setThinking(false)
          text += part
          patchTurn(reply.id, unwrapFence(text))
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
    [live, systemPrompt, patchTurn, stop]
  )

  const say = useCallback(
    (text: string, data?: unknown) => {
      const content =
        data === undefined ? text : `${text}\n\n<interface-data>${JSON.stringify(data)}</interface-data>`
      const user: Turn = { id: nextId++, role: "user", text: content }
      if (mode === "live" && live.model) {
        void askModel([...turnsRef.current, user])
        return
      }
      setTurns((list) => [
        ...list,
        user,
        {
          id: nextId++,
          role: "note",
          text: mode === "live" ? copyRef.current.connectNote : copyRef.current.demoNote,
        },
      ])
    },
    [mode, live.model, askModel]
  )

  // Speed applies to the next playback, not the one running.
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => {
    if (mode === "demos") {
      const prompt = t(locale).demos[demo.id]?.prompt ?? demo.prompt
      playDemo(demo, speedRef.current, prompt)
    }
  }, [mode, demo, locale, playDemo])

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

  // A reply is read from its top, so only a follow-up message scrolls down.
  const turnCount = turns.length
  useEffect(() => {
    const node = thread.current
    if (!node) return
    if (turnCount <= 2) node.scrollTo({ top: 0 })
    else node.scrollTo({ top: node.scrollHeight, behavior: "smooth" })
  }, [turnCount])

  const latestSurface = [...turns].reverse().find((turn) => turn.role === "assistant")

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
      setMode("live")
      setTurns([])
      setLog([])
      setSurfaceState({})
      return
    }
    const next = DEMOS.find((item) => item.id === id)
    if (!next) return
    setMode("demos")
    setDemo(next)
    if (next.theme) setThemeId(next.theme)
    else if (demo.theme) setThemeId("paper")
  }

  const chooseRenderer = (next: RendererId) => {
    // Another renderer starts the surface over, so what the old one held is gone.
    setSurfaceState({})
    setRenderer(next)
  }

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    say(text)
  }

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
      source={latestSurface?.text ?? ""}
      onSource={(text) => {
        if (!latestSurface) return
        stop()
        patchTurn(latestSurface.id, text)
      }}
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
        <a href={REPOSITORY} target="_blank" rel="noreferrer" className="flex items-center gap-2.5">
          <Logo className="size-6 text-accent" />
          <span className="text-[15px] font-semibold tracking-tight">Open Intelligent UI</span>
        </a>
        <Chip size="sm" variant="soft" className="hidden sm:inline-flex">
          v{__VERSION__}
        </Chip>
        <span className="flex-1" />
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

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-separator bg-background px-3 py-2 sm:px-4">
            <Chip size="sm" variant="soft" color={streaming ? "accent" : "success"} data-pg="status" data-live={streaming}>
              {streaming ? <Spinner size="sm" color="current" className="size-3" /> : <Check className="size-3" aria-hidden="true" />}
              {status}
            </Chip>
            <span className="flex-1" />
            <span title={copy.rendererHint}>
              <Picker
                label={copy.renderer}
                value={renderer}
                onChange={chooseRenderer}
                options={RENDERERS}
              />
            </span>
            <Picker
              label={copy.design}
              value={themeId}
              onChange={setThemeId}
              options={THEMES.map((item) => ({ id: item.id, label: item.name }))}
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
            <Segmented
              label={copy.width}
              className="hidden md:inline-flex"
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
              <>
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
                <Button
                  size="sm"
                  variant="secondary"
                  data-pg="replay"
                  aria-label={copy.replay}
                  onPress={() => playDemo(demo, speed, demoCopy(demo).prompt)}
                >
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{copy.replay}</span>
                </Button>
              </>
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

          <div ref={thread} className="pg-stage min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-6">
            <div className="pg-column" data-width={width}>
              {turns.length === 0 ? (
                <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-16 text-center">
                  <Logo className="size-10 text-accent" />
                  <h2 className="text-2xl font-semibold tracking-tight text-balance">{copy.emptyTitle}</h2>
                  <p className="text-sm leading-relaxed text-muted">{copy.emptyBody(theme.name)}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {copy.suggest.map((text) => (
                      <Button key={text} size="sm" variant="outline" className="bg-background" onPress={() => say(text)}>
                        {text}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div
                    key={turn.id}
                    data-pg="user"
                    className="max-w-[85%] self-end rounded-3xl rounded-br-lg bg-accent px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-accent-foreground"
                  >
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
                ) : thinking && turn.id === streamingId && !turn.text ? (
                  <div key={turn.id} data-pg="note" className="flex items-center gap-2 self-start text-sm text-muted">
                    <Spinner size="sm" />
                    {copy.thinking}
                  </div>
                ) : (
                  <Surface
                    key={`${renderer}:${turn.id}`}
                    renderer={renderer}
                    handle={turn.id === latestSurface?.id ? handle : undefined}
                    source={turn.text}
                    streaming={turn.id === streamingId}
                    design={theme.design}
                    scheme={scheme}
                    tools={tools}
                    library={library}
                    onAction={onAction}
                    onTool={onTool}
                    onWarning={onWarning}
                    onStateChange={turn.id === latestSurface?.id ? setSurfaceState : undefined}
                    failed={copy.rendererFailed}
                    retry={copy.retry}
                  />
                )
              )}
            </div>
          </div>

          <form
            className="shrink-0 border-t border-separator bg-background px-3 py-3 sm:px-6"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <InputGroup className="mx-auto w-full max-w-[780px] rounded-full pr-1">
              <InputGroup.Input
                className="pl-4"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={mode === "live" ? copy.askInterface : copy.replyAgent}
                aria-label={copy.message}
              />
              <InputGroup.Suffix className="pr-0">
                {streaming && mode === "live" ? (
                  <Button isIconOnly size="sm" variant="secondary" aria-label={copy.stop} onPress={stop}>
                    <Square className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button isIconOnly size="sm" type="submit" aria-label={copy.send} isDisabled={!draft.trim()}>
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </Button>
                )}
              </InputGroup.Suffix>
            </InputGroup>
          </form>
        </main>

        {inspecting && roomy ? (
          <aside aria-label={copy.inspect} className="w-[24rem] shrink-0 border-l border-separator bg-background pt-2">
            {inspector}
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
