import { describe, expect, test, vi } from "vitest"
import { UI_SDK_CATALOG } from "../../core/src/prompt/ui-sdk-catalog.generated"
import { type HostFunction, preloadUiSdk } from "../src"
import { UI_SDK_ELEMENTS } from "../src/registry/ui-sdk.generated"
import { byLabel, byRole, byText, click, draw, flushPromises, text, until } from "./helpers"

const sources = import.meta.glob<string>("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
})

/** Every element under `root`, itself included. */
const everything = (root: Element): Element[] => [root, ...root.querySelectorAll("*")]

const attributesOf = (root: Element): string[] =>
  everything(root).flatMap((element) => [...element.attributes].map((attribute) => attribute.name))

/**
 * The channels a renderer with no framework opens by itself: this one sets
 * attributes, assigns properties and adds listeners with its own hands, and
 * draws UI SDK with custom elements that read attributes of their own.
 * Each test names one channel and what was found there, the safe ones too.
 */
describe("safety of the renderer's own channels", () => {
  test("the renderer never builds DOM from a string", () => {
    const parsing =
      /\.(innerHTML|outerHTML)\b|insertAdjacentHTML|insertAdjacentText|DOMParser|createContextualFragment|document\.write|setHTMLUnsafe|parseHTMLUnsafe|\bsrcdoc\b|new Function|\beval\(/
    const found = Object.entries(sources)
      .filter(([file]) => !file.endsWith(".generated.ts"))
      .flatMap(([file, code]) =>
        code
          .split("\n")
          .filter((line) => parsing.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line))
          .map((line) => `${file}: ${line.trim()}`)
      )
    expect(found).toEqual([])
  })

  test("text from state is text wherever it lands", async () => {
    await preloadUiSdk("Button", "Progress", "Tabs")
    const Plain: HostFunction = (props, children) => {
      const out = document.createElement("section")
      out.setAttribute("aria-label", String(props.label))
      out.append(...children)
      return out
    }
    const { container } = await draw({
      source: `<state html="<img id='pwn' src='x' onerror='window.pwned = 1'>" />
<Button aria-label={html} title={html}>{html}</Button>
<Progress value={50}><ProgressValue let:state>{html}{state.text}</ProgressValue></Progress>
<Tabs defaultValue="a"><TabsList><TabsTab value="a">{html}</TabsTab></TabsList><TabsPanel value="a">{html}</TabsPanel></Tabs>
<Plain label={html}>{html}</Plain>
<Tag label={html}>{html}</Tag>
<text>{html}</text>
<icon name={html} label={html} />
<Stat label={html} value={1} caption={html} />
<button on:click={toast(html)}>raise</button>`,
      components: { Plain, Tag: "host-tag" },
    })
    await click(byText(container, "raise"))
    await flushPromises()
    expect(container.querySelector("#pwn")).toBeNull()
    expect(document.querySelector("#pwn")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(text(container)).toContain("<img id='pwn'")
    expect(container.querySelector(".iui-toasts")?.textContent).toContain("<img id='pwn'")
    expect((window as { pwned?: unknown }).pwned).toBeUndefined()
  })

  test("properties that rewrite an element are never assigned, on any kind of element", async () => {
    await preloadUiSdk("Button", "Tabs", "Slider", "Input")
    class Loose extends HTMLElement {}
    if (!customElements.get("host-loose")) customElements.define("host-loose", Loose)
    const html = "<img id='pwn' src='x'>"
    const names = ["innerHTML", "outerHTML", "textContent", "innerText", "outerText", "nodeValue", "INNERHTML", "innerhtml"]
    const attrs = names.map((name) => `${name}="${html}"`).join(" ")
    const bag = `{ ${names.map((name) => `${name}: "${html}"`).join(", ")} }`
    const { container } = await draw({
      source: `<state bag={${bag}} html="${html}" />
<div aria-label="native" ${attrs} {...bag} bind:innerHTML={html} bind:textContent={html}>kept</div>
<card aria-label="primitive" ${attrs} {...bag}>kept</card>
<Button aria-label="part" ${attrs} {...bag} bind:innerHTML={html} bind:textContent={html}>kept</Button>
<Tabs aria-label="root" defaultValue="a" ${attrs} {...bag}><TabsList><TabsTab value="a">kept</TabsTab></TabsList></Tabs>
<Input aria-label="input" ${attrs} {...bag} />
<Loose aria-label="tag" ${attrs} {...bag}>kept</Loose>
<Listed aria-label="listed" ${attrs} {...bag}>kept</Listed>`,
      components: {
        Loose: "host-loose",
        Listed: { tag: "host-loose", properties: names },
      },
    })
    expect(container.querySelector("#pwn")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    for (const label of ["native", "primitive", "part", "tag", "listed"]) {
      expect(byLabel(container, label).textContent).toBe("kept")
    }
    expect(byRole(container, "tab")[0]?.textContent).toBe("kept")
    expect(container.querySelector(".iui-error")).toBeNull()
    // What is left of them is an inert attribute, which is all a name the DOM doesn't know can be.
    const left = new Set(attributesOf(container).filter((name) => /html|text|nodevalue/i.test(name)))
    expect([...left].sort()).toEqual(["innertext", "nodevalue", "outertext", "textcontent"])
  })

  test("a property is assigned only where the generated table lists it, and no listed name rewrites the DOM", () => {
    const probe = document.createElement("div")
    const collisions = new Map<string, string[]>()
    const all = new Set<string>()
    for (const [name, spec] of Object.entries(UI_SDK_ELEMENTS)) {
      for (const option of `${spec.options ?? ""} ${spec.live ?? ""}`.split(" ").filter(Boolean)) {
        all.add(option)
        if (option in probe) collisions.set(option, [...(collisions.get(option) ?? []), name])
      }
    }
    expect(all.size).toBeGreaterThan(200)
    for (const name of all) {
      expect(name).not.toMatch(/^on/i)
      expect(name).not.toMatch(/html|textcontent|innertext|outertext|nodevalue|^style$|^class(name|list)?$|^slot$|^part$|^is$/i)
    }
    // The only listed names an element already has: both are plain reflected strings.
    expect([...collisions.keys()].sort()).toEqual(["align", "id"])
    expect(collisions.get("id")).toEqual(["ResizablePanel"])
  })

  test("a name the table doesn't list reaches a UI SDK element as an attribute, not a property", async () => {
    await preloadUiSdk("Tabs", "Button")
    const { container } = await draw({
      source: `<Tabs aria-label="root" defaultValue="a" hidden={false} title="t" tabIndex={3} className="mine" contentEditable="true" dataset={{ x: 1 }} attributes={[1]} shadowRoot="x" prototype="x" constructor="x" __proto__="x"><TabsList><TabsTab value="a">A</TabsTab></TabsList></Tabs>
<Button aria-label="part" dataset={{ x: 1 }} attributes={[1]} form="outside" popover="auto" autofocus>B</Button>`,
    })
    const root = byLabel(container, "root")
    expect(root.localName).toBe("ui-tabs")
    expect(root.getAttribute("title")).toBe("t")
    expect(root.getAttribute("tabindex")).toBe("3")
    expect(root.getAttribute("class")).toBe("mine")
    expect(root.hasAttribute("dataset")).toBe(false)
    expect(root.hasAttribute("attributes")).toBe(false)
    expect(Object.keys(root.dataset)).not.toContain("x")
    expect(Object.getPrototypeOf(root)).toBe(customElements.get("ui-tabs")?.prototype)
    expect(Object.hasOwn(root, "shadowRoot")).toBe(false)
    expect(Object.hasOwn(root, "constructor")).toBe(false)
    const part = byLabel(container, "part")
    expect(part.localName).toBe("button")
    expect(Object.keys(part.dataset)).not.toContain("x")
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("no attribute that could be an inline handler is ever set", async () => {
    await preloadUiSdk("Button", "Tabs", "Input", "Avatar")
    const code = "window.pwned = 1"
    const names = ["onclick", "onClick", "ONCLICK", "onerror", "onload", "onfocus", "onpointerdown", "onanimationend", "ontoggle", "onbeforetoggle"]
    const attrs = names.map((name) => `${name}="${code}"`).join(" ")
    const bag = `{ ${names.map((name) => `${name}: "${code}"`).join(", ")}, "on-click": "${code}", "on:click": "${code}" }`
    const Plain: HostFunction = (props) => {
      const out = document.createElement("i")
      out.setAttribute("aria-label", "function")
      out.textContent = Object.keys(props).filter((name) => /^on/i.test(name)).join(",")
      return out
    }
    const { container } = await draw({
      source: `<state bag={${bag}} code="${code}" />
<div aria-label="native" ${attrs} {...bag} bind:onclick={code}>x</div>
<svg aria-label="svg" ${attrs} {...bag}><circle r="2" ${attrs} {...bag} /></svg>
<card aria-label="primitive" ${attrs} {...bag}>x</card>
<Button aria-label="part" ${attrs} {...bag} bind:onclick={code}>x</Button>
<Tabs aria-label="root" defaultValue="a" ${attrs} {...bag}><TabsList><TabsTab value="a" ${attrs}>x</TabsTab></TabsList></Tabs>
<Input aria-label="input" ${attrs} {...bag} />
<Avatar><AvatarImage alt="image" src="https://example.com/a.png" ${attrs} {...bag} /></Avatar>
<Tag aria-label="tag" ${attrs} {...bag}>x</Tag>
<Listed aria-label="listed" ${attrs} {...bag}>x</Listed>
<Plain ${attrs} {...bag} />`,
      components: {
        Tag: "host-tag",
        Listed: { tag: "host-tag", properties: ["onclick", "onClick"] },
        Plain,
      },
    })
    expect(attributesOf(container).filter((name) => /^on/i.test(name))).toEqual([])
    for (const element of everything(container)) {
      const handlers = element as HTMLElement
      expect(handlers.onclick).toBeNull()
      expect(handlers.onerror).toBeNull()
      expect(handlers.onload).toBeNull()
    }
    for (const label of ["native", "primitive", "part", "tag", "listed"]) {
      byLabel(container, label).dispatchEvent(new MouseEvent("click", { bubbles: true }))
    }
    expect((window as { pwned?: unknown }).pwned).toBeUndefined()
    expect(container.querySelector(".iui-error")).toBeNull()
  })

  test("a handler markup writes is a listener, and it is handed data, never the element or the event", async () => {
    await preloadUiSdk("Tabs")
    const { container, view } = await draw({
      source: `<state seen={null} detail={null} native={null} />
<Tabs defaultValue="a" on:valueChange={(value, details) => { seen = value; detail = details }}>
  <TabsList><TabsTab value="a">A</TabsTab><TabsTab value="b">B</TabsTab></TabsList>
</Tabs>
<button aria-label="native" on:click={e => native = e}>x</button>`,
    })
    await click(byRole(container, "tab")[1] as HTMLElement)
    await click(byLabel(container, "native"))
    const state = view.getState()
    expect(state.seen).toBe("b")
    expect(state.native).toEqual({ type: "click", value: "" })
    const reachable: unknown[] = []
    const walk = (value: unknown, depth = 0) => {
      if (value === null || typeof value !== "object" || depth > 8) {
        if (typeof value === "function") reachable.push(value)
        return
      }
      if (value instanceof Node || value instanceof Event || value === window) reachable.push(value)
      else for (const item of Object.values(value)) walk(item, depth + 1)
    }
    walk(state)
    expect(reachable).toEqual([])
    // `waitUntil` and the event the element saw are in the detail; neither is data.
    expect(state.detail).not.toHaveProperty("waitUntil")
    expect(byLabel(container, "native").getAttribute("onclick")).toBeNull()
  })

  test("URL-bearing attributes on custom elements and what they wrap go through the URL check", async () => {
    await preloadUiSdk("Button", "Toolbar", "Avatar", "Tabs", "HoverCard", "NavigationMenu")
    const asked: string[] = []
    const { container } = await draw({
      source: `<state bad="javascript:alert(1)" data="data:text/html,<script>alert(1)</script>" />
<Toolbar aria-label="Tools">
  <ToolbarLink href="javascript:alert(1)">one</ToolbarLink>
  <ToolbarLink href={bad}>two</ToolbarLink>
  <ToolbarLink HREF="JaVaScRiPt:alert(1)" xlink:href="javascript:alert(1)">three</ToolbarLink>
  <ToolbarLink href="https://example.com/ok">four</ToolbarLink>
  <ToolbarLink href={data}>five</ToolbarLink>
</Toolbar>
<Avatar><AvatarImage alt="avatar" src="javascript:alert(1)" /><AvatarFallback>AB</AvatarFallback></Avatar>
<Tabs aria-label="root" defaultValue="a" href="javascript:alert(1)" src="javascript:alert(1)" poster="javascript:alert(1)" action="javascript:alert(1)" formaction="javascript:alert(1)" data="javascript:alert(1)" background="javascript:alert(1)"><TabsList><TabsTab value="a" formaction="javascript:alert(1)" href="javascript:alert(1)">A</TabsTab></TabsList></Tabs>
<Tag aria-label="tag" href="javascript:alert(1)" src={bad} poster={bad} action={bad} formAction={bad} srcdoc="<script>alert(1)</script>" srcset="https://example.com/a.png 1x" ping="https://example.com/p">x</Tag>`,
      components: { Tag: "host-tag" },
      allowUrl: (url) => {
        asked.push(url)
        return true
      },
    })
    for (const label of ["one", "two", "three", "five"]) {
      expect(byText(container, label).hasAttribute("href")).toBe(false)
    }
    expect(byText(container, "four").getAttribute("href")).toBe("https://example.com/ok")
    expect(container.querySelector("img[alt=avatar]")?.hasAttribute("src") ?? false).toBe(false)
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain("data:text/html")
    for (const name of ["href", "src", "poster", "action", "formaction", "srcdoc", "srcset", "ping"]) {
      const holders = everything(container).filter((element) => element.hasAttribute(name))
      expect(holders.map((element) => element.textContent)).toEqual(name === "href" ? ["four"] : [])
    }
    // What is left names a URL only on <object>, <body> and table cells. The
    // custom element is none of those, so there it is an attribute nobody reads.
    const root = byLabel(container, "root")
    expect(root.localName).toBe("ui-tabs")
    expect(
      everything(container)
        .filter((element) => /javascript:/i.test(element.outerHTML.slice(0, element.outerHTML.indexOf(">"))))
        .map((element) => element.localName)
    ).toEqual(["ui-tabs"])
    expect([...root.attributes].filter((a) => /javascript:/i.test(a.value)).map((a) => a.name)).toEqual([
      "data",
      "background",
    ])
    expect(asked).toEqual(["https://example.com/ok"])
  })

  test("the native elements UI SDK parts wrap are the ones React renders, none of which loads a URL unasked", () => {
    const inner = new Set(Object.values(UI_SDK_ELEMENTS).map((spec) => spec.inner).filter(Boolean))
    expect([...inner].sort()).toEqual([
      "a",
      "button",
      "canvas",
      "fieldset",
      "h3",
      "img",
      "input",
      "select",
      "textarea",
      "time",
    ])
  })

  test("is= never names a customized built-in, and no element is created through it", async () => {
    await preloadUiSdk("Button")
    const made = vi.fn()
    class Evil extends HTMLButtonElement {
      constructor() {
        super()
        made()
      }
    }
    if (!customElements.get("evil-button")) {
      customElements.define("evil-button", Evil, { extends: "button" })
    }
    const { container } = await draw({
      source: `<state bag={{ is: "evil-button", IS: "evil-button" }} />
<button aria-label="native" is="evil-button" {...bag}>x</button>
<Button aria-label="part" is="evil-button" IS="evil-button" {...bag} bind:is={bag.is}>x</Button>
<Tag aria-label="tag" is="evil-button" {...bag}>x</Tag>
<Listed aria-label="listed" is="evil-button">x</Listed>`,
      components: { Tag: "host-tag", Listed: { tag: "host-tag", properties: ["is"] } },
    })
    expect(made).not.toHaveBeenCalled()
    expect(attributesOf(container)).not.toContain("is")
    for (const label of ["native", "part"]) {
      expect(byLabel(container, label)).not.toBeInstanceOf(Evil)
    }
  })

  test("slot and part are plain attributes, and no UI SDK element has a shadow tree for them to act on", async () => {
    const attach = vi.spyOn(Element.prototype, "attachShadow")
    await preloadUiSdk()
    for (const entry of UI_SDK_CATALOG.slice(0, 12)) {
      const drawn = await draw({ source: entry.example })
      drawn.view.unmount()
      drawn.host.remove()
    }
    const { container } = await draw({
      source: `<div aria-label="native" slot="title" part="label">x</div>
<Button aria-label="part" slot="title" part="label">x</Button>
<Tabs aria-label="root" defaultValue="a" slot="title" part="label"><TabsList><TabsTab value="a">A</TabsTab></TabsList></Tabs>
<Tag aria-label="tag" slot="title" part="label"><span slot="inner">y</span></Tag>`,
      components: { Tag: "host-tag" },
    })
    expect(attach).not.toHaveBeenCalled()
    attach.mockRestore()
    // A native element takes neither; the shared attribute list doesn't have them.
    const native = byLabel(container, "native")
    expect(native.hasAttribute("slot") || native.hasAttribute("part")).toBe(false)
    expect(byLabel(container, "tag").querySelector("span")?.hasAttribute("slot")).toBe(false)
    // A component passes them on, as React does, to an element with no shadow tree.
    for (const label of ["part", "root", "tag"]) {
      const element = byLabel(container, label)
      expect(element.getAttribute("slot")).toBe("title")
      expect(element.getAttribute("part")).toBe("label")
      expect(element.shadowRoot).toBeNull()
      expect(element.assignedSlot ?? null).toBeNull()
      expect(container.contains(element)).toBe(true)
    }
    // It loads every UI SDK entry point, which takes seconds on a busy machine.
  }, 60_000)

  test("a UI SDK part can't attach itself to a root outside the surface with for=", async () => {
    await preloadUiSdk("Dialog", "Tabs")
    const outside = document.body.appendChild(document.createElement("ui-dialog"))
    outside.id = "host-dialog"
    const opened = vi.fn()
    outside.addEventListener("openchange", opened)
    try {
      const { container } = await draw({
        source: `<state bag={{ for: "host-dialog", htmlFor: "host-dialog", FOR: "host-dialog" }} id="host-dialog" />
<DialogTrigger for="host-dialog">one</DialogTrigger>
<DialogTrigger htmlFor="host-dialog">two</DialogTrigger>
<DialogTrigger FOR="host-dialog" For="host-dialog">three</DialogTrigger>
<DialogTrigger {...bag}>four</DialogTrigger>
<DialogTrigger bind:for={id}>five</DialogTrigger>
<DialogClose for="host-dialog">six</DialogClose>`,
      })
      await flushPromises()
      for (const label of ["one", "two", "three", "four", "five", "six"]) {
        const button = byText(container, label)
        expect(button.closest("[for]")).toBeNull()
        await click(button)
      }
      expect(attributesOf(container)).not.toContain("for")
      expect(opened).not.toHaveBeenCalled()
      expect((outside as HTMLElement & { open?: boolean }).open).toBeFalsy()
    } finally {
      outside.remove()
    }
  })

  test("for= still labels a control, which is all it does on a root", async () => {
    await preloadUiSdk("Label", "Input")
    const { container } = await draw({
      source: `<Label htmlFor="mail">Email</Label>
<input id="mail" />`,
    })
    const label = byText(container, "Email")
    expect(label.closest("[for]")?.getAttribute("for") ?? label.getAttribute("for")).toBe("mail")
  })

  test("a popup can't be sent to an element the reply picks with container=", async () => {
    await preloadUiSdk("Popover", "Dialog", "Select")
    const target = document.body.appendChild(document.createElement("div"))
    target.id = "host-target"
    try {
      const { container } = await draw({
        source: `<state bag={{ container: "#host-target", Container: "#host-target", CONTAINER: "body" }} where="#host-target" />
<Popover defaultOpen container="#host-target" {...bag} bind:container={where}>
  <PopoverTrigger>open</PopoverTrigger>
  <PopoverContent container="#host-target" Container="body" CONTAINER="body" {...bag} bind:container={where}>inside one</PopoverContent>
</Popover>
<Dialog defaultOpen container="#host-target" CONTAINER="#host-target" {...bag}>
  <DialogContent container="#host-target" {...bag}><DialogTitle>inside two</DialogTitle></DialogContent>
</Dialog>`,
      })
      await flushPromises()
      expect(attributesOf(container).filter((name) => name.toLowerCase() === "container")).toEqual([])
      expect(target.childNodes).toHaveLength(0)
      expect(target.textContent).toBe("")
      for (const element of everything(container)) {
        expect((element as { container?: unknown }).container ?? null).toBeNull()
      }
    } finally {
      target.remove()
    }
  })

  test("markup can't write a custom element by its tag, the host's or UI SDK's or this renderer's", async () => {
    await preloadUiSdk("Dialog")
    class Admin extends HTMLElement {}
    if (!customElements.get("host-admin")) customElements.define("host-admin", Admin)
    const { container } = await draw({
      source: `<host-admin grant="all">one</host-admin>
<ui-dialog container="body" default-open>two</ui-dialog>
<ui-dialog-trigger for="x">three</ui-dialog-trigger>
<intelligent-ui source="<script>1</script>">four</intelligent-ui>
<Host-admin>five</Host-admin>
<template><host-admin>six</host-admin></template>
<slot name="x">seven</slot>`,
      components: { Admin: "host-admin" },
    })
    expect(container.querySelector("host-admin, ui-dialog, ui-dialog-trigger, intelligent-ui")).toBeNull()
    expect(container.querySelector("template, slot")).toBeNull()
    expect(text(container)).toContain("one")
  })

  test("a host component named by tag is only drawn if the tag can name a custom element", async () => {
    const { container } = await draw({
      source: `<Script>one</Script><Frame src="https://example.com">two</Frame><Odd>three</Odd><Fine label="ok">four</Fine>`,
      components: {
        Script: "script",
        Frame: { tag: "iframe" },
        Odd: "x-y onload=alert(1)",
        Fine: "host-tag",
      },
    })
    expect(container.querySelector("script, iframe")).toBeNull()
    expect(container.querySelectorAll("host-tag")).toHaveLength(1)
    expect(text(container)).toBe("onetwothreefour")
  })

  test("a name that isn't an attribute name is skipped instead of thrown on", async () => {
    await preloadUiSdk("Button")
    const { container } = await draw({
      source: `<state bag={{ "a b": 1, "x=y": 1, "<script>": 1, "": 1, "a\\"b": 1, "ok-name": "yes", "1st": 1 }} />
<div aria-label="native" {...bag}>x</div>
<Button aria-label="part" {...bag}>x</Button>
<Tag aria-label="tag" {...bag}>x</Tag>`,
      components: { Tag: "host-tag" },
    })
    expect(container.querySelector(".iui-error")).toBeNull()
    for (const label of ["native", "part", "tag"]) {
      const names = [...byLabel(container, label).attributes].map((attribute) => attribute.name)
      expect(names.filter((name) => !/^[a-z][-a-z0-9]*$/.test(name))).toEqual([])
    }
  })

  test("style on a custom element is a checked map, never a string of CSS", async () => {
    await preloadUiSdk("Button", "Tabs")
    const { container } = await draw({
      source: `<state css={{ backgroundImage: "url(https://evil.test/a.png)", color: "red" }} />
<Button aria-label="part" style="background: url(https://evil.test/b.png); color: red" style:width="expression(alert(1))">x</Button>
<Tabs aria-label="root" defaultValue="a" style={css}><TabsList><TabsTab value="a">A</TabsTab></TabsList></Tabs>
<Tag aria-label="tag" style="background: url(https://evil.test/c.png); color: red" bind:style={css}>x</Tag>`,
      components: { Tag: "host-tag" },
    })
    expect(container.innerHTML).not.toContain("evil.test")
    expect(container.innerHTML).not.toContain("expression(")
    expect(byLabel(container, "part").style.color).toBe("red")
    expect(byLabel(container, "tag").style.color).toBe("red")
  })

  test("a custom element's own default text and templates are built from elements, not markup text", async () => {
    await preloadUiSdk("Pagination", "Calendar", "Rating")
    const { container } = await draw({
      source: `<state html="<img id='pwn' src='x'>" />
<Pagination total={50} pageSize={10} defaultPage={2} aria-label={html}>
  <PaginationList let:pages>{#each pages.items as item}{#if item == "ellipsis-start" || item == "ellipsis-end"}<PaginationEllipsis />{:else}<PaginationLink page={item} aria-label={html} />{/if}{/each}</PaginationList>
</Pagination>
<Calendar defaultValue="2026-10-16">
  <CalendarGrid><CalendarWeeks let:cell><CalendarDay value={cell.date} title={html} data-html={html} /></CalendarWeeks></CalendarGrid>
</Calendar>`,
    })
    await flushPromises()
    expect(container.querySelector("#pwn")).toBeNull()
    expect(document.querySelector("#pwn")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelectorAll("ui-calendar-day").length).toBeGreaterThan(27)
    await until(() => expect(byRole(container, "button").length).toBeGreaterThan(2))
  })
})
