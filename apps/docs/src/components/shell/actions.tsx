"use client"

import { Button, Drawer, Dropdown, Label } from "@heroui/react"
import { useSearchContext } from "fumadocs-ui/contexts/search"
import { useTheme } from "fumadocs-ui/provider/base"
import { ChevronDown, Menu, Moon, Search, Sun } from "lucide-react"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"
import { GitHubMark } from "@/lib/icons"
import type { Lang } from "@/lib/i18n"
import { BASE, REPOSITORY } from "@/lib/site"
import { LANGUAGES, wordsFor } from "@/lib/words"

function SearchButton(props: { lang: Lang; wide?: boolean }) {
  const words = wordsFor(props.lang)
  const { setOpenSearch } = useSearchContext()
  if (!props.wide) {
    return (
      <button type="button" className="docs-pill" data-icon aria-label={words.searchKeys} onClick={() => setOpenSearch(true)}>
        <Search aria-hidden="true" />
      </button>
    )
  }
  return (
    <button type="button" className="docs-pill pe-2" aria-label={words.searchKeys} onClick={() => setOpenSearch(true)}>
      <Search aria-hidden="true" />
      <span>{words.search}</span>
      <kbd className="ms-1 rounded-md bg-background px-1.5 py-0.5 font-sans text-[10.5px] text-(--docs-fg-subtle)">
        ⌘K
      </kbd>
    </button>
  )
}

function ThemeButton(props: { lang: Lang }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button
      type="button"
      className="docs-pill"
      data-icon
      aria-label={wordsFor(props.lang).theme}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Both are in the page, so what the server drew is right before the theme is known. */}
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="dark:hidden" aria-hidden="true" />
    </button>
  )
}

/** The address of the page being read, in another language. */
function inLanguage(pathname: string, to: Lang): string {
  const path = pathname.replace(/^\/zh(?=\/|$)/, "") || "/"
  return `${BASE}${to === "zh" ? "/zh" : ""}${path}`
}

function LanguageButton(props: { lang: Lang }) {
  const pathname = usePathname()
  const words = wordsFor(props.lang)
  const current = LANGUAGES.find((language) => language.locale === props.lang)
  return (
    <Dropdown>
      <Button variant="tertiary" className="docs-pill pe-2.5" aria-label={words.languages}>
        <span>{current?.short}</span>
        <ChevronDown className="!size-3 opacity-70" aria-hidden="true" />
      </Button>
      <Dropdown.Popover placement="bottom end" className="min-w-36">
        <Dropdown.Menu
          aria-label={words.languages}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([props.lang])}
          onAction={(key) => {
            // Each language has its own document, so this is a page load.
            if (key !== props.lang) window.location.assign(inLanguage(pathname, key as Lang))
          }}
        >
          {LANGUAGES.map((language) => (
            <Dropdown.Item key={language.locale} id={language.locale} textValue={language.name}>
              <Label>{language.name}</Label>
              <Dropdown.ItemIndicator />
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

function GitHubButton() {
  return (
    <a className="docs-pill" data-icon href={REPOSITORY} target="_blank" rel="noreferrer" aria-label="GitHub">
      <GitHubMark />
    </a>
  )
}

/** The controls that float at the top right of a wide window. */
export function Actions(props: { lang: Lang }) {
  return (
    <div className="flex items-center gap-2">
      <SearchButton lang={props.lang} wide />
      <GitHubButton />
      <LanguageButton lang={props.lang} />
      <ThemeButton lang={props.lang} />
    </div>
  )
}

/** A narrow window: a bar with the name, and the pages in a drawer. */
export function MobileBar(props: { lang: Lang; brand: ReactNode; pages: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const words = wordsFor(props.lang)
  // Going to another page closes the drawer.
  useEffect(() => setOpen(false), [pathname])
  return (
    <>
      <button type="button" className="docs-pill" data-icon aria-label={words.menu} onClick={() => setOpen(true)}>
        <Menu aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">{props.brand}</div>
      <SearchButton lang={props.lang} />
      <ThemeButton lang={props.lang} />
      <Drawer.Backdrop isOpen={open} onOpenChange={setOpen}>
        <Drawer.Content placement="left">
          <Drawer.Dialog aria-label={words.menu} className="w-[19rem] max-w-[86vw] p-0">
            <Drawer.Body className="docs-scroll flex flex-col gap-5 overflow-y-auto p-4">
              <div className="flex items-center gap-2">
                <LanguageButton lang={props.lang} />
                <GitHubButton />
              </div>
              {props.pages}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  )
}
