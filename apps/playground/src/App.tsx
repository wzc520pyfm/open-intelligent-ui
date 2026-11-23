import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/react"
import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DEMOS, type Demo } from "./demos"
import { LOCALES, readLocale, t, writeLocale, type Locale } from "./i18n"
import {
  type ChatMessage,
  type LiveSettings,
  type ProviderId,
  PROVIDERS,
  providerById,
  streamChat,
  unwrapFence,
} from "./live"
import { THEMES } from "./themes"
import { createTicketTools, TICKET_TOOLS } from "./tools"

type Scheme = "light" | "dark"
type Mode = "demos" | "live"
type Panel = "source" | "state" | "events" | "prompt"
type Width = "phone" | "chat" | "wide"

interface Turn {
  id: number
  role: "user" | "assistant" | "note"
  text: string
}

interface LogEntry {
  id: number
  time: string
  kind: "send" | "tool" | "toast" | "copy" | "open" | "warning"
  title: string
  detail?: string
}

const SPEEDS = [
  { id: "slow", charsPerSecond: 350 },
  { id: "normal", charsPerSecond: 1400 },
  { id: "fast", charsPerSecond: 6000 },
  { id: "instant", charsPerSecond: Number.POSITIVE_INFINITY },
] as const

const WIDTHS: Width[] = ["phone", "chat", "wide"]

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

function preview(value: unknown): string {
  if (value === undefined) return ""
  try {
    const text = JSON.stringify(value)
    return text.length > 220 ? `${text.slice(0, 220)}…` : text
  } catch {
    return String(value)
  }
}

function providerLabel(locale: Locale, id: ProviderId): string {
  const copy = t(locale)
  if (id === "openai") return copy.providerOpenAI
  if (id === "anthropic") return copy.providerAnthropic
  if (id === "deepseek") return copy.providerDeepSeek
  return copy.providerCustom
}

