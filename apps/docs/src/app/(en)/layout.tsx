import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Root } from "@/components/shell/root"
import { wordsFor } from "@/lib/words"

export const metadata: Metadata = {
  title: "Open Intelligent UI",
  description: wordsFor("en").description,
  // The playground this site is served under has the icon.
  icons: { icon: "/favicon.svg" },
}

export default function Layout(props: { children: ReactNode }) {
  return <Root lang="en">{props.children}</Root>
}
