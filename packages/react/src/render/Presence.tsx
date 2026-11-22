import { type ReactNode, useEffect, useRef, useState } from "react"

/**
 * Keeps its child on screen while the exit animation plays. The child gets
 * `data-iui-exit` on its wrapper during that time, and is removed once every
 * animation inside has finished.
 */
export function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show)
  const [exiting, setExiting] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  if (show && (!mounted || exiting)) {
    setMounted(true)
    setExiting(false)
  }
  if (!show && mounted && !exiting) setExiting(true)

  useEffect(() => {
    if (!exiting) return
    const done = () => {
      setMounted(false)
      setExiting(false)
    }
    const animations = ref.current?.getAnimations?.({ subtree: true }) ?? []
    if (animations.length === 0) {
      done()
      return
    }
    let cancelled = false
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) done()
    })
    return () => {
      cancelled = true
    }
  }, [exiting])

  if (!mounted) return null
  return (
    <span ref={ref} className="iui-presence" data-iui-exit={exiting ? "" : undefined}>
      {children}
    </span>
  )
}
