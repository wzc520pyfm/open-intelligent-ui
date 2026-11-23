import { claimId } from "@open-intelligent-ui/core/renderer"
import { onDestroy } from "svelte"

/**
 * An id from `$props.id()`, made to hold across the page. Svelte counts its
 * ids per copy of Svelte, so a second copy, or another renderer, can hand out
 * the same one, and a surface scopes its styles by its id. The id only
 * differs from `wanted` when something on the page already has it. On a
 * server nothing is claimed: every request starts from nothing there.
 *
 * Call it while the component is being set up.
 */
export function pageId(wanted: string): string {
  if (typeof document === "undefined") return wanted
  const claim = claimId(wanted)
  onDestroy(claim.release)
  return claim.id
}
