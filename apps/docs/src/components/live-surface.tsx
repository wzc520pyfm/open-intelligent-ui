"use client"

import type { Library, SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import * as designs from "@open-intelligent-ui/core/designs"
import { IntelligentUI } from "@open-intelligent-ui/react"
import type { ComponentType } from "react"
import { PRODUCT } from "../../../playground/src/library/product"
import type { createTicketTools } from "../../../playground/src/tools"

export type DesignName = keyof typeof designs

/**
 * The renderer, and what an example may use with it. This file is loaded in
 * the browser only, once an example is on the page.
 */
export default function LiveSurface(props: {
  source: string
  streaming: boolean
  design: DesignName
  scheme: "light" | "dark"
  product: boolean
  tools: ReturnType<typeof createTicketTools>
  onAction: (action: SurfaceAction) => boolean | undefined
  onTool: (event: ToolEvent) => void
  onWarning: (message: string) => void
}) {
  return (
    <IntelligentUI
      source={props.source}
      streaming={props.streaming}
      design={designs[props.design]}
      scheme={props.scheme}
      // biome-ignore lint/suspicious/noExplicitAny: a library holds components of any props
      library={props.product ? (PRODUCT as Library<ComponentType<any>>) : undefined}
      tools={props.tools}
      onAction={props.onAction}
      onTool={props.onTool}
      onWarning={props.onWarning}
    />
  )
}
