import "@fontsource-variable/inter"
import "./global.css"
import type { Metadata } from "next"
import Link from "next/link"
import { Logo } from "@/lib/icons"
import { LANGUAGES, wordsFor } from "@/lib/words"

export const metadata: Metadata = {
  title: "404 · Open Intelligent UI",
  icons: { icon: "/favicon.svg" },
}

/** One file answers for every address that has no page, so it speaks both languages. */
export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="grid min-h-dvh place-items-center p-6">
        {/* The theme a reader chose is kept by the pages; this file has no provider, so it reads it itself. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
        <main className="flex max-w-md flex-col items-center gap-6 text-center">
          <Logo className="size-10 text-accent" />
          <p className="text-sm font-medium text-(--docs-fg-subtle) tabular-nums">404</p>
          {LANGUAGES.map((language) => {
            const words = wordsFor(language.locale)
            return (
              <section key={language.locale} lang={language.tag} className="flex flex-col items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{words.notFound}</h1>
                <p className="text-sm leading-6 text-(--docs-fg-muted)">{words.notFoundHint}</p>
                <Link href={language.locale === "zh" ? "/zh" : "/"} className="docs-pill mt-2" data-strong>
                  {words.home}
                </Link>
              </section>
            )
          })}
        </main>
      </body>
    </html>
  )
}
