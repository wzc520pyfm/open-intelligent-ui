import { Link, ListBox } from "@heroui/react"
import {
  Calculator,
  ChartColumn,
  Cog,
  LifeBuoy,
  type LucideIcon,
  Scale,
  Sparkles,
  SquareKanban,
} from "lucide-react"
import type { Demo } from "../demos"
import type { Copy, DemoCopy } from "../i18n"

const ICONS: Record<string, LucideIcon> = {
  gears: Cog,
  invest: Calculator,
  trip: Scale,
  dashboard: ChartColumn,
  workbench: LifeBuoy,
  board: SquareKanban,
}

export const LIVE = "live"

function Entry(props: { id: string; icon: LucideIcon; kind: string; prompt: string; caption: string }) {
  const Icon = props.icon
  return (
    <ListBox.Item
      id={props.id}
      textValue={props.prompt}
      data-pg-demo={props.id}
      className="group items-start gap-3 rounded-2xl px-3 py-3 data-[selected=true]:bg-default"
    >
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-surface-secondary text-muted group-data-[selected=true]:bg-accent group-data-[selected=true]:text-accent-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[11px] font-semibold tracking-wide text-accent-soft-foreground uppercase">
          {props.kind}
        </span>
        <span className="text-sm leading-snug font-medium text-foreground">{props.prompt}</span>
        <span className="text-xs leading-snug text-muted">{props.caption}</span>
      </span>
    </ListBox.Item>
  )
}

/** The examples, the way in to a live model, and what this project is. */
export function Sidebar(props: {
  copy: Copy
  demos: Demo[]
  demoCopy: (demo: Demo) => DemoCopy
  selected: string
  onSelect: (id: string) => void
}) {
  const { copy } = props
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-5">
      <div className="flex flex-col gap-2 px-3">
        <h1 className="text-lg leading-tight font-semibold tracking-tight text-balance text-foreground">
          {copy.tagline}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted">{copy.intro}</p>
      </div>
      <ListBox
        aria-label={copy.examples}
        className="p-0"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={new Set([props.selected])}
        onSelectionChange={(keys) => {
          if (keys === "all") return
          const [next] = [...keys]
          if (next !== undefined) props.onSelect(String(next))
        }}
      >
        <ListBox.Section aria-label={copy.agentAsked} className="gap-1">
          {props.demos.map((demo) => {
            const text = props.demoCopy(demo)
            return (
              <Entry
                key={demo.id}
                id={demo.id}
                icon={ICONS[demo.id] ?? Sparkles}
                kind={text.title}
                prompt={text.prompt}
                caption={text.caption}
              />
            )
          })}
        </ListBox.Section>
        <ListBox.Section aria-label={copy.askYourself} className="mt-2 gap-1 border-t border-separator pt-3">
          <Entry
            id={LIVE}
            icon={Sparkles}
            kind={copy.live}
            prompt={copy.connectModel}
            caption={copy.liveCaption}
          />
        </ListBox.Section>
      </ListBox>
      <div className="mt-auto flex items-center gap-4 px-3 text-xs text-muted">
        <Link
          className="text-xs text-muted"
          href="https://github.com/wzc520pyfm/open-intelligent-ui#readme"
          target="_blank"
          rel="noreferrer"
        >
          {copy.docs}
        </Link>
        <Link
          className="text-xs text-muted"
          href="https://www.npmjs.com/package/@open-intelligent-ui/react"
          target="_blank"
          rel="noreferrer"
        >
          npm
        </Link>
        <span>MIT</span>
      </div>
    </div>
  )
}
