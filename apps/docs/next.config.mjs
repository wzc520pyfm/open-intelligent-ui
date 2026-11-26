import { readFileSync } from "node:fs"
import { createMDX } from "fumadocs-mdx/next"

const core = JSON.parse(readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"))

const withMDX = createMDX()

export default withMDX({
  // The site is files: it is served from under /docs/ by the hosts that serve the playground.
  output: "export",
  basePath: "/docs",
  trailingSlash: true,
  reactStrictMode: true,
  // The workspace packages export their TypeScript source.
  transpilePackages: ["@open-intelligent-ui/core", "@open-intelligent-ui/react"],
  // `pnpm typecheck` checks this app, so a build doesn't do it a second time.
  typescript: { ignoreBuildErrors: true },
  env: { NEXT_PUBLIC_VERSION: core.version },
  // Each language has its own document, so the page for a wrong address is a document of its own.
  experimental: { globalNotFound: true },
})
