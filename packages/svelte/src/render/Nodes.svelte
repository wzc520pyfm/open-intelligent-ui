<script lang="ts" module>
  const SVG = "http://www.w3.org/2000/svg"

  /**
   * Svelte makes an element in the namespace `xmlns` names, and would then
   * write the attribute too. Only an element that names its own keeps one.
   */
  function inNamespace(props: Record<string | symbol, unknown>): Record<string | symbol, unknown> {
    return "xmlns" in props ? props : { ...props, xmlns: undefined }
  }
</script>

<script lang="ts">
  import { held } from "./held.js"
  import Nodes from "./Nodes.svelte"
  import Presence from "./Presence.svelte"
  import { flatten } from "./view.js"

  /**
   * Draws a list of nodes. The list is made again on every change; the keys
   * say which element or component each node was last time, so Svelte
   * updates those in place and only makes what is new.
   */
  let { nodes, svg = false }: { nodes: unknown; svg?: boolean } = $props()

  const items = $derived(flatten(nodes))
</script>

{#each items as item (item.key)}{#if item.kind === "text"}{item.text}{:else if item.kind === "element"}{@const drawn = svg || item.tag === "svg"}{#if item.children === null}<svelte:element
        this={item.tag}
        xmlns={drawn ? SVG : undefined}
        {...drawn ? inNamespace(item.props) : held(item.tag, () => item.props)}
      />{:else}<svelte:element
        this={item.tag}
        xmlns={drawn ? SVG : undefined}
        {...drawn ? inNamespace(item.props) : held(item.tag, () => item.props)}
        ><Nodes nodes={item.children} svg={drawn && item.tag !== "foreignObject"} /></svelte:element
      >{/if}{:else if item.kind === "component"}{@const Type = item.type}{#snippet content(given: unknown)}<Nodes
        nodes={item.render ? item.render(given) : item.children}
        {svg}
      />{/snippet}<Type
      {...item.props}
      children={item.render || item.children.length ? content : undefined}
    />{:else if item.kind === "presence"}<Presence show={item.show}
      ><Nodes nodes={item.child} {svg} /></Presence
    >{:else if item.kind === "snippet"}{@render item.snippet()}{/if}{/each}
