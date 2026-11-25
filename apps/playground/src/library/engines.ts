import { echartsCharts, g2Charts, type ChartEngine } from "@open-intelligent-ui/core/charts"
import { gsapAdapter, type MotionAdapter, motionAdapter, waapiAdapter } from "@open-intelligent-ui/core/motion"
import { useEffect, useState } from "react"
import type { RendererId } from "../surface/types"

export type ChartsId = "svg" | "echarts" | "g2" | "recharts"
export type MotionId = "css" | "waapi" | "motion" | "gsap"

export const CHARTS: { id: ChartsId; label: string; only?: RendererId }[] = [
  { id: "svg", label: "SVG" },
  { id: "echarts", label: "ECharts" },
  { id: "g2", label: "AntV G2" },
  // Recharts is made of React components, so only the React renderer can draw with it.
  { id: "recharts", label: "Recharts", only: "react" },
]

export const MOTIONS: { id: MotionId; label: string }[] = [
  { id: "css", label: "CSS" },
  { id: "waapi", label: "Web Animations" },
  { id: "motion", label: "Motion" },
  { id: "gsap", label: "GSAP" },
]

// Each engine is fetched when it is first chosen, and made once.
const charts: Partial<Record<ChartsId, Promise<ChartEngine>>> = {}
const motions: Partial<Record<MotionId, Promise<MotionAdapter>>> = {}

function loadCharts(id: ChartsId): Promise<ChartEngine> | undefined {
  if (id === "svg") return undefined
  charts[id] ??=
    id === "echarts"
      ? Promise.resolve(echartsCharts(() => import("echarts")))
      : id === "g2"
        ? Promise.resolve(g2Charts(() => import("@antv/g2")))
        : Promise.all([import("recharts"), import("@open-intelligent-ui/react/recharts")]).then(
            ([recharts, adapter]) => adapter.rechartsCharts(recharts) as ChartEngine
          )
  return charts[id]
}

function loadMotion(id: MotionId): Promise<MotionAdapter> | undefined {
  if (id === "css") return undefined
  motions[id] ??=
    id === "waapi"
      ? Promise.resolve(waapiAdapter())
      : id === "motion"
        ? import("motion").then((module) => motionAdapter(module.animate))
        : import("gsap").then((module) => gsapAdapter(module.gsap))
  return motions[id]
}

export interface Engines {
  charts?: ChartEngine
  motion?: MotionAdapter
}

/** The chosen engines, once their code has arrived. Until then, the built-in ones draw. */
export function useEngines(chartsId: ChartsId, motionId: MotionId): Engines {
  const [engines, setEngines] = useState<Engines>({})
  useEffect(() => {
    let current = true
    const pending = [loadCharts(chartsId), loadMotion(motionId)] as const
    if (!pending[0] && !pending[1]) {
      // Keep the existing empty object; a fresh `{}` would churn library identity.
      setEngines((prev) => (prev.charts || prev.motion ? {} : prev))
      return
    }
    Promise.all(pending).then(
      ([chartEngine, adapter]) => {
        if (!current) return
        setEngines({ ...(chartEngine ? { charts: chartEngine } : {}), ...(adapter ? { motion: adapter } : {}) })
      },
      () => {
        if (current) setEngines((prev) => (prev.charts || prev.motion ? {} : prev))
      }
    )
    return () => {
      current = false
    }
  }, [chartsId, motionId])
  return engines
}
