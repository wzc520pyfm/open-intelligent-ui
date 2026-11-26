import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = fileURLToPath(new URL("..", import.meta.url))
const bin = join(root, "bin/create.mjs")

describe("create-open-intelligent-ui", () => {
  it("scaffolds a react-vite app with the product loop files", () => {
    const work = mkdtempSync(join(tmpdir(), "iui-create-"))
    try {
      const dir = join(work, "demo-app")
      execFileSync(process.execPath, [bin, dir, "--name", "demo-app"], { stdio: "pipe" })
      expect(existsSync(join(dir, "package.json"))).toBe(true)
      expect(existsSync(join(dir, ".gitignore"))).toBe(true)
      expect(existsSync(join(dir, "src/App.tsx"))).toBe(true)
      expect(existsSync(join(dir, "src/chat.ts"))).toBe(true)
      const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"))
      expect(pkg.name).toBe("demo-app")
      expect(pkg.dependencies["@open-intelligent-ui/react"]).toMatch(/^\^0\./)
      const chat = readFileSync(join(dir, "src/chat.ts"), "utf8")
      expect(chat).toContain("checkMarkup")
      expect(chat).toContain("repairMessage")
      expect(chat).toContain("buildSystemPrompt")
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })

  it("refuses a non-empty target", () => {
    const work = mkdtempSync(join(tmpdir(), "iui-create-"))
    try {
      const dir = join(work, "taken")
      execFileSync(process.execPath, [bin, dir], { stdio: "pipe" })
      expect(() => execFileSync(process.execPath, [bin, dir], { stdio: "pipe" })).toThrow()
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  })
})
