import { paginationRange } from "@ui-sdk/core/pagination"
import { type Component, component } from "../../dom/node"
import { UI_SDK_ELEMENTS, type UiSdkElement } from "../../registry/ui-sdk.generated"
import {
  drawElement,
  rootOf,
  Scoped,
  type ScopedProps,
  type Special,
  type UiSdkComponent,
} from "../adapter"
import { hasContent } from "../special"

const number = (element: Element, attribute: string): number | undefined => {
  const text = element.getAttribute(attribute)
  const value = text === null ? Number.NaN : Number(text)
  return Number.isFinite(value) ? value : undefined
}

/** What React's `PaginationList` hands its children: the pages to show, with a gap for each run left out. */
function pages(list: Element): unknown[] | null {
  const root = rootOf(list)
  if (!root) return null
  const total = number(root, "total")
  const pageSize = number(root, "page-size") ?? 10
  const pageCount =
    number(root, "page-count") ??
    (total === undefined ? 1 : Math.max(1, Math.ceil(total / Math.max(1, pageSize))))
  const page = Number((root as unknown as { page?: unknown }).page) || 1
  const siblings = number(root, "siblings")
  const boundaries = number(root, "boundaries")
  const items = paginationRange({
    page,
    pageCount,
    ...(siblings === undefined ? {} : { siblings }),
    ...(boundaries === undefined ? {} : { boundaries }),
  })
  return [{ items, page, pageCount }]
}

export const SPECIALS: Record<string, Special> = {
  // React writes the page number into a link left empty, and the dots into an ellipsis.
  PaginationLink: {
    draw: (props, key, children) =>
      drawElement(
        UI_SDK_ELEMENTS.PaginationLink as UiSdkElement,
        props,
        key,
        hasContent(children) || props.page === undefined ? children : [String(props.page)]
      ),
  },
  PaginationEllipsis: {
    draw: (props, key, children) =>
      drawElement(
        UI_SDK_ELEMENTS.PaginationEllipsis as UiSdkElement,
        props,
        key,
        hasContent(children) ? children : ["\u2026"]
      ),
  },
  PaginationList: {
    scoped(this: UiSdkComponent, props, key, lets, render) {
      return component(
        Scoped as Component<ScopedProps>,
        { type: this, props, lets, render, read: pages },
        key
      )
    },
  },
}
