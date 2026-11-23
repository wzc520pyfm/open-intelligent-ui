import { type Design, parseDesign } from "@open-intelligent-ui/core"
import paper from "../../../design/default.DESIGN.md?raw"
import heritage from "../../../design/heritage.DESIGN.md?raw"
import signal from "../../../design/signal.DESIGN.md?raw"
import heroui from "../../../design/third-party/heroui.DESIGN.md?raw"

export interface Theme {
  id: string
  name: string
  /** The DESIGN.md document, or one read with options. */
  design: string | Design
}

export const THEMES: Theme[] = [
  { id: "paper", name: "Paper", design: paper },
  { id: "heritage", name: "Heritage", design: heritage },
  { id: "signal", name: "Signal", design: signal },
  {
    id: "heroui",
    name: "HeroUI",
    // HeroUI's own DESIGN.md, as published: written for its React components, with its
    // tokens in a table of CSS variables. Read as it is; the options only tidy up.
    design: parseDesign(heroui, {
      // It names its two inks without giving their values.
      tokens: { colors: { eclipse: "oklch(0.2103 0.0059 285.89)", snow: "oklch(0.9911 0 0)" } },
      // How to install another library is nothing the model should read.
      prose: { omit: ["Setup", "Source of Truth"] },
    }),
  },
]
