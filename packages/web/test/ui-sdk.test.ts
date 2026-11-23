import { createAgent } from "@ui-sdk/web/agent"
import { describe, expect, test } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import { isUiSdkComponent, PRESET_NAMES, preloadUiSdk, uiSdkComponentNames } from "../src"
import { lookupUiSdk } from "../src/registry/ui-sdk"
import { UI_SDK_WITHOUT_ELEMENT } from "../src/registry/ui-sdk.generated"
import { draw, flushPromises, text } from "./helpers"

const agent = createAgent()

/**
 * Doc examples written with JSX that markup has no form for. React throws on
 * them and shows an error block; the custom elements take the stray text as
 * content and draw the rest, so here they mount, without doing what the
 * example meant. Everything else must mount as written.
 */
const NOT_AS_WRITTEN: Record<string, string> = {
  calendar: "children are a JSX function; in markup use let:",
  preferences: "needs a controller object created in JavaScript",
  toast: "toasts are raised from JavaScript; in markup use the toast() action",
}

/**
 * React components with no custom element of their own, and what the
 * renderer draws for each. The generator finds this list; a name it gains
 * has to be given an answer here.
 */
const WITHOUT_ELEMENT: Record<string, string> = {
  AutocompleteItems: "its children; the element lists `items` itself",
  AvatarImage: "a native <img>, which <ui-avatar> looks for",
  CalendarWeeks: "<ui-calendar-weeks>, which the calendar entry defines directly",
  ComboboxItems: "its children; the element lists `items` itself",
  ComboboxValue: "its children",
  CommandItems: "its children; the element lists `items` itself",
  FieldControl: "a native <input>, which <ui-field> looks for",
  ListboxItems: "its children; the element lists `items` itself",
  MenuItems: "its children; the element lists `items` itself",
  PasswordInputControl: "a native <input>, which <ui-password-input> looks for",
  Preferences: "its children; it needs a controller created in JavaScript",
  SelectItems: "its children; the element lists `items` itself",
  TreeItems: "its children; the element lists `items` itself",
  TriggerMenuItems: "its children; the element lists `items` itself",
}

describe("UI SDK coverage", () => {
  test("every exported component is reachable by name", () => {
    const names = uiSdkComponentNames()
    expect(names.length).toBeGreaterThan(300)
    for (const entry of UI_SDK_CATALOG) {
      for (const part of entry.parts) expect(isUiSdkComponent(part)).toBe(true)
    }
  })

  test("every name loads a custom element", async () => {
    const names = uiSdkComponentNames()
    await preloadUiSdk()
    const missing = names.filter((name) => {
      const found = lookupUiSdk(name)
      if (found.status !== "ready") return true
      const { spec } = found.component
      if (!spec) return !Object.hasOwn(WITHOUT_ELEMENT, name)
      return customElements.get(spec.tag) === undefined
    })
    expect(missing).toEqual([])
    expect([...UI_SDK_WITHOUT_ELEMENT].sort()).toEqual(Object.keys(WITHOUT_ELEMENT).sort())
  }, 60_000)

  test("no preset takes the name of a UI SDK component", () => {
    expect(PRESET_NAMES.length).toBeGreaterThan(0)
    expect(PRESET_NAMES.filter(isUiSdkComponent)).toEqual([])
  })

  test("the documented example of every entry point mounts from markup", async () => {
    const failed: Record<string, string> = {}
    for (const entry of UI_SDK_CATALOG) {
      await preloadUiSdk(...entry.parts)
      const { view, host, container } = await draw({ source: entry.example })
      await new Promise((resolve) => setTimeout(resolve, 10))
      await flushPromises()
      const error = container.querySelector(".iui-error")
      if (error) failed[entry.slug] = error.textContent ?? ""
      else if (!container.querySelector("[data-slot]")) failed[entry.slug] = "rendered no part"
      view.unmount()
      host.remove()
    }
    expect(failed).toEqual({})
    expect(UI_SDK_CATALOG.map((entry) => entry.slug)).toEqual(
      expect.arrayContaining(Object.keys(NOT_AS_WRITTEN))
    )
  }, 60_000)
})

describe("agent bridge", () => {
  test("an agent can read and operate a generated surface", async () => {
    await preloadUiSdk("Input", "Switch", "Field")
    const { container } = await draw({
      source: `<state project="Apollo" alerts={false} />
<Field name="project">
  <FieldLabel>Project name</FieldLabel>
  <Input bind:value={project} />
</Field>
<label>Alerts <Switch bind:checked={alerts}><SwitchThumb /></Switch></label>
<text>{project} / {alerts ? "alerts on" : "alerts off"}</text>`,
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
    expect(text(container)).toContain("Atlas / alerts off")
  })
})
