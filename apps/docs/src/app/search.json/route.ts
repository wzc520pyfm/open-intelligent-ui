import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/source"

// The index is a file, built once; the search itself runs in the reader's browser.
export const dynamic = "force-static"

export const { staticGET: GET } = createFromSource(source)
