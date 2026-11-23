import { claimId } from "@open-intelligent-ui/core/renderer"
import { useEffect, useId, useLayoutEffect, useState } from "react"

const useBeforePaint = typeof document === "undefined" ? useEffect : useLayoutEffect

/**
 * `useId`, made to hold across the page. React's ids repeat between roots
 * that were rendered on a server and between two copies of React, and a
 * surface scopes its styles by its id. The id only changes when another
 * surface already has it, and it changes before anything is painted.
 */
export function usePageId(shape: (raw: string) => string): string {
  const wanted = shape(useId())
  const [id, setId] = useState(wanted)
  useBeforePaint(() => {
    const claim = claimId(wanted)
    setId(claim.id)
    return claim.release
  }, [wanted])
  return id
}

export const alphanumeric = (raw: string) => raw.replace(/[^A-Za-z0-9]/g, "")
