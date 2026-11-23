import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/solid"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
// The demos, designs and the ticket system are the React playground's own files.
import { DEMOS } from "../../playground/src/demos"
import { THEMES } from "../../playground/src/themes"
import { createTicketTools } from "../../playground/src/tools"

type Demo = (typeof DEMOS)[number]

interface Noted {
  id: number
  kind: string
  text: string
}

const first = DEMOS[0] as Demo

export function App() {
  const [demo, setDemo] = createSignal<Demo>(first)
  const [themeId, setThemeId] = createSignal(first.theme ?? "paper")
  const [scheme, setScheme] = createSignal<"light" | "dark">("light")
  const [shown, setShown] = createSignal(first.source)
  const [streaming, setStreaming] = createSignal(false)
  const [state, setState] = createSignal<Record<string, unknown>>({})
  const [events, setEvents] = createSignal<Noted[]>([])

  const theme = createMemo(() => THEMES.find((item) => item.id === themeId()) ?? THEMES[0]!)
  let surface: IntelligentUIHandle | undefined
  let tools = createTicketTools()
  let timer: number | undefined
  let nextId = 1

  function note(kind: string, text: string) {
    setEvents((before) => [{ id: nextId++, kind, text }, ...before].slice(0, 40))
  }

  function stop() {
    window.clearInterval(timer)
    setStreaming(false)
  }

  function pick(next: Demo) {
    if (next.id === demo().id) return
    stop()
    tools = createTicketTools()
    setDemo(next)
    setThemeId(next.theme ?? "paper")
    setShown(next.source)
    setEvents([])
  }

  /** Feeds the reply in a few characters at a time, the way a model would. */
  function replay() {
    stop()
    const full = demo().source
    let length = 0
    setShown("")
    setStreaming(true)
    timer = window.setInterval(() => {
      length = Math.min(full.length, length + 14)
      setShown(full.slice(0, length))
      if (length === full.length) stop()
    }, 16)
  }

  function onAction(action: SurfaceAction) {
    if (action.type === "send") note("send", `${action.text} ${JSON.stringify(action.data ?? {})}`)
    else note(action.type, "url" in action ? action.url : "text" in action ? action.text : "")
    return undefined
  }

  function onTool(event: ToolEvent) {
    if (event.status !== "start") note(`tool ${event.status}`, `${event.tool} (${event.kind})`)
  }

  createEffect(scheme, (value) => document.documentElement.setAttribute("data-scheme", value))
  onCleanup(stop)

  return (
    <div class="sd">
      <header class="sd-top">
        <strong>Open Intelligent UI</strong>
        <span class="sd-tag">Solid renderer</span>
        <span class="sd-grow" />
        <label>
          Design
          <select value={themeId()} onChange={(event) => setThemeId(event.currentTarget.value)}>
            <For each={THEMES}>{(item) => <option value={item.id}>{item.name}</option>}</For>
          </select>
        </label>
        <button type="button" onClick={() => setScheme(scheme() === "light" ? "dark" : "light")}>
          {scheme() === "light" ? "Dark" : "Light"}
        </button>
        <button type="button" onClick={() => (streaming() ? stop() : replay())}>
          {streaming() ? "Stop" : "Replay as a stream"}
        </button>
        <button type="button" onClick={() => surface?.reset()}>
          Reset state
        </button>
      </header>

      <nav class="sd-side" aria-label="Demos">
        <For each={DEMOS}>
          {(item) => (
            <button type="button" aria-current={item.id === demo().id ? "true" : "false"} onClick={() => pick(item)}>
              <strong>{item.title}</strong>
              <span>{item.caption}</span>
            </button>
          )}
        </For>
      </nav>

      <main class="sd-main">
        <p class="sd-ask">{demo().prompt}</p>
        {/* Keyed, so another demo starts from a new surface with its own state. */}
        <Show when={demo()} keyed>
          {(_shown) => (
            <IntelligentUI
              ref={(handle) => (surface = handle)}
              class="sd-surface"
              source={shown()}
              streaming={streaming()}
              design={theme().source}
              scheme={scheme()}
              tools={tools}
              onAction={onAction}
              onTool={onTool}
              onWarning={(message) => note("warning", message)}
              onStateChange={(next) => setState(next)}
            />
          )}
        </Show>
      </main>

      <aside class="sd-inspect">
        <h2>State</h2>
        <pre>{JSON.stringify(state(), null, 2)}</pre>
        <h2>Events</h2>
        <Show
          when={events().length > 0}
          fallback={<p class="sd-dim">Actions, tool calls and warnings show up here.</p>}
        >
          <ul>
            <For each={events()}>
              {(event) => (
                <li>
                  <b>{event.kind}</b> {event.text}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </aside>
    </div>
  )
}
