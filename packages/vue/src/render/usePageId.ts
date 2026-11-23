import { claimId } from "@open-intelligent-ui/core/renderer"
import { onUnmounted, useId } from "vue"

/**
 * `useId`, made to hold across the page. Vue counts its ids per app, so two
 * apps on one page hand out the same ones, and a surface scopes its styles
 * by its id. The id only differs from Vue's when another surface has it.
 * On a server nothing is claimed: every request starts from nothing there.
 */
export function usePageId(shape: (raw: string) => string): string {
  const wanted = shape(useId())
  if (typeof document === "undefined") return wanted
  const claim = claimId(wanted)
  onUnmounted(claim.release)
  return claim.id
}
