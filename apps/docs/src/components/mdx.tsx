import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import { icon } from "@/lib/icons"
import { CheckDemo } from "./check-demo"
import { LiveExample } from "./live-example"

function Cards(props: { children: ReactNode }) {
  return <div className="not-prose my-5 grid gap-3 sm:grid-cols-2">{props.children}</div>
}

function Card(props: { title: string; href: string; icon?: string; children?: ReactNode }) {
  return (
    <Link href={props.href} className="docs-card" data-card>
      {props.icon ? <span className="docs-card-icon">{icon(props.icon)}</span> : null}
      <span className="docs-card-title">{props.title}</span>
      <span className="docs-card-text">{props.children}</span>
    </Link>
  )
}

const { CodeBlockTabs } = defaultMdxComponents

export const components: MDXComponents = {
  ...defaultMdxComponents,
  Cards,
  Card,
  CheckDemo,
  LiveExample,
  CodeBlockTabs: (props: ComponentProps<typeof CodeBlockTabs>) => (
    <CodeBlockTabs {...props} className="docs-code-tabs" />
  ),
}
