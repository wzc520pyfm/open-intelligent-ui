"use client"

import { checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"
import { useI18n } from "fumadocs-ui/contexts/i18n"
import { useMemo, useRef, useState } from "react"
import { wordsFor } from "@/lib/words"

const SAMPLES: { name: string; source: string }[] = [
  {
    name: "JSX habits",
    source: `<state count={0} open={false} />

<row gap={2}>
  <Button onClick={() => setCount(count + 1)}>Add one</Button>
  <text bold>{count}</text>
</row>

{open && <card>Details</card>}
`,
  },
  {
    name: "Another library's tags",
    source: `<state tab="week" />

<Stack spacing={4}>
  <Heading>Sales</Heading>
  <TabsPanel value="week">This week</TabsPanel>
  <Chart type="bars" values={[3, 5, 8]} />
</Stack>
`,
  },
  {
    name: "Names and tools",
    source: `<state amount={1200} />
<derive fee={amount * rate} />
<query id="orders" tool="listOrders" />

Fee: {currency(fee)} on {orders.data.length} orders, as of {fee.toLocaleDateString()}.

<Button on:click={fee = 0}>Waive the fee</Button>
`,
  },
  {
    name: "Cut short",
    source: `<state step={1} />

<card padding={4}>
  <title level={3}>Step {step} of 3</title>
  <row gap={2}>
    <Button on:click={step = step - 1}>Back</Button>
    <Button variant="solid" on:click={step = step + 1}>Next</But`,
  },
  {
    name: "A correct reply",
    source: `<state guests={2} />
<derive total={guests * 48} />

**{guests} guests, {currency(total)}.**

<row gap={2} align="center">
  <Button on:click={guests = max(guests - 1, 1)}>Fewer</Button>
  <Button variant="solid" on:click={guests = guests + 1}>More</Button>
</row>
`,
  },
]

/** The checker, run on what is typed: each issue by line, and the message a model would get. */
export function CheckDemo() {
  const words = wordsFor(useI18n().locale)
  const [source, setSource] = useState(SAMPLES[0]?.source ?? "")
  const area = useRef<HTMLTextAreaElement>(null)
  const result = useMemo(() => checkMarkup(source, { tools: ["listTickets", "updateTicket"] }), [source])
  const repair = useMemo(() => repairMessage(result), [result])

  /** Selects the line an issue is about, so it can be seen and fixed. */
  function show(line: number) {
    const element = area.current
    if (!element) return
    const lines = source.split("\n")
    const start = lines.slice(0, line - 1).reduce((sum, text) => sum + text.length + 1, 0)
    element.focus()
    element.setSelectionRange(start, start + (lines[line - 1]?.length ?? 0))
  }

  return (
    <div className="docs-demo not-prose" data-check>
      <div className="docs-demo-stage">
        <div className="docs-demo-bar pe-3.5">
          <span className="docs-demo-tag font-mono tracking-normal normal-case">checkMarkup()</span>
          <span className="flex-1" />
          <span className="text-xs text-(--docs-fg-subtle)">{words.samples}</span>
          {SAMPLES.map((sample) => (
            <button
              key={sample.name}
              type="button"
              className="docs-soft-pill"
              aria-pressed={source === sample.source}
              onClick={() => setSource(sample.source)}
            >
              {words.sample(sample.name)}
            </button>
          ))}
        </div>
        <textarea
          ref={area}
          className="docs-check-source"
          spellCheck={false}
          rows={12}
          aria-label={words.markup}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </div>
      <div className="docs-check-result" data-ok={result.ok}>
        <p className="docs-check-summary">
          {result.issues.length ? words.found(result.errors, result.warnings) : words.clean}
        </p>
        {result.issues.length ? (
          <ol className="docs-check-issues">
            {result.issues.map((issue, index) => (
              <li key={index} data-severity={issue.severity}>
                <button type="button" className="docs-check-line" onClick={() => show(issue.line)}>
                  {words.line(issue.line)}
                </button>
                <span>
                  {issue.message} <code className="docs-check-code">{issue.code}</code>
                </span>
                {issue.hint ? <span className="docs-check-hint">{issue.hint}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
        <details className="docs-check-repair">
          <summary>{words.repair}</summary>
          {repair ? <pre>{repair}</pre> : <p>{words.noRepair}</p>}
        </details>
      </div>
    </div>
  )
}
