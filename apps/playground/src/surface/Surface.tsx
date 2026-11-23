import { Button } from "@heroui/react"
import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/react"
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react"
import type { Mount, Mounted, RendererId, SurfaceHandle, SurfaceProps } from "./types"

const LOADERS: Record<Exclude<RendererId, "react">, () => Promise<Mount>> = {
  vue: () => import("./vue").then((module) => module.mount),
  solid: () => import("./solid").then((module) => module.mount),
}

interface Shared {
  handle?: Ref<SurfaceHandle> | undefined
  /** What to say when a renderer's code could not be fetched. */
  failed: string
  retry: string
}

function Foreign(props: SurfaceProps & Shared & { load: () => Promise<Mount> }) {
  const { load, handle, failed, retry, ...surface } = props
  const host = useRef<HTMLDivElement>(null)
  const mounted = useRef<Mounted | null>(null)
  const latest = useRef(surface)
  latest.current = surface
  const [attempt, setAttempt] = useState(0)
  const [broken, setBroken] = useState(false)

  // `attempt` is in the list so that asking again runs this again.
  useEffect(() => {
    let cancelled = false
    setBroken(false)
    load().then(
      (mount) => {
        if (cancelled || !host.current) return
        mounted.current = mount(host.current, latest.current)
      },
      () => {
        if (!cancelled) setBroken(true)
      }
    )
    return () => {
      cancelled = true
      mounted.current?.unmount()
      mounted.current = null
    }
  }, [load, attempt])

  useEffect(() => {
    mounted.current?.update(latest.current)
  })

  useImperativeHandle(handle, () => ({ reset: () => mounted.current?.reset() }), [])

  return (
    <>
      <div ref={host} className="contents" />
      {broken ? (
        <div
          role="alert"
          className="flex items-center gap-3 self-start rounded-2xl bg-danger-soft px-4 py-2.5 text-sm text-danger-soft-foreground"
        >
          {failed}
          <Button size="sm" variant="secondary" onPress={() => setAttempt(attempt + 1)}>
            {retry}
          </Button>
        </div>
      ) : null}
    </>
  )
}

function Native(props: SurfaceProps & { handle?: Ref<SurfaceHandle> | undefined }) {
  const { handle, ...surface } = props
  const inner = useRef<IntelligentUIHandle>(null)
  useImperativeHandle(handle, () => ({ reset: () => inner.current?.reset() }), [])
  return <IntelligentUI ref={inner} className="pg-surface" {...surface} />
}

/** One reply, drawn by the chosen renderer. */
export function Surface(props: SurfaceProps & Shared & { renderer: RendererId }) {
  const { renderer, failed, retry, ...surface } = props
  if (renderer === "react") return <Native {...surface} />
  return <Foreign {...surface} failed={failed} retry={retry} load={LOADERS[renderer]} />
}
