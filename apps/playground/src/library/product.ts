import { defineLibrary, defineWidget, type Library, view } from "@open-intelligent-ui/core"

/**
 * The components of a made-up product, the kind a company registers so that
 * every reply shows an approval or a person the way the rest of the product
 * does. They are widgets: drawn once here with framework-neutral views, and
 * styled only with the design's variables, so each renderer and each design
 * shows them without more work.
 */

const classes = (...names: unknown[]) => names.filter((name) => typeof name === "string" && name).join(" ")

interface StepsProps {
  items: string[]
  current?: number
  onSelect?: (index: number) => void
  class?: string
}

const Steps = defineWidget<StepsProps>({
  name: "Steps",
  description:
    "Where something stands in a fixed sequence, such as an approval or an order. Use it for every sequence of stages; don't draw one yourself.",
  props: {
    items: { type: "array", items: "string", required: true, description: "The stages, in order." },
    current: {
      type: "number",
      default: 0,
      description: "The index of the stage in progress. The stages before it are done.",
    },
  },
  events: { select: "A stage was pressed. `$value` is its index." },
  example: `<Steps items={["Submitted", "Manager", "Finance", "Paid"]} current={1} />`,
  setup: () => (props) => {
    const items = Array.isArray(props.items) ? props.items.map(String) : []
    const current = Number(props.current) || 0
    const press = props.onSelect
    return view(
      "ol",
      {
        class: classes("acme-steps", props.class),
        style: { display: "flex", gap: "6px", margin: 0, padding: 0, listStyle: "none" },
      },
      items.map((item, index) => {
        const stage = index < current ? "done" : index === current ? "current" : "todo"
        return view(
          "li",
          {
            key: index,
            "data-stage": stage,
            "aria-current": stage === "current" ? "step" : undefined,
            role: press ? "button" : undefined,
            tabindex: press ? 0 : undefined,
            style: {
              flex: "1 1 0",
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: "6px",
              cursor: press ? "pointer" : "default",
            },
            on: {
              click: press ? () => press(index) : undefined,
              keydown: press
                ? (event: KeyboardEvent) => {
                    if (event.key !== "Enter" && event.key !== " ") return
                    event.preventDefault()
                    press(index)
                  }
                : undefined,
            },
          },
          [
            view("span", {
              "aria-hidden": "true",
              style: {
                display: "block",
                width: "100%",
                height: "4px",
                borderRadius: "999px",
                background: stage === "todo" ? "var(--iui-color-border)" : "var(--iui-color-accent)",
                opacity: stage === "current" ? 0.5 : 1,
                transition:
                  "background var(--iui-motion-state-change-duration) var(--iui-motion-state-change-easing), opacity var(--iui-motion-state-change-duration) var(--iui-motion-state-change-easing)",
              },
            }),
            view(
              "span",
              {
                style: {
                  display: "block",
                  width: "100%",
                  textAlign: "center",
                  fontSize: "var(--iui-font-small-size)",
                  fontWeight: stage === "current" ? 600 : 400,
                  color: stage === "todo" ? "var(--iui-color-muted-foreground)" : "var(--iui-color-foreground)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              },
              [`${index + 1}. ${item}`]
            ),
          ]
        )
      })
    )
  },
})

interface PersonProps {
  name: string
  role?: string
  status?: "online" | "away" | "offline"
  class?: string
}

const STATUS: Record<string, string> = {
  online: "var(--iui-color-success)",
  away: "var(--iui-color-warning)",
  offline: "var(--iui-color-muted-foreground)",
}

const Person = defineWidget<PersonProps>({
  name: "Person",
  description: "A colleague: initials, name and what they do. Use it wherever a person is named.",
  props: {
    name: { type: "string", required: true },
    role: { type: "string", description: "Team, title or place." },
    status: ["online", "away", "offline"],
  },
  example: `<Person name="Mei Tanaka" role="Design · Tokyo" status="online" />`,
  setup: () => (props) => {
    const name = String(props.name ?? "")
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("")
    const status = props.status ? STATUS[props.status] : undefined
    return view(
      "span",
      {
        class: classes("acme-person", props.class),
        style: { display: "inline-flex", alignItems: "center", gap: "10px", minWidth: 0 },
      },
      [
        view(
          "span",
          {
            style: {
              position: "relative",
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: "36px",
              height: "36px",
              borderRadius: "999px",
              background: "var(--iui-color-muted)",
              color: "var(--iui-color-foreground)",
              fontSize: "var(--iui-font-small-size)",
              fontWeight: 600,
            },
          },
          [
            view("span", { "aria-hidden": "true" }, [initials]),
            status
              ? view("span", {
                  role: "img",
                  "aria-label": props.status,
                  style: {
                    position: "absolute",
                    right: "-1px",
                    bottom: "-1px",
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: status,
                    boxShadow: "0 0 0 2px var(--iui-color-surface)",
                  },
                })
              : null,
          ]
        ),
        view("span", { style: { display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.3 } }, [
          view("span", { style: { fontWeight: 600 } }, [name]),
          props.role
            ? view(
                "span",
                {
                  style: { fontSize: "var(--iui-font-small-size)", color: "var(--iui-color-muted-foreground)" },
                },
                [String(props.role)]
              )
            : null,
        ]),
      ]
    )
  },
})

interface PolicyCheckProps {
  result: "pass" | "review" | "fail"
  label: string
  class?: string
}

const RESULTS: Record<string, { color: string; mark: string; word: string }> = {
  pass: { color: "var(--iui-color-success)", mark: "✓", word: "Within policy" },
  review: { color: "var(--iui-color-warning)", mark: "!", word: "Needs a look" },
  fail: { color: "var(--iui-color-danger)", mark: "×", word: "Outside policy" },
}

const PolicyCheck = defineWidget<PolicyCheckProps>({
  name: "PolicyCheck",
  description:
    "One rule of the expense policy and whether a claim meets it. List the checks that matter; put the reason between the tags.",
  props: {
    result: { enum: ["pass", "review", "fail"], required: true },
    label: { type: "string", required: true, description: "The rule, in a few words." },
  },
  children: "one sentence on why, with the numbers",
  example: `<PolicyCheck result="review" label="Hotel rate">$312 a night against a $280 cap for Tokyo.</PolicyCheck>`,
  setup: () => (props, children) => {
    const result = RESULTS[props.result] ?? (RESULTS.review as (typeof RESULTS)[string])
    return view(
      "div",
      {
        class: classes("acme-check", props.class),
        "data-result": props.result,
        style: { display: "flex", alignItems: "flex-start", gap: "10px" },
      },
      [
        view(
          "span",
          {
            role: "img",
            "aria-label": result.word,
            style: {
              flex: "none",
              display: "grid",
              placeItems: "center",
              width: "20px",
              height: "20px",
              marginTop: "1px",
              borderRadius: "999px",
              background: `color-mix(in oklab, ${result.color} 16%, transparent)`,
              color: result.color,
              fontSize: "12px",
              fontWeight: 700,
              lineHeight: 1,
            },
          },
          [result.mark]
        ),
        view("div", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } }, [
          view("span", { style: { fontWeight: 600 } }, [String(props.label ?? "")]),
          children.length
            ? view(
                "span",
                {
                  style: { fontSize: "var(--iui-font-small-size)", color: "var(--iui-color-muted-foreground)" },
                },
                children
              )
            : null,
        ]),
      ]
    )
  },
})

/** What the product adds to every reply. The prompt and the renderer both read it. */
export const PRODUCT: Library<never> = defineLibrary<never>({
  components: [Steps, Person, PolicyCheck],
  instructions:
    "This is an expense tool. Show a person with `<Person>`, the stage of a claim with `<Steps>` and each policy rule with `<PolicyCheck>`; compose everything else as usual.",
})
