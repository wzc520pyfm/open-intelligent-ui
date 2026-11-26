import "@fontsource-variable/inter"
import "@fontsource-variable/geist-mono"
import "../../app/global.css"
import "@open-intelligent-ui/react/styles.css"
import { defineI18nUI } from "fumadocs-ui/i18n"
import type { ReactNode } from "react"
import { i18n, type Lang } from "@/lib/i18n"
import { source } from "@/lib/source"
import { LANGUAGES } from "@/lib/words"
import { Actions, MobileBar } from "./actions"
import { Providers } from "./providers"
import { Brand, Pages } from "./sidebar"

const ui = defineI18nUI(i18n, {
  en: { displayName: "English" },
  zh: {
    displayName: "简体中文",
    "Search(search dialog)": "搜索文档",
    "Search(search trigger)": "搜索",
    "No results found(search dialog)": "没有找到结果",
    "Search failed(search dialog)": "搜索失败",
    "Search failed, showing results for {query}(search dialog)": "搜索失败，这是 {query} 的结果",
    "Close Search(search dialog)(aria-label)": "关闭搜索",
    "Copy Text(code block)(aria-label)": "复制",
    "Copied Text(code block)(aria-label)": "已复制",
    "Copy Anchor Link(heading anchor)(aria-label)": "复制本节链接",
    "Copied Anchor Link(heading anchor)(aria-label)": "已复制链接",
  },
})

/** The document of one language: the sidebar, the floating controls, and the page. */
export function Root(props: { lang: Lang; children: ReactNode }) {
  const { lang } = props
  const tree = source.getPageTree(lang)
  const tag = LANGUAGES.find((language) => language.locale === lang)?.tag ?? lang
  const pages = <Pages tree={tree} lang={lang} />
  return (
    <html lang={tag} suppressHydrationWarning>
      <body className="min-h-dvh">
        <Providers i18n={ui.provider(lang)}>
          <aside className="fixed inset-y-0 left-0 z-20 hidden w-(--docs-sidebar-width) flex-col lg:flex">
            <div className="flex h-16 shrink-0 items-center px-5">
              <Brand lang={lang} />
            </div>
            <div className="docs-scroll min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-8">{pages}</div>
          </aside>

          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-background/85 px-4 backdrop-blur-md lg:hidden">
            <MobileBar lang={lang} brand={<Brand lang={lang} />} pages={pages} />
          </header>

          <div
            aria-hidden="true"
            className="docs-topfade pointer-events-none fixed top-0 right-0 left-(--docs-sidebar-width) z-20 hidden h-16 lg:block"
          />
          <div className="fixed top-4 right-5 z-30 hidden lg:block">
            <Actions lang={lang} />
          </div>

          <div className="lg:ps-(--docs-sidebar-width)">{props.children}</div>
        </Providers>
      </body>
    </html>
  )
}
