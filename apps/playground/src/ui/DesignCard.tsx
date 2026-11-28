import type { ReactNode } from "react"
import type { Copy } from "../i18n"
import { assessDesign } from "../studio"

/** A design the model wrote: the file while it is still arriving, then the page it produces. */
export function DesignCard(props: {
  source: string
  streaming: boolean
  copy: Copy
  children?: ReactNode
}) {
  const assessment = props.streaming ? null : assessDesign(props.source)
  if (!assessment?.usable) {
    return (
      <div data-pg="design" className="flex flex-col gap-3">
        {props.source ? (
          <pre className="pg-code max-h-72 overflow-auto rounded-2xl border border-separator bg-background p-4 whitespace-pre-wrap">
            {props.source}
          </pre>
        ) : null}
        {assessment && assessment.issues.length ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-muted">{props.copy.designRejected}</p>
            <ul className="flex flex-col gap-1 text-xs text-muted">
              {assessment.issues.slice(0, 6).map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }
  return (
    <div data-pg="design" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{props.copy.designApplied(assessment.name)}</p>
        {assessment.description ? <p className="text-sm text-muted">{assessment.description}</p> : null}
        {assessment.issues.length ? (
          <ul className="flex flex-col gap-1 text-xs text-muted">
            {assessment.issues.slice(0, 4).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {props.children}
    </div>
  )
}
