import { findNeighbour } from "fumadocs-core/page-tree"
import { ArrowLeft, ArrowRight, SquarePen } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Lang } from "@/lib/i18n"
import { REPOSITORY } from "@/lib/site"
import { source } from "@/lib/source"
import { wordsFor } from "@/lib/words"
import { components } from "./mdx"
import { Toc } from "./shell/toc"

const NAME = "Open Intelligent UI"

export function paramsFor(lang: Lang) {
  return source
    .generateParams()
    .filter((params) => params.lang === lang)
    .map((params) => ({ slug: params.slug }))
}

export function metadataFor(lang: Lang, slug: string[] | undefined): Metadata {
  const page = source.getPage(slug, lang)
  if (!page) return {}
  return {
    title: page.slugs.length ? `${page.data.title} · ${NAME}` : NAME,
    description: page.data.description,
  }
}

function Step(props: { href?: string; label: string; back?: boolean }) {
  const Icon = props.back ? ArrowLeft : ArrowRight
  if (!props.href) {
    return (
      <span className="docs-pill" data-icon aria-disabled="true">
        <Icon aria-hidden="true" />
      </span>
    )
  }
  return (
    <Link href={props.href} className="docs-pill" data-icon data-strong aria-label={props.label} title={props.label}>
      <Icon aria-hidden="true" />
    </Link>
  )
}

/** One page: its title, what it says, the pages either side, and its headings. */
export function DocPage(props: { lang: Lang; slug: string[] | undefined }) {
  const page = source.getPage(props.slug, props.lang)
  if (!page) notFound()
  const words = wordsFor(props.lang)
  const { previous, next } = findNeighbour(source.getPageTree(props.lang), page.url)
  const Body = page.data.body

  return (
    <div className="mx-auto flex w-full max-w-[1240px] gap-10 px-5 sm:px-8 lg:px-12">
      <article className="min-w-0 flex-1 pt-8 pb-24 lg:pt-14">
        <div className="mx-auto max-w-(--docs-main-width)">
          <header className="mb-9 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-[28px] leading-9 font-semibold tracking-tight text-foreground">
                {page.data.title}
              </h1>
              {page.data.description ? (
                <p className="mt-2.5 max-w-[60ch] text-base leading-7 text-pretty text-(--docs-fg-muted)">
                  {page.data.description}
                </p>
              ) : null}
            </div>
            <div className="mt-0.5 hidden shrink-0 items-center gap-1.5 sm:flex">
              <Step back href={previous?.url} label={`${words.previous}: ${previous?.name}`} />
              <Step href={next?.url} label={`${words.next}: ${next?.name}`} />
            </div>
          </header>

          <div className="prose docs-prose">
            <Body components={components} />
          </div>

          <footer className="mt-16 flex flex-col gap-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {previous ? (
                <Link href={previous.url} className="docs-card">
                  <span className="docs-card-text flex items-center gap-1.5">
                    <ArrowLeft className="size-3.5" aria-hidden="true" />
                    {words.previous}
                  </span>
                  <span className="docs-card-title">{previous.name}</span>
                </Link>
              ) : (
                <span />
              )}
              {next ? (
                <Link href={next.url} className="docs-card items-end text-end">
                  <span className="docs-card-text flex items-center gap-1.5">
                    {words.next}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="docs-card-title">{next.name}</span>
                </Link>
              ) : null}
            </div>
            <a
              href={`${REPOSITORY}/edit/main/apps/docs/content/docs/${page.path}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 self-start text-[13px] text-(--docs-fg-subtle) hover:text-foreground"
            >
              <SquarePen className="size-3.5" aria-hidden="true" />
              {words.edit}
            </a>
          </footer>
        </div>
      </article>

      <aside className="sticky top-0 hidden h-dvh w-(--docs-toc-width) shrink-0 flex-col pt-[4.75rem] pb-8 toc:flex">
        <Toc items={page.data.toc} label={words.contents} />
      </aside>
    </div>
  )
}
