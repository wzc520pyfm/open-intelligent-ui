"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

const bare = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path)

/** A page in the sidebar; the one being read is marked. */
export function NavLink(props: { href: string; icon?: ReactNode; children: ReactNode }) {
  const current = bare(usePathname()) === bare(props.href)
  return (
    <Link href={props.href} className="docs-nav-item" aria-current={current ? "page" : undefined}>
      {props.icon}
      <span className="min-w-0">{props.children}</span>
    </Link>
  )
}
