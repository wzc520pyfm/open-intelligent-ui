import type { CheckResult, Issue } from "./check"

export interface RepairOptions {
  /** How many issues to list. More than a dozen and a model starts rewriting what was right. Default 12. */
  limit?: number
  /** Also list warnings. Default: only when there is room left after the errors. */
  warnings?: boolean
}

function line(issue: Issue): string {
  const where = `Line ${issue.line}`
  const hint = issue.hint ? ` ${issue.hint}` : ""
  const excerpt = issue.excerpt ? `\n  ${issue.excerpt}` : ""
  return `- ${where}: ${issue.message}.${hint}${excerpt}`
}

/**
 * What to send the model after a reply that didn't check out, as the next
 * user message. It names each problem with its line and what to write
 * instead, and asks for the whole interface again, which is the only form a
 * renderer can take.
 *
 * Returns an empty string when there is nothing to fix.
 *
 * ```ts
 * let reply = await model(messages)
 * let result = checkMarkup(reply, { library, tools })
 * for (let round = 0; !result.ok && round < 2; round++) {
 *   messages.push({ role: "assistant", content: reply }, { role: "user", content: repairMessage(result) })
 *   reply = await model(messages)
 *   result = checkMarkup(reply, { library, tools })
 * }
 * ```
 *
 * `result.ok` then says whether the reply you hold checked out.
 */
export function repairMessage(result: CheckResult, options: RepairOptions = {}): string {
  const limit = options.limit ?? 12
  const errors = result.issues.filter((issue) => issue.severity === "error")
  const warnings = result.issues.filter((issue) => issue.severity === "warning")
  if (errors.length === 0 && !(options.warnings && warnings.length > 0)) return ""

  const listed = errors.slice(0, limit)
  if (options.warnings !== false) listed.push(...warnings.slice(0, limit - listed.length))
  listed.sort((a, b) => a.line - b.line || a.column - b.column)
  const left = errors.length + (options.warnings !== false ? warnings.length : 0) - listed.length

  return [
    "The interface you wrote can't be shown as written. A checker read it and found:",
    "",
    ...listed.map(line),
    ...(left > 0 ? ["", `And ${left} more of the same kinds.`] : []),
    "",
    "Write the whole interface again with these fixed. Keep everything else as it was: the same content, layout and names. Reply with the markup only, with no explanation and no code fence.",
  ].join("\n")
}
