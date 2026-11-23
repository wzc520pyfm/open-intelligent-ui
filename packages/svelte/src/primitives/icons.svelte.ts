import type { ICON_ALIASES, ICON_LOADERS, IconNode } from "./icons.generated"

interface Tables {
  loaders: typeof ICON_LOADERS
  aliases: typeof ICON_ALIASES
  /** The file each other name of an icon is drawn from. */
  files: Map<string, string>
}

/** What is known about an icon once its file has loaded. */
export interface IconData {
  name: string
  aliases: string[]
  node: IconNode
}

const drawings = new Map<string, IconData>()
const loading = new Set<string>()
/** Read by every icon on screen, so one arriving redraws the ones waiting for it. */
let arrivals = $state(0)

let tables: Tables | undefined
let tablesComing: Promise<Tables> | undefined

/** The list of icons is long, so it stays out of the way until an icon is drawn. */
function iconTables(): Promise<Tables> {
  tablesComing ??= import("./icons.generated").then((module) => {
    const files = new Map<string, string>()
    for (const [file, aliases] of Object.entries(module.ICON_ALIASES)) {
      for (const alias of aliases) files.set(alias, file)
    }
    tables = { loaders: module.ICON_LOADERS, aliases: module.ICON_ALIASES, files }
    return tables
  })
  return tablesComing
}

function fileOf(name: string, known: Tables): string | undefined {
  if (Object.hasOwn(known.loaders, name)) return name
  return known.files.get(name)
}

async function load(name: string): Promise<void> {
  const known = await iconTables()
  const file = fileOf(name, known)
  const loader = file === undefined ? undefined : known.loaders[file]
  if (file === undefined || !loader) return
  const node = (await loader()).default
  const aliases = Object.hasOwn(known.aliases, file) ? (known.aliases[file] as string[]) : []
  drawings.set(name, { name: file, aliases, node })
}

/** The icon's drawing, `null` when there is no such icon, `undefined` while it loads. */
export function drawing(name: string): IconData | null | undefined {
  const ready = drawings.get(name)
  if (ready) return ready
  if (tables && fileOf(name, tables) === undefined) return null
  // Subscribes the icon being drawn to the next arrival.
  void arrivals
  if (!loading.has(name)) {
    loading.add(name)
    void load(name).then(
      () => {
        arrivals++
      },
      (error: unknown) => {
        loading.delete(name)
        console.error(error)
      }
    )
  }
  return undefined
}

/** Loads icons ahead of time, so the first render draws them at once. */
export async function preloadIcons(...names: string[]): Promise<void> {
  await Promise.all(names.filter((name) => !drawings.has(name)).map(load))
  arrivals++
}