export function App() {
  const [locale, setLocale] = useState<Locale>(readLocale)
  const copy = t(locale)
  const [mode, setMode] = useState<Mode>("demos")
  const [demo, setDemo] = useState<Demo>(DEMOS[0] as Demo)
  const [themeId, setThemeId] = useState(demo.theme ?? "paper")
  const [scheme, setScheme] = useState<Scheme>(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  )
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]["id"]>("normal")
  const [width, setWidth] = useState<Width>("chat")
  const [panel, setPanel] = useState<Panel | null>("source")
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
  const handle = useRef<IntelligentUIHandle>(null)
  const turnsRef = useRef(turns)
  turnsRef.current = turns
  const copyRef = useRef(copy)
  copyRef.current = copy

  const demoCopy = (item: Demo) => copy.demos[item.id] ?? { title: item.title, caption: item.caption, prompt: item.prompt }

  const systemPrompt = useMemo(
    () =>
      buildSystemPrompt({
        design: theme.source,
        ...(useTools ? { tools: TICKET_TOOLS } : null),
      }),
    [theme, useTools]
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
    document.documentElement.dataset.scheme = scheme
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

  const selectDemo = (next: Demo) => {
    setMode("demos")
    setDemo(next)
    if (next.theme) setThemeId(next.theme)
    else if (demo.theme) setThemeId("paper")
  }

  const startLive = () => {
    stop()
    setMode("live")
    setTurns([])
    setLog([])
    setSurfaceState({})
  }

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft("")
    say(text)
  }

  const chooseProvider = (id: ProviderId) => {
    const preset = providerById(id)
    setLive((current) => ({
      provider: preset.id,
      // Custom keeps whatever URL the reader already typed.
      baseUrl: preset.id === "custom" ? current.baseUrl : preset.baseUrl,
      model: preset.model || current.model,
      apiKey: current.apiKey,
    }))
  }

  const widthLabel = (id: Width) =>
    id === "phone" ? copy.phone : id === "chat" ? copy.chat : copy.wide

  const speedLabel = (id: (typeof SPEEDS)[number]["id"]) =>
    id === "slow"
      ? copy.slow
      : id === "normal"
        ? copy.normal
        : id === "fast"
          ? copy.fast
          : copy.instant

  const customEndpoint = live.provider === "custom"

  return (
    <div className="pg">
      <header className="pg-top">
        <div className="pg-brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M7 15.5 L11 8.5 L13.5 13 L17 9"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Open Intelligent UI</span>
        </div>
        <div className="pg-controls">
          <div className="pg-seg pg-lang" role="group" aria-label="Language">
            {LOCALES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={locale === item.id}
                onClick={() => setLocale(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="pg-field">
            <span>{copy.design}</span>
            <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
              {THEMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pg-seg pg-widths" role="group" aria-label={copy.width}>
            {WIDTHS.map((id) => (
              <button key={id} type="button" aria-pressed={width === id} onClick={() => setWidth(id)}>
                {widthLabel(id)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pg-icon"
            aria-label={scheme === "dark" ? copy.switchToLight : copy.switchToDark}
            onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
          >
            {scheme === "dark" ? (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path
                  d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="pg-button"
            aria-pressed={panel !== null}
            onClick={() => setPanel(panel === null ? "source" : null)}
          >
            {copy.inspect}
          </button>
        </div>
      </header>

      <div className="pg-body">
        <nav className="pg-side" aria-label={copy.examples}>
          <p className="pg-side-title">{copy.agentAsked}</p>
          {DEMOS.map((item) => {
            const text = demoCopy(item)
            return (
              <button
                key={item.id}
                type="button"
                className="pg-demo"
                aria-current={mode === "demos" && demo.id === item.id}
                onClick={() => selectDemo(item)}
              >
                <span className="pg-demo-kind">{text.title}</span>
                <span className="pg-demo-prompt">{text.prompt}</span>
                <span className="pg-demo-caption">{text.caption}</span>
              </button>
            )
          })}
          <p className="pg-side-title">{copy.askYourself}</p>
          <button type="button" className="pg-demo" aria-current={mode === "live"} onClick={startLive}>
            <span className="pg-demo-kind">{copy.live}</span>
            <span className="pg-demo-prompt">{copy.connectModel}</span>
            <span className="pg-demo-caption">{copy.liveCaption}</span>
          </button>
        </nav>

        <main className="pg-main">
          {mode === "demos" ? (
            <div className="pg-bar">
              <span className="pg-status" data-live={streamingId !== null}>
                {streamingId !== null ? (thinking ? copy.thinking : copy.writing) : copy.done}
              </span>
              <span className="pg-spacer" />
              <label className="pg-field">
                <span>{copy.speed}</span>
                <select value={speed} onChange={(event) => setSpeed(event.target.value as typeof speed)}>
                  {SPEEDS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {speedLabel(item.id)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="pg-button"
                onClick={() => playDemo(demo, speed, demoCopy(demo).prompt)}
              >
                {copy.replay}
              </button>
            </div>
          ) : (
            <div className="pg-bar pg-live">
              <label className="pg-field">
                <span>{copy.provider}</span>
                <select
                  value={live.provider}
                  onChange={(event) => chooseProvider(event.target.value as ProviderId)}
                >
                  {PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {providerLabel(locale, item.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="pg-field pg-endpoint">
                <span>{copy.endpoint}</span>
                <input
                  value={live.baseUrl}
                  onChange={(event) => setLive({ ...live, baseUrl: event.target.value })}
                  placeholder={
                    customEndpoint
                      ? "https://your-gateway.example/v1"
                      : providerById(live.provider).baseUrl
                  }
                  spellCheck={false}
                  readOnly={!customEndpoint}
                />
              </label>
              <label className="pg-field">
                <span>{copy.model}</span>
                <input
                  value={live.model}
                  onChange={(event) => setLive({ ...live, model: event.target.value })}
                  placeholder={providerById(live.provider).model || "model name"}
                  spellCheck={false}
                />
              </label>
              <label className="pg-field">
                <span>{copy.key}</span>
                <input
                  type="password"
                  value={live.apiKey}
                  onChange={(event) => setLive({ ...live, apiKey: event.target.value })}
                  placeholder={copy.keyPlaceholder}
                  autoComplete="off"
                />
              </label>
              <label className="pg-check">
                <input
                  type="checkbox"
                  checked={useTools}
                  onChange={(event) => setUseTools(event.target.checked)}
                />
                {copy.ticketTools}
              </label>
            </div>
          )}

          <div className="pg-thread" ref={thread} data-width={width}>
            <div className="pg-column">
              {turns.length === 0 ? (
                <div className="pg-empty">
                  <h1>{copy.emptyTitle}</h1>
                  <p>{copy.emptyBody(theme.name)}</p>
                  <div className="pg-suggest">
                    {copy.suggest.map((text) => (
                      <button key={text} type="button" onClick={() => say(text)}>
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {turns.map((turn) =>
                turn.role === "user" ? (
                  <div key={turn.id} className="pg-user">
                    {turn.text.replace(/\n\n<interface-data>[\s\S]*$/, "")}
                  </div>
                ) : turn.role === "note" ? (
                  <div key={turn.id} className="pg-note">
                    {turn.text}
                  </div>
                ) : thinking && turn.id === streamingId && !turn.text ? (
                  <div key={turn.id} className="pg-note">
                    {copy.thinking}
                  </div>
                ) : (
                  <IntelligentUI
                    key={turn.id}
                    ref={turn.id === latestSurface?.id ? handle : undefined}
                    className="pg-surface"
                    source={turn.text}
                    streaming={turn.id === streamingId}
                    design={theme.source}
                    scheme={scheme}
                    tools={tools}
                    onAction={onAction}
                    onTool={onTool}
                    onWarning={onWarning}
                    onStateChange={turn.id === latestSurface?.id ? setSurfaceState : undefined}
                  />
                )
              )}
            </div>
          </div>

          <form
            className="pg-composer"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={mode === "live" ? copy.askInterface : copy.replyAgent}
              aria-label={copy.message}
            />
            {streamingId !== null && mode === "live" ? (
              <button type="button" className="pg-button" onClick={stop}>
                {copy.stop}
              </button>
            ) : (
              <button type="submit" className="pg-button pg-primary" disabled={!draft.trim()}>
                {copy.send}
              </button>
            )}
          </form>
        </main>

        {panel !== null ? (
          <aside className="pg-inspect" aria-label={copy.inspect}>
            <div className="pg-tabs" role="tablist">
              {(
                [
                  ["source", copy.markup],
                  ["state", copy.state],
                  ["events", `${copy.events}${log.length ? ` ${log.length}` : ""}`],
                  ["prompt", copy.prompt],
                ] as [Panel, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panel === id}
                  onClick={() => setPanel(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {panel === "source" ? (
              <>
                <p className="pg-hint">{copy.markupHint}</p>
                <textarea
                  className="pg-code"
                  spellCheck={false}
                  aria-label={copy.markup}
                  value={latestSurface?.text ?? ""}
                  onChange={(event) => {
                    if (!latestSurface) return
                    stop()
                    patchTurn(latestSurface.id, event.target.value)
                  }}
                />
              </>
            ) : null}
            {panel === "state" ? (
              <>
                <p className="pg-hint">{copy.stateHint}</p>
                <pre className="pg-code">{JSON.stringify(surfaceState, null, 2)}</pre>
                <div className="pg-row">
                  <button type="button" className="pg-button" onClick={() => handle.current?.reset()}>
                    {copy.resetState}
                  </button>
                </div>
              </>
            ) : null}
            {panel === "events" ? (
              <>
                <p className="pg-hint">{copy.eventsHint}</p>
                <ol className="pg-log">
                  {log.length === 0 ? <li className="pg-log-empty">{copy.eventsEmpty}</li> : null}
                  {log.map((entry) => (
                    <li key={entry.id} data-kind={entry.kind}>
                      <span className="pg-log-kind">{entry.kind}</span>
                      <span className="pg-log-time">{entry.time}</span>
                      <span className="pg-log-title">{entry.title}</span>
                      {entry.detail ? <span className="pg-log-detail">{entry.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              </>
            ) : null}
            {panel === "prompt" ? (
              <>
                <p className="pg-hint">
                  {copy.promptHint(theme.name, Math.round(systemPrompt.length / 4 / 100) / 10)}
                </p>
                <pre className="pg-code">{systemPrompt}</pre>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
