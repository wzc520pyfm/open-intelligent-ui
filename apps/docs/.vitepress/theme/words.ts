export interface Words {
  preview: string
  replay: string
  reset: string
  design: string
  sent: string
  called: string
  warned: string
  loading: string
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
  preview: "Live",
  replay: "Stream it again",
  reset: "Reset",
  design: "Design",
  sent: "sent to the model",
  called: "tool",
  warned: "warning",
  loading: "Loading the renderer…",
  clean: "Nothing wrong with this markup.",
  found: (errors, warnings) =>
    [errors ? `${errors} error${errors === 1 ? "" : "s"}` : "", warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : ""]
      .filter(Boolean)
      .join(", "),
  line: (line) => `Line ${line}`,
  repair: "What repairMessage() would send back to the model",
  noRepair: "No errors, so there is nothing to send back.",
  samples: "Try a mistake",
  sample: (name) => name,
  markup: "Markup to check",
}

const zh: Words = {
  preview: "实时渲染",
  replay: "重新流式播放",
  reset: "重置",
  design: "设计",
  sent: "发回给模型",
  called: "工具",
  warned: "警告",
  loading: "正在加载渲染器…",
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

const SAMPLES_ZH: Record<string, string> = {
  "JSX habits": "JSX 的习惯写法",
  "Another library's tags": "别的库的标签",
  "Names and tools": "名字和工具",
  "Cut short": "被截断",
  "A correct reply": "一份正确的回复",
}

export function wordsFor(lang: string): Words {
  return lang.startsWith("zh") ? zh : en
}
