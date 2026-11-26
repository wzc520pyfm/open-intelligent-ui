import {
  Blocks,
  BookOpen,
  Braces,
  ChartColumn,
  CodeXml,
  Database,
  FileText,
  Layers,
  LayoutGrid,
  Lock,
  type LucideIcon,
  Palette,
  PenTool,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

/** The icons pages and cards name, by the name written in frontmatter. */
const ICONS: Record<string, LucideIcon> = {
  blocks: Blocks,
  "book-open": BookOpen,
  braces: Braces,
  "chart-column": ChartColumn,
  "code-xml": CodeXml,
  database: Database,
  "file-text": FileText,
  layers: Layers,
  "layout-grid": LayoutGrid,
  lock: Lock,
  palette: Palette,
  "pen-tool": PenTool,
  rocket: Rocket,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
}

export function icon(name: string | undefined) {
  const Icon = name ? ICONS[name] : undefined
  return Icon ? <Icon aria-hidden="true" /> : undefined
}

export function GitHubMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49l-.01-1.9c-2.78.62-3.37-1.21-3.37-1.21-.46-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.92.85.09-.66.35-1.12.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.4 9.4 0 0 1 12 6.96c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9l-.01 2.82c0 .27.18.6.69.49A10.2 10.2 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z" />
    </svg>
  )
}

/** Hamster mark. Served from the playground root this site sits under. */
export function Logo(props: { className?: string }) {
  return (
    <img
      src="/logo-mark.png"
      srcSet="/logo-mark.png 512w"
      sizes="1.5rem"
      width={512}
      height={512}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={props.className}
    />
  )
}
