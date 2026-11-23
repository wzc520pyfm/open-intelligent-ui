// Run from a package directory before packing: the tarball must carry the license and the
// UI SDK attribution, and the copies at the repository root are the only ones kept in git.
import { copyFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
for (const name of ["LICENSE", "NOTICE"]) copyFileSync(root + name, name)
