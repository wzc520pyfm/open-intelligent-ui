"use client"

import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import { useTheme } from "fumadocs-ui/provider/base"
import { ChevronDown, ChevronUp, Play, RotateCcw } from "lucide-react"
import dynamic from "next/dynamic"
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { wordsFor } from "@/lib/words"
import { createTicketTools } from "../../../playground/src/tools"
import type { DesignName } from "./live-surface"

/** Written out, so the page doesn't load the designs before the renderer does. */
const DESIGNS: DesignName[] = ["paper", "noir", "heritage", "signal"]

const LiveSurface = dynamic(() => import("./live-surface"), { ssr: false, loading: () => <Waiting /> })

function Waiting() {
  return <p className="docs-demo-wait">{wordsFor(useI18n().locale).loading}</p>
}

interface Note {
  id: number
  kind: string
  text: string
}

/**
 * An example from a page: the interface, drawn by the renderer, above the
 * markup that makes it. It can be used, put back, and streamed again.
 */
export function LiveExample(props: {
  source: string
  /** Uses the made-up product's components (`Steps`, `Person`, `PolicyCheck`). */
  product?: boolean
  /** Shows the design switch. */
  designs?: boolean
  /** The highlighted markup. */
  children?: ReactNode
}) {
  const words = wordsFor(useI18n().locale)
  const { resolvedTheme } = useTheme()
  const [shown, setShown] = useState(props.source)
  const [streaming, setStreaming] = useState(false)
  const [design, setDesign] = useState<DesignName>("paper")
  const [round, setRound] = useState(0)
  const [notes, setNotes] = useState<Note[]>([])
  const [tools, setTools] = useState(() => createTicketTools(250))
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const nextId = useRef(1)

  const note = useCallback((kind: string, text: string) => {
    setNotes((list) => [{ id: nextId.current++, kind, text }, ...list].slice(0, 4))
  }, [])

  const stop = useCallback(() => {
    window.clearInterval(timer.current)
    setStreaming(false)
  }, [])

  const reset = useCallback(() => {
    stop()
    setTools(createTicketTools(250))
    setNotes([])
    setShown(props.source)
    setRound((value) => value + 1)
  }, [props.source, stop])

  /** Feeds the markup in a few characters at a time, the way a model's reply arrives. */
  const replay = useCallback(() => {
    reset()
    const full = props.source
    let length = 0
    setShown("")
    setStreaming(true)
    timer.current = window.setInterval(() => {
      length = Math.min(full.length, length + 6)
      setShown(full.slice(0, length))
      if (length === full.length) stop()
    }, 16)
  }, [props.source, reset, stop])

  useEffect(() => () => window.clearInterval(timer.current), [])

  const onAction = useCallback(
    (action: SurfaceAction) => {
      if (action.type !== "send") return undefined
      const data = action.data === undefined ? "" : ` ${JSON.stringify(action.data)}`
      note(words.sent, `${action.text}${data}`)
      return true
    },
    [note, words.sent]
  )

  const onTool = useCallback(
    (event: ToolEvent) => {
      if (event.status === "done" && event.kind === "write") note(words.called, event.tool)
    },
    [note, words.called]
  )

  const onWarning = useCallback((message: string) => note(words.warned, message), [note, words.warned])

  return (
    <div className="docs-demo not-prose" data-live>
      <div className="docs-demo-stage">
        <div className="docs-demo-bar">
          <span className="docs-demo-tag" data-streaming={streaming}>
            {words.preview}
          </span>
          <span className="flex-1" />
          {props.designs ? (
            <fieldset className="docs-demo-designs" aria-label={words.design}>
              {DESIGNS.map((name) => (
                <button key={name} type="button" aria-pressed={design === name} onClick={() => setDesign(name)}>
                  {name[0]?.toUpperCase() + name.slice(1)}
                </button>
              ))}
            </fieldset>
          ) : null}
          <button type="button" className="docs-soft-pill" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            {words.reset}
          </button>
          <button type="button" className="docs-soft-pill" onClick={replay}>
            <Play aria-hidden="true" />
            {words.replay}
          </button>
        </div>
        <div className="docs-demo-surface">
          <LiveSurface
            key={round}
            source={shown}
            streaming={streaming}
            design={design}
            scheme={resolvedTheme === "dark" ? "dark" : "light"}
            product={Boolean(props.product)}
            tools={tools}
            onAction={onAction}
            onTool={onTool}
            onWarning={onWarning}
          />
        </div>
        {notes.length ? (
          <ul className="docs-demo-notes" aria-live="polite">
            {notes.map((item) => (
              <li key={item.id}>
                <span className="docs-demo-kind">{item.kind}</span>
                {item.text}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="docs-demo-code" data-open={open}>
        {props.children}
        <button type="button" className="docs-soft-pill docs-demo-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? words.hideCode : words.viewCode}
          {open ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}
