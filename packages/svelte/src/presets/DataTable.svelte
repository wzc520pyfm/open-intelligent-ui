<script lang="ts">
  import { type TableSort, tableView, type ViewProps } from "@open-intelligent-ui/core/renderer"
  import Nodes from "../render/Nodes.svelte"

  /** A table of rows with sorting, paging and row selection. */
  let props: ViewProps = $props()

  let sort = $state.raw<TableSort | null>(null)
  let page = $state(0)
  const setSort = (next: TableSort | null) => {
    sort = next
  }
  const setPage = (next: number) => {
    page = next
  }
</script>

<Nodes nodes={tableView(props, { sort, page, setSort, setPage })} />
