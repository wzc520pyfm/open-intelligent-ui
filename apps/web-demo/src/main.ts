import "@open-intelligent-ui/web/styles.css"
import "./app.css"
import type { SurfaceAction, ToolEvent } from "@open-intelligent-ui/core"
import { defineIntelligentUI, type IntelligentUIElement } from "@open-intelligent-ui/web"
// The demos, designs and the ticket system are the React playground's own files.
import { DEMOS } from "../../playground/src/demos"
import { THEMES } from "../../playground/src/themes"
import { createTicketTools } from "../../playground/src/tools"

defineIntelligentUI()

type Demo = (typeof DEMOS)[number]

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const out = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) out.setAttribute(name, value)
  out.append(...children)
  return out
}

const app = document.getElementById("app") as HTMLElement

let demo: Demo = DEMOS[0] as Demo
let scheme: "light" | "dark" = "light"
let streaming = false
let timer: number | undefined
let nextId = 1
let events: { id: number; kind: string; text: string }[] = []
let surface: IntelligentUIElement

const design = el(
  "select",
  {},
  THEMES.map((theme) => el("option", { value: theme.id }, [theme.name]))
)
const schemeButton = el("button", { type: "button" }, ["Dark"])
const replayButton = el("button", { type: "button" }, ["Replay as a stream"])
const resetButton = el("button", { type: "button" }, ["Reset state"])
const side = el("nav", { class: "wd-side", "aria-label": "Demos" })
const ask = el("p", { class: "wd-ask" })
const main = el("main", { class: "wd-main" }, [ask])
const stateView = el("pre")
const eventsEmpty = el("p", { class: "wd-dim" }, ["Actions, tool calls and warnings show up here."])
const eventsList = el("ul")

app.append(
  el("div", { class: "wd" }, [
    el("header", { class: "wd-top" }, [
      el("strong", {}, ["Open Intelligent UI"]),
      el("span", { class: "wd-tag" }, ["Web Components renderer"]),
      el("span", { class: "wd-grow" }),
      el("label", {}, ["Design ", design]),
      schemeButton,
      replayButton,
      resetButton,
    ]),
    side,
    main,
    el("aside", { class: "wd-inspect" }, [
      el("h2", {}, ["State"]),
      stateView,
      el("h2", {}, ["Events"]),
      eventsEmpty,
      eventsList,
    ]),
  ])
)

const themeOf = (id: string) => THEMES.find((item) => item.id === id) ?? THEMES[0]

function showEvents() {
  eventsEmpty.hidden = events.length > 0
  eventsList.hidden = events.length === 0
  eventsList.replaceChildren(
    ...events.map((event) => el("li", {}, [el("b", {}, [event.kind]), ` ${event.text}`]))
  )
}

function note(kind: string, text: string) {
  events = [{ id: nextId++, kind, text }, ...events].slice(0, 40)
  showEvents()
}

function stop() {
  window.clearInterval(timer)
  streaming = false
  surface.streaming = false
  replayButton.textContent = "Replay as a stream"
}

/** Feeds the reply in a few characters at a time, the way a model would. */
function replay() {
  stop()
  const full = demo.source
  let length = 0
  surface.source = ""
  surface.streaming = true
  streaming = true
  replayButton.textContent = "Stop"
  timer = window.setInterval(() => {
    length = Math.min(full.length, length + 14)
    surface.source = full.slice(0, length)
    if (length === full.length) stop()
  }, 16)
}

function onAction(action: SurfaceAction) {
  if (action.type === "send") note("send", `${action.text} ${JSON.stringify(action.data ?? {})}`)
  else note(action.type, "url" in action ? action.url : "text" in action ? action.text : "")
}

function onTool(event: ToolEvent) {
  if (event.status !== "start") note(`tool ${event.status}`, `${event.tool} (${event.kind})`)
}

/** Each demo gets a surface of its own, so no state carries over from the last one. */
function open(next: Demo) {
  window.clearInterval(timer)
  streaming = false
  replayButton.textContent = "Replay as a stream"
  demo = next
  design.value = next.theme ?? "paper"
  events = []
  showEvents()
  stateView.textContent = "{}"
  ask.textContent = next.prompt
  for (const button of side.querySelectorAll("button")) {
    button.setAttribute("aria-current", String(button.dataset.demo === next.id))
  }

  const fresh = document.createElement("intelligent-ui") as IntelligentUIElement
  fresh.className = "wd-surface"
  fresh.source = next.source
  fresh.design = themeOf(design.value)?.source
  fresh.scheme = scheme
  fresh.tools = createTicketTools()
  fresh.onAction = onAction
  fresh.addEventListener("tool", (event) => onTool((event as CustomEvent<ToolEvent>).detail))
  fresh.addEventListener("warning", (event) => note("warning", (event as CustomEvent<string>).detail))
  fresh.addEventListener("statechange", (event) => {
    stateView.textContent = JSON.stringify((event as CustomEvent).detail, null, 2)
  })
  if (surface) surface.replaceWith(fresh)
  else main.append(fresh)
  surface = fresh
}

for (const item of DEMOS) {
  const button = el("button", { type: "button", "data-demo": item.id }, [
    el("strong", {}, [item.title]),
    el("span", {}, [item.caption]),
  ])
  button.addEventListener("click", () => {
    if (item.id !== demo.id) open(item)
  })
  side.append(button)
}

design.addEventListener("change", () => {
  surface.design = themeOf(design.value)?.source
})

schemeButton.addEventListener("click", () => {
  scheme = scheme === "light" ? "dark" : "light"
  schemeButton.textContent = scheme === "light" ? "Dark" : "Light"
  document.documentElement.setAttribute("data-scheme", scheme)
  surface.scheme = scheme
})

replayButton.addEventListener("click", () => (streaming ? stop() : replay()))
resetButton.addEventListener("click", () => surface.reset())

document.documentElement.setAttribute("data-scheme", scheme)
open(demo)
