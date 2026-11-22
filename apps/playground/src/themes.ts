import paper from "../../../design/default.DESIGN.md?raw"
import heritage from "../../../design/heritage.DESIGN.md?raw"
import signal from "../../../design/signal.DESIGN.md?raw"

export interface Theme {
  id: string
  name: string
  /** The DESIGN.md document. */
  source: string
}

export const THEMES: Theme[] = [
  { id: "paper", name: "Paper", source: paper },
  { id: "heritage", name: "Heritage", source: heritage },
  { id: "signal", name: "Signal", source: signal },
]
