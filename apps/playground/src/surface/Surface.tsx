import { IntelligentUI, type IntelligentUIHandle } from "@open-intelligent-ui/react"
import { type Ref, useEffect, useImperativeHandle, useRef } from "react"
import type { Mount, Mounted, RendererId, SurfaceHandle, SurfaceProps } from "./types"

const LOADERS: Record<Exclude<RendererId, "react">, () => Promise<Mount>> = {
  vue: () => import("./vue").then((module) => module.mount),
}

function Foreign(props: SurfaceProps & { load: () => Promise<Mount>; handle?: Ref<SurfaceHandle> | undefined }) {
  const { load, handle, ...surface } = props
  const host = useRef<HTMLDivElement>(null)
  const mounted = useRef<Mounted | null>(null)
  const latest = useRef(surface)
  latest.current = surface

  useEffect(() => {
    let cancelled = false
    void load().then((mount) => {
      if (cancelled || !host.current) return
      mounted.current = mount(host.current, latest.current)
    })
    return () => {
      cancelled = true
      mounted.current?.unmount()
      mounted.current = null
    }
  }, [load])

  useEffect(() => {
    mounted.current?.update(latest.current)
  })

  useImperativeHandle(handle, () => ({ reset: () => mounted.current?.reset() }), [])

  return <div ref={host} className="contents" />
}

function Native(props: SurfaceProps & { handle?: Ref<SurfaceHandle> | undefined }) {
  const { handle, ...surface } = props
  const inner = useRef<IntelligentUIHandle>(null)
  useImperativeHandle(handle, () => ({ reset: () => inner.current?.reset() }), [])
  return <IntelligentUI ref={inner} className="pg-surface" {...surface} />
}

/** One reply, drawn by the chosen renderer. */
export function Surface(props: SurfaceProps & { renderer: RendererId; handle?: Ref<SurfaceHandle> | undefined }) {
  const { renderer, ...surface } = props
  if (renderer === "react") return <Native {...surface} />
  return <Foreign {...surface} load={LOADERS[renderer]} />
}
