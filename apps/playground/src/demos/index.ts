import type { Library } from "@open-intelligent-ui/core"
import { PRODUCT } from "../library/product"
import board from "./board.iui?raw"
import budgets from "./budgets.iui?raw"
import cards from "./cards.iui?raw"
import charts from "./charts.iui?raw"
import claim from "./claim.iui?raw"
import dashboard from "./dashboard.iui?raw"
import forms from "./forms.iui?raw"
import gears from "./gears.iui?raw"
import invest from "./invest.iui?raw"
import trip from "./trip.iui?raw"
import workbench from "./workbench.iui?raw"

export interface Demo {
  id: string
  /** Short name for the list. */
  title: string
  /** What it shows off. */
  caption: string
  /** What the person asked the agent. */
  prompt: string
  /** What the agent answered, in IUI markup. */
  source: string
  /** The design the demo looks best in. */
  theme?: string
  /** The product's own components, when the reply uses them. */
  library?: Library<never>
}

export const DEMOS: Demo[] = [
  {
    id: "charts",
    title: "Charts",
    caption: "Release health: a headline metric with bar, donut and area charts",
    prompt: "How healthy is the harbor CLI release train?",
    source: charts,
    theme: "noir",
  },
  {
    id: "cards",
    title: "Cards",
    caption: "Workshop posters you can scroll, tip chips, then a featured match",
    prompt: "What weekend workshops are open near Gion?",
    source: cards,
    theme: "noir",
  },
  {
    id: "budgets",
    title: "Dashboards",
    caption: "Sprint load: KPIs, commit dots, squad capacity and blockers",
    prompt: "Show me sprint 14 load across the squads.",
    source: budgets,
    theme: "noir",
  },
  {
    id: "forms",
    title: "Forms",
    caption: "Focus-room booking with tags, steppers, amenity chips and a duration slider",
    prompt: "Help me book a focus room on Thursday afternoon.",
    source: forms,
    theme: "noir",
  },
  {
    id: "gears",
    title: "Explain",
    caption: "A live diagram drawn in SVG, driven by sliders",
    prompt: "How do bike gears actually work?",
    source: gears,
  },
  {
    id: "invest",
    title: "Calculate",
    caption: "Assumptions become controls; the answer is derived",
    prompt: "If I put $500 a month into an index fund, what will I have in 20 years?",
    source: invest,
  },
  {
    id: "trip",
    title: "Decide",
    caption: "Options re-rank as priorities change, then hand back to the agent",
    prompt: "Kyoto, Lisbon or Mexico City for a week in April?",
    source: trip,
    theme: "heritage",
  },
  {
    id: "dashboard",
    title: "Dashboard",
    caption: "Stats, charts and a table that filter each other",
    prompt: "How did sales do in Q4?",
    source: dashboard,
    theme: "noir",
  },
  {
    id: "workbench",
    title: "Workbench",
    caption: "Reads and writes a ticket system through tools, without the agent in the loop",
    prompt: "Give me a place to work the support queue.",
    source: workbench,
    theme: "signal",
  },
  {
    id: "board",
    title: "Invent",
    caption: "A component nobody predefined: a sprint board with cards that glide",
    prompt: "Show sprint 14 as a board I can move cards on.",
    source: board,
  },
  {
    id: "claim",
    title: "Your components",
    caption: "Components a product registered, used beside ones the model invents",
    prompt: "Mei's Tokyo expense claim is waiting for me. Should I approve it?",
    source: claim,
    library: PRODUCT,
  },
]
