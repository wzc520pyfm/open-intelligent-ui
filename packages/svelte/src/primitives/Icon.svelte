<script lang="ts">
  import { iconPlaceholder, iconSpec, type ViewProps } from "@open-intelligent-ui/core/renderer"
  import type { ElementNode } from "../render/node.js"
  import Nodes from "../render/Nodes.svelte"
  import { nativeProps } from "../render/props.js"
  import { drawing } from "./icons.svelte.js"

  /** Draws a lucide icon by name, at the sizes and colors of the design. */
  let props: ViewProps = $props()

  const spec = $derived(iconSpec(props))
  const data = $derived(spec.name === null ? null : drawing(spec.name))

  // The same element lucide-react draws, so one stylesheet fits both.
  const drawn = $derived.by((): unknown => {
    if (!data) return iconPlaceholder(spec, data === null)
    const names = ["lucide", `lucide-${data.name}`, ...data.aliases.map((alias) => `lucide-${alias}`)]
    if (spec.class) names.push(spec.class)
    const icon: ElementNode = {
      kind: "element",
      tag: "svg",
      key: "icon",
      props: nativeProps({
        xmlns: "http://www.w3.org/2000/svg",
        width: spec.pixels,
        height: spec.pixels,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": spec.stroke,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        class: names.join(" "),
        "aria-hidden": spec.label ? undefined : "true",
        "aria-label": spec.label ?? undefined,
        role: spec.label ? "img" : undefined,
        style: spec.style,
      }),
      children: data.node.map(
        ([tag, attributes], index): ElementNode => ({
          kind: "element",
          tag,
          key: String(index),
          props: nativeProps(attributes),
          children: null,
        })
      ),
    }
    return icon
  })
</script>

<Nodes nodes={drawn} />
