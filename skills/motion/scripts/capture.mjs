#!/usr/bin/env node
// Watches an interaction the way a person would: plays it in a real browser,
// slowed down, and saves the frames side by side, with what was animating.
//
//   node capture.mjs --url http://127.0.0.1:5173 --click "text=Start" --out ./motion
//
//   --url <url>          page to open (required)
//   --click <selector>   what to click to start the motion; repeat to click several in order.
//                        Without it, the page load itself is captured.
//   --before <selector>  clicked first, without capturing (to get to the right screen); repeatable
//   --wait <ms>          extra time to let the page settle before capturing (default 0)
//   --within <selector>  capture only this element instead of the whole page
//   --frames <n>         how many frames to save (default 10)
//   --slow <n>           play animations n times slower, so frames land mid-motion (default 4)
//   --span <ms>          how much real animation time the frames cover (default 600)
//   --width, --height    viewport (default 1200 x 800)
//   --scheme light|dark  color scheme (default light)
//   --reduced            emulate prefers-reduced-motion: reduce
//   --out <dir>          where to write (default ./motion-capture)
//   --chrome <path>      browser to use; otherwise CHROME_PATH, then the usual locations
//
// Writes frame-00.png …, sheet.png (every frame in one image, in order) and report.json.
// Needs playwright-core: `npm i -D playwright-core`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

function parseArgs(argv) {
  const options = { click: [], before: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`)
    const name = arg.slice(2)
    if (name === "reduced" || name === "help") {
      options[name] = true
      continue
    }
    const value = argv[i + 1]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    i += 1
    if (name === "click" || name === "before") options[name].push(value)
    else options[name] = value
  }
  return options
}

function findChrome(given) {
  const candidates = [
    given,
    process.env.CHROME_PATH,
    "/usr/local/bin/google-chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ]
  return candidates.find((path) => path && existsSync(path))
}

async function loadPlaywright() {
  const require = createRequire(pathToFileURL(join(process.cwd(), "package.json")))
  for (const name of ["playwright-core", "playwright"]) {
    try {
      const module = await import(pathToFileURL(require.resolve(name)).href)
      return module.chromium ? module : module.default
    } catch {}
  }
  throw new Error("playwright-core is not installed here. Run: npm i -D playwright-core")
}

const LAYOUT_PROPERTIES = new Set([
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  "margin",
  "margin-top",
  "margin-left",
  "margin-right",
  "margin-bottom",
  "padding",
  "padding-top",
  "padding-left",
  "padding-right",
  "padding-bottom",
  "inset",
  "font-size",
  "line-height",
  "border-width",
])

function describeAnimations() {
  const label = (element) => {
    if (!element) return "(pseudo-element)"
    const slot = element.getAttribute?.("data-slot")
    const name = element.getAttribute?.("class")?.split(" ").filter(Boolean)[0]
    return `${element.tagName.toLowerCase()}${slot ? `[data-slot="${slot}"]` : name ? `.${name}` : ""}`
  }
  return document.getAnimations().map((animation) => {
    const effect = animation.effect
    const timing = effect?.getComputedTiming?.() ?? {}
    const properties = new Set()
    const keyframes = effect?.getKeyframes?.() ?? []
    const easing = timing.easing && timing.easing !== "linear" ? timing.easing : (keyframes[0]?.easing ?? "")
    for (const frame of keyframes) {
      for (const key of Object.keys(frame)) {
        if (!["offset", "computedOffset", "easing", "composite"].includes(key)) {
          properties.add(key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`))
        }
      }
    }
    return {
      target: label(effect?.target) + (effect?.pseudoElement ?? ""),
      kind: animation.constructor.name,
      name: animation.animationName ?? animation.transitionProperty ?? "",
      duration: Number(timing.duration) || 0,
      delay: Number(timing.delay) || 0,
      iterations: timing.iterations === Infinity ? "infinite" : (timing.iterations ?? 1),
      easing,
      properties: [...properties],
      viewTransition: (effect?.pseudoElement ?? "").startsWith("::view-transition"),
    }
  })
}

