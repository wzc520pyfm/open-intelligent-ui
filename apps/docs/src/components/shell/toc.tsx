"use client"

import { AnchorProvider, ScrollProvider, TOCItem, type TOCItemType } from "fumadocs-core/toc"
import { useRef } from "react"

/** The headings of the page; the one in view is marked as the page scrolls. */
export function Toc(props: { items: TOCItemType[]; label: string }) {
  const container = useRef<HTMLDivElement>(null)
  if (props.items.length === 0) return null
  return (
    <AnchorProvider toc={props.items}>
      <nav aria-label={props.label} className="flex min-h-0 flex-col">
        <p className="mb-2 text-[13px] leading-5 text-(--docs-fg-muted)">{props.label}</p>
        <div ref={container} className="docs-scroll min-h-0 overflow-y-auto pe-2">
          <ScrollProvider containerRef={container}>
            {props.items.map((item) => (
              <TOCItem key={item.url} href={item.url} data-depth={item.depth} className="docs-toc-item">
                {item.title}
              </TOCItem>
            ))}
          </ScrollProvider>
        </div>
      </nav>
    </AnchorProvider>
  )
}
