import { defineConfig, defineDocs } from "fumadocs-mdx/config"
import { remarkLive } from "./src/lib/remark-live"

export const docs = defineDocs({ dir: "content/docs" })

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkLive],
  },
})
