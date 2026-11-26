import type { Lang } from "./i18n"

/** Everything the site says outside its pages, in one language. */
export interface Words {
  language: string
  description: string
  search: string
  searchKeys: string
  menu: string
  theme: string
  languages: string
  github: string
  playground: string
  links: string
  releases: string
  contents: string
  previous: string
  next: string
  edit: string
  notFound: string
  notFoundHint: string
  home: string
  preview: string
  replay: string
  reset: string
  design: string
  sent: string
  called: string
  warned: string
  loading: string
  viewCode: string
  hideCode: string
  clean: string
  found: (errors: number, warnings: number) => string
  line: (line: number) => string
  repair: string
  noRepair: string
  samples: string
  /** Names of the samples in the checker demo, by their English name. */
  sample: (name: string) => string
  markup: string
}

const en: Words = {
  language: "English",
  description:
    "Let a model write the interface: markup that streams into a live, stateful surface built on UI SDK, styled by a DESIGN.md.",
  search: "Search",
  searchKeys: "Search the documentation",
  menu: "Menu",
  theme: "Switch between light and dark",
  languages: "Language",
  github: "GitHub",
  playground: "Playground",
  links: "More",
  releases: "Releases",
  contents: "On this page",
  previous: "Previous",
  next: "Next",
  edit: "Edit this page on GitHub",
  notFound: "This page doesn't exist",
  notFoundHint: "The address may be wrong, or the page may have moved.",
  home: "Back to the overview",
  preview: "Live",
  replay: "Stream it again",
  reset: "Reset",
  design: "Design",
  sent: "sent to the model",
  called: "tool",
  warned: "warning",
  loading: "Loading the renderer…",
  viewCode: "View code",
  hideCode: "Hide code",
  clean: "Nothing wrong with this markup.",
  found: (errors, warnings) =>
    [
      errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
      warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  line: (line) => `Line ${line}`,
  repair: "What repairMessage() would send back to the model",
  noRepair: "No errors, so there is nothing to send back.",
  samples: "Try a mistake",
  sample: (name) => name,
  markup: "Markup to check",
}

const SAMPLES_ZH: Record<string, string> = {
  "JSX habits": "JSX 的习惯写法",
  "Another library's tags": "别的库的标签",
  "Names and tools": "名字和工具",
  "Cut short": "被截断",
  "A correct reply": "一份正确的回复",
}

const zh: Words = {
  language: "简体中文",
  description: "让模型来写界面：流式到达的标记变成有状态的实时界面，行为来自 UI SDK，外观来自 DESIGN.md。",
  search: "搜索",
  searchKeys: "搜索文档",
  menu: "菜单",
  theme: "切换浅色和深色",
  languages: "语言",
  github: "GitHub",
  playground: "演示站",
  links: "更多",
  releases: "版本记录",
  contents: "本页内容",
  previous: "上一篇",
  next: "下一篇",
  edit: "在 GitHub 上编辑此页",
  notFound: "没有这个页面",
  notFoundHint: "地址可能写错了，或者页面已经挪走。",
  home: "回到概览",
  preview: "实时渲染",
  replay: "重新流式播放",
  reset: "重置",
  design: "设计",
  sent: "发回给模型",
  called: "工具",
  warned: "警告",
  loading: "正在加载渲染器…",
  viewCode: "查看代码",
  hideCode: "收起代码",
  clean: "这段标记没有问题。",
  found: (errors, warnings) =>
    [errors ? `${errors} 个错误` : "", warnings ? `${warnings} 个警告` : ""].filter(Boolean).join("，"),
  line: (line) => `第 ${line} 行`,
  repair: "repairMessage() 会发回给模型的内容",
  noRepair: "没有错误，不需要发回。",
  samples: "试一个常见错误",
  sample: (name) => SAMPLES_ZH[name] ?? name,
  markup: "要检查的标记",
}

export function wordsFor(lang: string | undefined): Words {
  return lang?.startsWith("zh") ? zh : en
}

export const LANGUAGES: { locale: Lang; name: string; short: string; tag: string }[] = [
  { locale: "en", name: en.language, short: "EN", tag: "en" },
  { locale: "zh", name: zh.language, short: "中文", tag: "zh-CN" },
]
