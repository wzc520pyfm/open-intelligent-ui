import { Button, Chip, Tabs } from "@heroui/react"
import type { Issue } from "@open-intelligent-ui/core/check"
import { CircleCheck, RotateCcw } from "lucide-react"
import { useRef } from "react"
import type { Copy } from "../i18n"

export type Panel = "source" | "state" | "events" | "prompt"

export interface LogEntry {
  id: number
  time: string
  kind: "send" | "tool" | "toast" | "copy" | "open" | "warning" | "check"
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
  check: "danger",
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
  /** What a check of the markup found, or null while it is still being written. */
  issues: Issue[] | null
  state: Record<string, unknown>
  onReset: () => void
  log: LogEntry[]
  prompt: string
  promptHint: string
}) {
  const { copy, log, issues } = props
  const editor = useRef<HTMLTextAreaElement>(null)
  const errors = issues?.filter((issue) => issue.severity === "error").length ?? 0

  /** Selects the line an issue is on, and brings it into view. */
  const show = (issue: Issue) => {
    const node = editor.current
    if (!node) return
    const lines = props.source.split("\n")
    const start = lines.slice(0, issue.line - 1).reduce((sum, line) => sum + line.length + 1, 0)
    node.focus()
    node.setSelectionRange(start, start + (lines[issue.line - 1]?.length ?? 0))
    const height = Number.parseFloat(getComputedStyle(node).lineHeight) || 18
    node.scrollTop = Math.max(0, (issue.line - 4) * height)
  }
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
              {id === "source" && issues?.length ? (
                <Chip
                  size="sm"
                  variant="soft"
                  color={errors ? "danger" : "warning"}
                  className="ml-1.5"
                  data-pg="issue-count"
                >
                  {issues.length}
                </Chip>
              ) : null}
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
          ref={editor}
          className="pg-code min-h-0 flex-1 resize-none bg-transparent px-4 pb-4 whitespace-pre text-foreground outline-none"
          spellCheck={false}
          aria-label={copy.markup}
          value={props.source}
          onChange={(event) => props.onSource(event.target.value)}
        />
        {issues === null ? null : (
          <div className="shrink-0 border-t border-separator" data-pg="check" data-issues={issues.length}>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-3 text-xs text-muted">
                <CircleCheck className="size-3.5 text-success" aria-hidden="true" />
                {copy.checkClean}
              </p>
            ) : (
              <>
                <p className="px-4 pt-3 pb-1 text-xs font-medium text-foreground">
                  {copy.checkFound(errors, issues.length - errors)}
                </p>
                <ol className="flex max-h-64 flex-col gap-1 overflow-auto px-2 pb-2">
                  {issues.map((issue) => (
                    <li key={`${issue.line}:${issue.column}:${issue.code}:${issue.message}`}>
                      <button
                        type="button"
                        data-severity={issue.severity}
                        className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-default"
                        onClick={() => show(issue)}
                      >
                        <span className="flex items-center gap-2">
                          <Chip size="sm" variant="soft" color={issue.severity === "error" ? "danger" : "warning"}>
                            {copy.line(issue.line)}
                          </Chip>
                          <span className="font-mono text-[11px] text-muted">{issue.code}</span>
                        </span>
                        <span className="text-xs leading-relaxed break-words text-foreground">{issue.message}</span>
                        {issue.hint ? (
                          <span className="text-xs leading-relaxed break-words text-muted">{issue.hint}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
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
