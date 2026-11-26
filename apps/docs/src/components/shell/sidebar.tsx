import type { Node, Root } from "fumadocs-core/page-tree"
import { ArrowUpRight, FlaskConical, History, Package } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { GitHubMark, Logo } from "@/lib/icons"
import type { Lang } from "@/lib/i18n"
import { NPM, REPOSITORY, VERSION } from "@/lib/site"
import { wordsFor } from "@/lib/words"
import { NavLink } from "./nav"

/** The playground is the site this one is served under, outside its base path. */
export const playgroundUrl = (lang: Lang) => (lang === "zh" ? "/?lang=zh" : "/")

export const homeUrl = (lang: Lang) => (lang === "zh" ? "/zh" : "/")

function Entries(props: { nodes: Node[] }): ReactNode {
  return props.nodes.map((node, index) => {
    if (node.type === "separator") {
      return (
        <p key={index} className="docs-nav-label">
          {node.name}
        </p>
      )
    }
    if (node.type === "folder") return <Entries key={node.$id ?? index} nodes={node.children} />
    return (
      <NavLink key={node.url} href={node.url} icon={node.icon}>
        {node.name}
      </NavLink>
    )
  })
}

function Outside(props: { href: string; icon: ReactNode; children: ReactNode; sameSite?: boolean }) {
  return (
    <a
      href={props.href}
      className="docs-nav-item"
      {...(props.sameSite ? {} : { target: "_blank", rel: "noreferrer" })}
    >
      {props.icon}
      <span className="min-w-0">{props.children}</span>
      <ArrowUpRight className="docs-nav-out" aria-hidden="true" />
    </a>
  )
}

export function Brand(props: { lang: Lang }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={homeUrl(props.lang)} className="flex items-center gap-2 rounded-lg">
        <Logo className="size-7" />
        <span className="text-[15px] font-semibold tracking-tight text-foreground">Open Intelligent UI</span>
      </Link>
      <a
        href={`${REPOSITORY}/releases`}
        target="_blank"
        rel="noreferrer"
        className="rounded-md px-1 text-xs text-(--docs-fg-subtle) tabular-nums hover:text-foreground"
      >
        v{VERSION}
      </a>
    </div>
  )
}

/** Every page, by section, then the ways out of the documentation. */
export function Pages(props: { tree: Root; lang: Lang }) {
  const words = wordsFor(props.lang)
  return (
    <nav aria-label={words.menu} className="flex flex-col gap-px">
      <Entries nodes={props.tree.children} />
      <p className="docs-nav-label">{words.links}</p>
      <Outside href={playgroundUrl(props.lang)} icon={<FlaskConical aria-hidden="true" />} sameSite>
        {words.playground}
      </Outside>
      <Outside href={REPOSITORY} icon={<GitHubMark />}>
        {words.github}
      </Outside>
      <Outside href={NPM} icon={<Package aria-hidden="true" />}>
        npm
      </Outside>
      <Outside href={`${REPOSITORY}/releases`} icon={<History aria-hidden="true" />}>
        {words.releases}
      </Outside>
    </nav>
  )
}
