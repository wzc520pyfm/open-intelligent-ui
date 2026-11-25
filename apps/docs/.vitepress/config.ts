import { readFileSync } from "node:fs"
import { defineConfig, type DefaultTheme } from "vitepress"

const core = JSON.parse(
  readFileSync(new URL("../../../packages/core/package.json", import.meta.url), "utf8")
) as { version: string }

const REPO = "https://github.com/wzc520pyfm/open-intelligent-ui"

interface Words {
  start: string
  build: string
  yours: string
  trust: string
  reference: string
  pages: Record<string, string>
  playground: string
}

const en: Words = {
  start: "Start",
  build: "Write interfaces",
  yours: "Make it yours",
  trust: "Ship it",
  reference: "Reference",
  playground: "Playground",
  pages: {
    intro: "What it is",
    start: "Getting started",
    markup: "The markup",
    data: "Data, tools and turns",
    design: "Design",
    components: "Your components",
    charts: "Charts",
    motion: "Motion",
    correctness: "Correct output",
    safety: "Safety",
    api: "API",
    language: "Language reference",
  },
}

const zh: Words = {
  start: "开始",
  build: "写界面",
  yours: "换成自己的",
  trust: "上线",
  reference: "参考",
  playground: "演示站",
  pages: {
    intro: "这是什么",
    start: "快速开始",
    markup: "标记语言",
    data: "数据、工具与回合",
    design: "设计",
    components: "接入自己的组件",
    charts: "图表",
    motion: "动效",
    correctness: "保证输出正确",
    safety: "安全",
    api: "API",
    language: "语言参考",
  },
}

function sidebar(words: Words, prefix: string): DefaultTheme.Sidebar {
  const link = (page: string) => ({ text: words.pages[page] as string, link: `${prefix}/guide/${page}` })
  return [
    { text: words.start, items: [link("intro"), link("start")] },
    { text: words.build, items: [link("markup"), link("data")] },
    { text: words.yours, items: [link("design"), link("components"), link("charts"), link("motion")] },
    { text: words.trust, items: [link("correctness"), link("safety")] },
    {
      text: words.reference,
      items: [
        { text: words.pages.api as string, link: `${prefix}/reference/api` },
        { text: words.pages.language as string, link: `${prefix}/reference/language` },
      ],
    },
  ]
}

function nav(words: Words, prefix: string): DefaultTheme.NavItem[] {
  return [
    { text: words.pages.start as string, link: `${prefix}/guide/start`, activeMatch: `${prefix}/guide/` },
    { text: words.reference, link: `${prefix}/reference/api`, activeMatch: `${prefix}/reference/` },
    { text: `v${core.version}`, link: `${REPO}/releases` },
  ]
}

export default defineConfig({
  title: "Open Intelligent UI",
  description:
    "Let a model write the interface: markup that streams into a live, stateful surface built on UI SDK, styled by a DESIGN.md.",
  // The site is served from the playground's deployment, under /docs.
  base: "/docs/",
  outDir: "../playground/dist/docs",
  cleanUrls: false,
  lastUpdated: false,
  head: [["link", { rel: "icon", href: "/favicon.svg" }]],
  markdown: {
    // IUI markup is closest to Svelte's: tags, `{expressions}`, `{#if}` blocks, `on:` and `bind:`.
    languageAlias: { iui: "svelte" },
    config(md) {
      const fence = md.renderer.rules.fence
      if (!fence) return
      md.renderer.rules.fence = (tokens, index, options, env, self) => {
        const token = tokens[index]
        if (!token) return ""
        const [language, ...flags] = token.info.trim().split(/\s+/)
        if (language !== "iui" || !flags.includes("live")) return fence(tokens, index, options, env, self)
        // ```iui live [product] [designs] [tall]: drawn above its source.
        token.info = "iui"
        const code = fence(tokens, index, options, env, self)
        const attrs = flags
          .filter((flag) => flag !== "live")
          .map((flag) => ` ${flag.replace(/[^a-z-]/g, "")}`)
          .join("")
        return `<LiveExample source="${encodeURIComponent(token.content)}"${attrs}>${code}</LiveExample>`
      }
    },
  },
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: { nav: nav(en, ""), sidebar: sidebar(en, "") },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      description: "让模型来写界面：流式到达的标记变成有状态、可交互的界面，行为来自 UI SDK，外观来自 DESIGN.md。",
      themeConfig: {
        nav: nav(zh, "/zh"),
        sidebar: sidebar(zh, "/zh"),
        outline: { label: "本页内容" },
        docFooter: { prev: "上一页", next: "下一页" },
        darkModeSwitchLabel: "外观",
        sidebarMenuLabel: "目录",
        returnToTopLabel: "回到顶部",
        langMenuLabel: "语言",
      },
    },
  },
  themeConfig: {
    socialLinks: [{ icon: "github", link: REPO }],
    search: { provider: "local" },
    outline: [2, 3],
  },
  vite: {
    // The renderer's stylesheet uses nesting, cascade layers and light-dark(); leave them as written.
    build: { cssTarget: ["chrome125", "safari18", "firefox128"], chunkSizeWarningLimit: 4000 },
    server: { port: 5180, host: "127.0.0.1" },
  },
})
