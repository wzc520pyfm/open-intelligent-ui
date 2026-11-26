"use client"

import type { I18nProviderProps } from "fumadocs-ui/contexts/i18n"
import { RootProvider } from "fumadocs-ui/provider/next"
import type { ReactNode } from "react"
import { BASE } from "@/lib/site"

export function Providers(props: { i18n: Omit<I18nProviderProps, "children">; children: ReactNode }) {
  return (
    <RootProvider
      i18n={props.i18n}
      // The index is one file next to the pages; the search runs in the browser.
      search={{ options: { type: "static", api: `${BASE}/search.json` } }}
      theme={{ attribute: "class", defaultTheme: "system", enableSystem: true, disableTransitionOnChange: true }}
    >
      {props.children}
    </RootProvider>
  )
}