function review(animations, reduced) {
  const notes = []
  const seen = new Set()
  const note = (text) => {
    if (seen.has(text)) return
    seen.add(text)
    notes.push(text)
  }
  for (const animation of animations) {
    const layout = animation.viewTransition
      ? []
      : animation.properties.filter((property) => LAYOUT_PROPERTIES.has(property))
    if (layout.length) {
      note(
        `${animation.target} animates ${layout.join(", ")}, which reflows the page on every frame. Fine when the size is the data (a bar, a progress fill); otherwise use translate or scale.`
      )
    }
    if (animation.iterations !== "infinite" && animation.duration > 600) {
      note(`${animation.target} takes ${Math.round(animation.duration)}ms. Past about 500ms an interface starts to feel slow.`)
    }
    if (animation.iterations === "infinite") {
      note(`${animation.target} loops forever (${animation.name || "unnamed"}). Loops are for live status only.`)
    }
    if (/^linear$/.test(animation.easing) && animation.iterations !== "infinite" && animation.duration > 0) {
      const moves = animation.properties.some((property) => /transform|translate|scale|rotate/.test(property))
      if (moves) note(`${animation.target} moves with linear easing, which reads as mechanical.`)
    }
    if (reduced && animation.duration > 0 && animation.properties.some((property) => /transform|translate|scale|rotate/.test(property))) {
      note(`${animation.target} still moves with reduced motion requested.`)
    }
  }
  return notes
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || !options.url) {
    console.log("Usage: node capture.mjs --url <url> [--click <selector>] [--within <selector>] [--out <dir>]")
    console.log("See the top of this file for every option.")
    process.exit(options.help ? 0 : 1)
  }
  const frames = Math.max(2, Number(options.frames ?? 10))
  const slow = Math.max(1, Number(options.slow ?? 4))
  const span = Math.max(50, Number(options.span ?? 600))
  const width = Number(options.width ?? 1200)
  const height = Number(options.height ?? 800)
  const out = resolve(options.out ?? "motion-capture")
  const executablePath = findChrome(options.chrome)
  if (!executablePath) throw new Error("No Chrome found. Pass --chrome <path> or set CHROME_PATH.")

  const { chromium } = await loadPlaywright()
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox"] })
  try {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: options.scheme === "dark" ? "dark" : "light",
      reducedMotion: options.reduced ? "reduce" : "no-preference",
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", (error) => errors.push(error.message))
    const session = await context.newCDPSession(page)
    await session.send("Animation.enable")
    await session.send("Animation.setPlaybackRate", { playbackRate: 1 / slow })

    await page.addInitScript(() => {
      window.__motion = { shifts: [] }
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__motion.shifts.push({ at: entry.startTime, value: entry.value })
          }
        }).observe({ type: "layout-shift", buffered: true })
      } catch {}
    })

    const target = () => (options.within ? page.locator(options.within).first() : page)
    const shots = []
    const animations = []
    const shoot = async (index, at) => {
      const path = join(out, `frame-${String(index).padStart(2, "0")}.png`)
      await target().screenshot({ path, animations: "allow" })
      shots.push({ file: path, at })
      for (const item of await page.evaluate(describeAnimations)) animations.push(item)
    }

    const loadOnly = options.click.length === 0
    if (loadOnly) {
      await page.goto(options.url, { waitUntil: "commit" })
    } else {
      await page.goto(options.url, { waitUntil: "load" })
      for (const selector of options.before) {
        await page.locator(selector).first().click()
        await page.waitForTimeout(400 * slow)
      }
      await page.waitForTimeout(600 * slow + Number(options.wait ?? 0))
      await shoot(0, "before")
      for (const selector of options.click) await page.locator(selector).first().click()
    }

    const started = Date.now()
    const step = (span * slow) / (frames - 1)
    for (let index = loadOnly ? 0 : 1; index < frames; index += 1) {
      const due = started + step * (loadOnly ? index : index - 1)
      const wait = due - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
      await shoot(index, `${Math.round((Date.now() - started) / slow)}ms`)
    }

    const shifts = await page.evaluate(() => window.__motion?.shifts ?? [])
    const unique = [...new Map(animations.map((item) => [JSON.stringify(item), item])).values()]
    const report = {
      url: options.url,
      clicked: options.click,
      slowedBy: slow,
      reducedMotion: Boolean(options.reduced),
      frames: shots.map((shot) => ({ file: shot.file, at: shot.at })),
      animations: unique,
      layoutShift: Number(shifts.reduce((sum, shift) => sum + shift.value, 0).toFixed(4)),
      notes: review(unique, Boolean(options.reduced)),
      errors,
    }
    if (report.layoutShift > 0.05) {
      report.notes.push(`Content jumped while this played (layout shift ${report.layoutShift}). Reserve the space, or animate with translate.`)
    }
    if (unique.length === 0) {
      report.notes.push(
        options.reduced
          ? "Nothing animated, as it should with reduced motion requested."
          : "Nothing was animating in any frame. Either the change is instant, or it finished before the first frame; try a larger --slow."
      )
    }
    writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`)

    const sheet = await context.newPage()
    const columns = Math.min(shots.length, 4)
    await sheet.setViewportSize({ width: 1600, height: 900 })
    await sheet.setContent(
      `<body style="margin:0;padding:12px;background:#111;font:12px system-ui;color:#ddd">
        <div style="display:grid;grid-template-columns:repeat(${columns},1fr);gap:10px">
          ${shots
            .map(
              (shot) =>
                `<figure style="margin:0"><img src="data:image/png;base64,${readFileSync(shot.file).toString("base64")}" style="width:100%;display:block;background:#fff"><figcaption style="padding:4px 0">${shot.at}</figcaption></figure>`
            )
            .join("")}
        </div>
      </body>`,
      { waitUntil: "load" }
    )
    await sheet.screenshot({ path: join(out, "sheet.png"), fullPage: true })

    console.log(`${shots.length} frames in ${out}`)
    console.log(`Look at ${join(out, "sheet.png")}`)
    const line = (item) =>
      `${item.name || item.kind}  ${Math.round(item.duration)}ms  ${item.easing}  [${item.properties.join(", ")}]`
    for (const item of unique.filter((entry) => !entry.viewTransition)) {
      console.log(`  ${item.target}  ${line(item)}`)
    }
    const shared = unique.filter((entry) => entry.viewTransition && entry.target.includes("view-transition-group"))
    if (shared.length) {
      const names = shared.map((entry) => /\(([^)]*)\)/.exec(entry.target)?.[1]).filter((name) => name && name !== "root")
      console.log(`  view transition  ${Math.round(shared[0].duration)}ms  ${shared[0].easing}  shared elements: ${names.join(", ") || "none"}`)
    }
    for (const line of report.notes) console.log(`  note: ${line}`)
    for (const line of errors) console.log(`  page error: ${line}`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
