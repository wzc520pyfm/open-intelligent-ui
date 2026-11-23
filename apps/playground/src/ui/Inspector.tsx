import { Button, Chip, Tabs } from "@heroui/react"
import { RotateCcw } from "lucide-react"
import type { Copy } from "../i18n"

export type Panel = "source" | "state" | "events" | "prompt"

export interface LogEntry {
  id: number
  time: string
  kind: "send" | "tool" | "toast" | "copy" | "open" | "warning"
  title: string
  detail?: string
}

const KIND_COLOR = {
  send: "accent",
  tool: "success",
  toast: "default",
  copy: "default",
  open: "default",
  warning: "warning",
} as const

function Hint(props: { children: string }) {
  return <p className="px-4 pt-3 pb-2 text-xs leading-relaxed text-muted">{props.children}</p>
}

/** What is behind the surface: its markup, its state, what it sent, and the prompt. */
export function Inspector(props: {
  copy: Copy
  panel: Panel
  onPanel: (panel: Panel) => void
  source: string
  onSource: (source: string) => void
  state: Record<string, unknown>
  onReset: () => void
  log: LogEntry[]
  prompt: string
  promptHint: string
}) {
  const { copy, log } = props
  const tabs: [Panel, string][] = [
    ["source", copy.markup],
    ["state", copy.state],
    ["events", copy.events],
    ["prompt", copy.prompt],
  ]
  return (
    <Tabs
      className="flex h-full min-h-0 flex-col gap-0"
      variant="secondary"
      selectedKey={props.panel}
      onSelectionChange={(key) => props.onPanel(String(key) as Panel)}
    >
      <Tabs.ListContainer className="shrink-0 px-2">
        <Tabs.List aria-label={copy.inspect}>
          {tabs.map(([id, label]) => (
            <Tabs.Tab key={id} id={id} data-pg-panel={id}>
              {label}
              {id === "events" && log.length ? (
                <Chip size="sm" variant="soft" color="accent" className="ml-1.5">
                  {log.length}
                </Chip>
              ) : null}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel id="source" className="flex min-h-0 flex-1 flex-col p-0">
        <Hint>{copy.markupHint}</Hint>
        <textarea
          className="pg-code min-h-0 flex-1 resize-none bg-transparent px-4 pb-4 whitespace-pre text-foreground outline-none"
          spellCheck={false}
          aria-label={copy.markup}
          value={props.source}
          onChange={(event) => props.onSource(event.target.value)}
        />
      </Tabs.Panel>
      <Tabs.Panel id="state" className="flex min-h-0 flex-1 flex-col p-0">
        <Hint>{copy.stateHint}</Hint>
        <pre className="pg-code min-h-0 flex-1 overflow-auto px-4 pb-2 text-foreground">
          {JSON.stringify(props.state, null, 2)}
        </pre>
        <div className="shrink-0 border-t border-separator p-3">
          <Button size="sm" variant="secondary" onPress={props.onReset}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {copy.resetState}
          </Button>
        </div>
      </Tabs.Panel>
      <Tabs.Panel id="events" className="flex min-h-0 flex-1 flex-col p-0">
        <Hint>{copy.eventsHint}</Hint>
        <ol className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-4 pb-4">
          {log.length === 0 ? <li className="text-sm text-muted">{copy.eventsEmpty}</li> : null}
          {log.map((entry) => (
            <li
              key={entry.id}
              data-kind={entry.kind}
              className="flex flex-col gap-1 rounded-xl bg-surface-secondary p-3"
            >
              <span className="flex items-center gap-2">
                <Chip size="sm" variant="soft" color={KIND_COLOR[entry.kind]}>
                  {entry.kind}
                </Chip>
                <span className="font-mono text-[11px] text-muted">{entry.time}</span>
              </span>
              <span className="text-sm break-words text-foreground">{entry.title}</span>
              {entry.detail ? (
                <span className="pg-code break-all text-muted">{entry.detail}</span>
              ) : null}
            </li>
          ))}
        </ol>
      </Tabs.Panel>
      <Tabs.Panel id="prompt" className="flex min-h-0 flex-1 flex-col p-0">
        <Hint>{props.promptHint}</Hint>
        <pre className="pg-code min-h-0 flex-1 overflow-auto px-4 pb-4 whitespace-pre-wrap text-foreground">
          {props.prompt}
        </pre>
      </Tabs.Panel>
    </Tabs>
  )
}
