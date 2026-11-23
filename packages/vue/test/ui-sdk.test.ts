import { flushPromises, mount } from "@vue/test-utils"
import { createAgent } from "@ui-sdk/vue/agent"
import { describe, expect, test } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import {
  IntelligentUI,
  isUiSdkComponent,
  PRESET_NAMES,
  preloadUiSdk,
  uiSdkComponentNames,
} from "../src"
import { lookupUiSdk } from "../src/registry/ui-sdk"

const agent = createAgent()

/**
 * Doc examples that can't be mounted from markup exactly as UI SDK writes
 * them in JSX. Everything else must mount, so this list is the whole gap,
 * and it is the same gap the React renderer has.
 */
const NOT_AS_WRITTEN: Record<string, string> = {
  calendar: "children are a JSX function; in markup use let:",
  preferences: "needs a controller object created in JavaScript",
  toast: "toasts are raised from JavaScript; in markup use the toast() action",
}

describe("UI SDK coverage", () => {
  test("every exported component is reachable by name", () => {
    const names = uiSdkComponentNames()
    expect(names.length).toBeGreaterThan(300)
    for (const entry of UI_SDK_CATALOG) {
      for (const part of entry.parts) expect(isUiSdkComponent(part)).toBe(true)
    }
  })

  test("every name loads a Vue component", async () => {
    const names = uiSdkComponentNames()
    await preloadUiSdk()
    const missing = names.filter((name) => {
      const found = lookupUiSdk(name)
      if (found.status !== "ready") return true
      const component = found.component as { setup?: unknown; render?: unknown } | null
      return !component || !(component.setup || component.render || typeof component === "function")
    })
    expect(missing).toEqual([])
  }, 60_000)

  test("no preset takes the name of a UI SDK component", () => {
    expect(PRESET_NAMES.length).toBeGreaterThan(0)
    expect(PRESET_NAMES.filter(isUiSdkComponent)).toEqual([])
  })

  test("the documented example of every entry point mounts from markup", async () => {
    const failed: Record<string, string> = {}
    for (const entry of UI_SDK_CATALOG) {
      await preloadUiSdk(...entry.parts)
      const view = mount(IntelligentUI, { props: { source: entry.example }, attachTo: document.body })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await flushPromises()
      if (view.find(".iui-error").exists()) failed[entry.slug] = view.find(".iui-error").text()
      else if (!view.find("[data-slot]").exists()) failed[entry.slug] = "rendered no part"
      view.unmount()
    }
    expect(Object.keys(failed).sort()).toEqual(Object.keys(NOT_AS_WRITTEN).sort())
  }, 60_000)
})

describe("agent bridge", () => {
  test("an agent can read and operate a generated surface", async () => {
    await preloadUiSdk("Input", "Switch", "Field")
    const view = mount(IntelligentUI, {
      attachTo: document.body,
      props: {
        source: `<state project="Apollo" alerts={false} />
<Field name="project">
  <FieldLabel>Project name</FieldLabel>
  <Input bind:value={project} />
</Field>
<label>Alerts <Switch bind:checked={alerts}><SwitchThumb /></Switch></label>
<text>{project} / {alerts ? "alerts on" : "alerts off"}</text>`,
      },
    })
    await flushPromises()

    const snapshot = JSON.stringify(await agent.snapshot())
    expect(snapshot).toContain('"component":"input"')
    expect(snapshot).toContain("Project name")
    expect(snapshot).toContain("Apollo")
    expect(snapshot).toContain('"component":"switch"')

    await agent.act({
      steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }],
    })
    await flushPromises()
    expect(view.text()).toContain("Atlas / alerts off")
  })
})
