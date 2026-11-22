import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/react"
import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DEMOS, type Demo } from "./demos"
import { type ChatMessage, type LiveSettings, streamChat, unwrapFence } from "./live"
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
  { id: "slow", label: "Slow", charsPerSecond: 350 },
  { id: "normal", label: "Normal", charsPerSecond: 1400 },
  { id: "fast", label: "Fast", charsPerSecond: 6000 },
  { id: "instant", label: "Instant", charsPerSecond: Number.POSITIVE_INFINITY },
] as const

const WIDTHS: { id: Width; label: string }[] = [
  { id: "phone", label: "Phone" },
  { id: "chat", label: "Chat" },
  { id: "wide", label: "Wide" },
]

const LIVE_KEY = "oiui.live"
let nextId = 1

function readLiveSettings(): LiveSettings {
  const fallback = { baseUrl: "https://api.openai.com/v1", model: "", apiKey: "" }
  try {
    const stored = JSON.parse(sessionStorage.getItem(LIVE_KEY) ?? "null") as Partial<LiveSettings> | null
    return { ...fallback, ...stored }
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

export function App() {
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
    (next: Demo, speedId: string) => {
      stop()
      const user: Turn = { id: nextId++, role: "user", text: next.prompt }
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
      try {
        for await (const part of streamChat({ ...live, messages, signal: controller.signal })) {
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
          text:
            mode === "live"
              ? "Connect a model above to get a reply."
              : "In a live session this message goes back to the agent, together with the interface's state, and the agent answers with the next interface.",
        },
      ])
    },
    [mode, live.model, askModel]
  )

  // Speed applies to the next playback, not the one running.
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => {
    if (mode === "demos") playDemo(demo, speedRef.current)
  }, [mode, demo, playDemo])

  useEffect(() => {
    document.documentElement.dataset.scheme = scheme
  }, [scheme])

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

  return (
    <div className="pg">
      <header className="pg-top">
        <div className="pg-brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7 15.5 L11 8.5 L13.5 13 L17 9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Open Intelligent UI</span>
        </div>
        <div className="pg-controls">
          <label className="pg-field">
            <span>Design</span>
            <select value={themeId} onChange={(event) => setThemeId(event.target.value)}>
              {THEMES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="pg-seg" role="group" aria-label="Width">
            {WIDTHS.map((item) => (
              <button key={item.id} type="button" aria-pressed={width === item.id} onClick={() => setWidth(item.id)}>
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pg-icon"
            aria-label={scheme === "dark" ? "Switch to light" : "Switch to dark"}
            onClick={() => setScheme(scheme === "dark" ? "light" : "dark")}
          >
            {scheme === "dark" ? (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.2 8.2 0 1 0 20 14.2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="pg-button"
            aria-pressed={panel !== null}
            onClick={() => setPanel(panel === null ? "source" : null)}
          >
            Inspect
          </button>
        </div>
      </header>

      <div className="pg-body">
        <nav className="pg-side" aria-label="Examples">
          <p className="pg-side-title">An agent was asked</p>
          {DEMOS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="pg-demo"
              aria-current={mode === "demos" && demo.id === item.id}
              onClick={() => selectDemo(item)}
            >
              <span className="pg-demo-kind">{item.title}</span>
              <span className="pg-demo-prompt">{item.prompt}</span>
              <span className="pg-demo-caption">{item.caption}</span>
            </button>
          ))}
          <p className="pg-side-title">Or ask one yourself</p>
          <button type="button" className="pg-demo" aria-current={mode === "live"} onClick={startLive}>
            <span className="pg-demo-kind">Live</span>
            <span className="pg-demo-prompt">Connect a model</span>
            <span className="pg-demo-caption">Any OpenAI-compatible endpoint. Your key stays in this tab.</span>
          </button>
        </nav>

        <main className="pg-main">
          {mode === "demos" ? (
            <div className="pg-bar">
              <span className="pg-status" data-live={streamingId !== null}>
                {streamingId !== null ? "Writing…" : "Done"}
              </span>
              <span className="pg-spacer" />
              <label className="pg-field">
                <span>Speed</span>
                <select value={speed} onChange={(event) => setSpeed(event.target.value as typeof speed)}>
                  {SPEEDS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="pg-button" onClick={() => playDemo(demo, speed)}>
                Replay
              </button>
            </div>
          ) : (
            <div className="pg-bar pg-live">
              <label className="pg-field">
                <span>Endpoint</span>
                <input
                  value={live.baseUrl}
                  onChange={(event) => setLive({ ...live, baseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                />
              </label>
              <label className="pg-field">
                <span>Model</span>
                <input
                  value={live.model}
                  onChange={(event) => setLive({ ...live, model: event.target.value })}
                  placeholder="model name"
                  spellCheck={false}
                />
              </label>
              <label className="pg-field">
                <span>Key</span>
                <input
                  type="password"
                  value={live.apiKey}
                  onChange={(event) => setLive({ ...live, apiKey: event.target.value })}
                  placeholder="kept in this tab only"
                  autoComplete="off"
                />
              </label>
              <label className="pg-check">
                <input type="checkbox" checked={useTools} onChange={(event) => setUseTools(event.target.checked)} />
                Ticket tools
              </label>
            </div>
          )}

          <div className="pg-thread" ref={thread} data-width={width}>
            <div className="pg-column">
              {turns.length === 0 ? (
                <div className="pg-empty">
                  <h1>Ask for anything you would rather see than read.</h1>
                  <p>
                    The model gets the language, the UI SDK behaviors, the {theme.name} design and the motion rules as
                    its system prompt, and answers in markup that renders as it streams.
                  </p>
                  <div className="pg-suggest">
                    {[
                      "Compare a 15-year and a 30-year mortgage on a $400k home",
                      "Help me plan a dinner party for 8",
                      "Give me a place to work the support queue",
                    ].map((text) => (
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
              placeholder={mode === "live" ? "Ask for an interface" : "Reply to the agent"}
              aria-label="Message"
            />
            {streamingId !== null && mode === "live" ? (
              <button type="button" className="pg-button" onClick={stop}>
                Stop
              </button>
            ) : (
              <button type="submit" className="pg-button pg-primary" disabled={!draft.trim()}>
                Send
              </button>
            )}
          </form>
        </main>

        {panel !== null ? (
          <aside className="pg-inspect" aria-label="Inspector">
            <div className="pg-tabs" role="tablist">
              {(
                [
                  ["source", "Markup"],
                  ["state", "State"],
                  ["events", `Events${log.length ? ` ${log.length}` : ""}`],
                  ["prompt", "Prompt"],
                ] as [Panel, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>
                  {label}
                </button>
              ))}
            </div>
            {panel === "source" ? (
              <>
                <p className="pg-hint">
                  What the agent wrote. Edit it and the interface follows; its state is kept.
                </p>
                <textarea
                  className="pg-code"
                  spellCheck={false}
                  aria-label="Markup"
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
                <p className="pg-hint">
                  What the interface remembers. It travels with every message sent back to the agent.
                </p>
                <pre className="pg-code">{JSON.stringify(surfaceState, null, 2)}</pre>
                <div className="pg-row">
                  <button type="button" className="pg-button" onClick={() => handle.current?.reset()}>
                    Reset state
                  </button>
                </div>
              </>
            ) : null}
            {panel === "events" ? (
              <>
                <p className="pg-hint">Messages to the agent, tool calls and warnings, newest first.</p>
                <ol className="pg-log">
                  {log.length === 0 ? <li className="pg-log-empty">Nothing yet. Use the interface.</li> : null}
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
                  The system prompt built from the language guide, UI SDK, the {theme.name} DESIGN.md and the motion
                  rules. About {Math.round(systemPrompt.length / 4 / 100) / 10}k tokens.
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
