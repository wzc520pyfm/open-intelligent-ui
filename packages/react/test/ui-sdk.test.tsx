import { render, screen, waitFor } from "@testing-library/react"
import { createAgent } from "@ui-sdk/react/agent"
import { describe, expect, test, vi } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import { IntelligentUI, isUiSdkComponent, preloadUiSdk, uiSdkComponentNames } from "../src"
import { PRESET_NAMES } from "../src/presets/presets"

const agent = createAgent()

/**
 * Doc examples that can't be mounted from markup exactly as UI SDK writes
 * them in JSX. Everything else must mount, so this list is the whole gap.
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

  test("no preset takes the name of a UI SDK component", () => {
    expect(PRESET_NAMES.length).toBeGreaterThan(0)
    expect(PRESET_NAMES.filter(isUiSdkComponent)).toEqual([])
  })

  test("the documented example of every entry point mounts from markup", async () => {
    const failed: Record<string, string> = {}
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    for (const entry of UI_SDK_CATALOG) {
      await preloadUiSdk(...entry.parts)
      const { container, unmount } = render(<IntelligentUI source={entry.example} />)
      await new Promise((resolve) => setTimeout(resolve, 10))
      if (container.querySelector(".iui-error")) failed[entry.slug] = "failed to render"
      else if (!container.querySelector("[data-slot]")) failed[entry.slug] = "rendered no part"
      unmount()
    }
    error.mockRestore()
    expect(Object.keys(failed).sort()).toEqual(Object.keys(NOT_AS_WRITTEN).sort())
  }, 60_000)
})

describe("agent bridge", () => {
  test("an agent can read and operate a generated surface", async () => {
    await preloadUiSdk("Input", "Switch", "Field")
    const { container } = render(
      <IntelligentUI
        source={`<state project="Apollo" alerts={false} />
<Field name="project">
  <FieldLabel>Project name</FieldLabel>
  <Input bind:value={project} />
</Field>
<label>Alerts <Switch bind:checked={alerts}><SwitchThumb /></Switch></label>
<text>{project} / {alerts ? "alerts on" : "alerts off"}</text>`}
      />
    )
    await waitFor(() => expect(screen.getByLabelText("Project name")).not.toBeNull())

    const snapshot = JSON.stringify(await agent.snapshot())
    expect(snapshot).toContain('"component":"input"')
    expect(snapshot).toContain("Project name")
    expect(snapshot).toContain("Apollo")
    expect(snapshot).toContain('"component":"switch"')

    await agent.act({
      steps: [{ ref: "Project name", action: "setValue", args: ["Atlas"] }],
    })
    await waitFor(() => expect(container.textContent).toContain("Atlas / alerts off"))
  })
})
