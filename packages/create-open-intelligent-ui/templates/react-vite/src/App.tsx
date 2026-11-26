import { useCallback, useState } from "react"
import { IntelligentUI } from "@open-intelligent-ui/react"
import "@open-intelligent-ui/react/styles.css"
import { type ChatMessage, type CheckedReply, checkReply, demoReply, liveReply } from "./chat"

type Turn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; streaming: boolean; ok?: boolean; issues?: CheckedReply["issues"] }

let nextId = 1

export function App() {
  const [input, setInput] = useState("Split an $86 bill four ways with an 18% tip.")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("Demo reply needs no API key. Live needs VITE_OPENAI_API_KEY.")

  const patchAssistant = useCallback((id: number, patch: Partial<Extract<Turn, { role: "assistant" }>>) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id && turn.role === "assistant" ? { ...turn, ...patch } : turn)))
  }, [])

  const runDemo = () => {
    const user: Turn = { id: nextId++, role: "user", text: input.trim() || "Show the demo bill split." }
    const checked = demoReply()
    const assistant: Turn = {
      id: nextId++,
      role: "assistant",
      text: checked.text,
      streaming: false,
      ok: checked.ok,
      issues: checked.issues,
    }
    setTurns((prev) => [...prev, user, assistant])
    setStatus(checked.ok ? "Demo reply checked clean." : `Demo reply has ${checked.issues.length} issue(s).`)
  }

  const runLive = async () => {
    const question = input.trim()
    if (!question || busy) return
    setBusy(true)
    const user: Turn = { id: nextId++, role: "user", text: question }
    const assistantId = nextId++
    setTurns((prev) => [...prev, user, { id: assistantId, role: "assistant", text: "", streaming: true }])
    setStatus("Calling the model…")
    setInput("")

    const history: ChatMessage[] = []
    for (const turn of [...turns, user]) {
      if (turn.role === "user") history.push({ role: "user", content: turn.text })
      if (turn.role === "assistant" && turn.text) history.push({ role: "assistant", content: turn.text })
    }

    try {
      const checked = await liveReply(history, (text) => {
        patchAssistant(assistantId, { text: checkReply(text).text, streaming: true })
      })
      patchAssistant(assistantId, {
        text: checked.text,
        streaming: false,
        ok: checked.ok,
        issues: checked.issues,
      })
      setStatus(
        checked.ok
          ? "Live reply checked clean."
          : `Live reply still has ${checked.issues.filter((i) => i.severity === "error").length} error(s) after repair.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      patchAssistant(assistantId, { text: "", streaming: false, ok: false })
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Open Intelligent UI starter</h1>
        <p>
          Prompt → stream → <code>checkMarkup</code> / repair → <code>&lt;IntelligentUI&gt;</code>. Use Demo without a
          key; set <code>.env</code> for Live.
        </p>
      </header>

      <div className="composer">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask for an interface…"
          disabled={busy}
        />
        <div className="actions">
          <button type="button" onClick={runDemo} disabled={busy}>
            Demo reply
          </button>
          <button type="button" className="secondary" onClick={runLive} disabled={busy}>
            Live
          </button>
        </div>
      </div>

      <p className="status">{status}</p>

      {turns.map((turn) => (
        <div className="turn" key={turn.id}>
          <div className="role">{turn.role}</div>
          {turn.role === "user" ? (
            <div>{turn.text}</div>
          ) : (
            <>
              <IntelligentUI
                source={turn.text}
                streaming={turn.streaming}
                onAction={(action) => {
                  if (action.type === "send") {
                    setInput(action.text)
                    setStatus(`send(): ${action.text}`)
                  }
                  return undefined
                }}
                onWarning={(message) => console.warn(message)}
              />
              {turn.ok === false && turn.issues && turn.issues.length > 0 ? (
                <pre className="issues">{turn.issues.map((issue) => `${issue.severity}: ${issue.message}`).join("\n")}</pre>
              ) : null}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
