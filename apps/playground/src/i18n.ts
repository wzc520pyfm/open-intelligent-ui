export type Locale = "en" | "zh"

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "en", label: "EN" },
  { id: "zh", label: "中文" },
]

const LOCALE_KEY = "oiui.locale"

export function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY)
    if (stored === "en" || stored === "zh") return stored
  } catch {
    /* ignore */
  }
  // Playground chrome defaults to English; users switch to 中文 explicitly.
  return "en"
}

export function writeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    /* ignore */
  }
}

export interface DemoCopy {
  title: string
  caption: string
  prompt: string
}

export interface Copy {
  design: string
  charts: string
  motion: string
  width: string
  phone: string
  chat: string
  wide: string
  switchToLight: string
  switchToDark: string
  inspect: string
  tagline: string
  intro: string
  renderer: string
  rendererHint: string
  rendererFailed: string
  retry: string
  docs: string
  modelSettings: string
  examples: string
  agentAsked: string
  askYourself: string
  live: string
  connectModel: string
  liveCaption: string
  writing: string
  thinking: string
  done: string
  speed: string
  slow: string
  normal: string
  fast: string
  instant: string
  replay: string
  provider: string
  endpoint: string
  model: string
  key: string
  keyPlaceholder: string
  ticketTools: string
  emptyTitle: string
  emptyBody: (design: string) => string
  suggest: string[]
  askInterface: string
  replyAgent: string
  message: string
  stop: string
  send: string
  markup: string
  state: string
  events: string
  prompt: string
  markupHint: string
  stateHint: string
  resetState: string
  eventsHint: string
  eventsEmpty: string
  promptHint: (design: string, tokens: number) => string
  connectNote: string
  demoNote: string
  providerOpenAI: string
  providerAnthropic: string
  providerDeepSeek: string
  providerCustom: string
  demos: Record<string, DemoCopy>
}

const en: Copy = {
  design: "Design",
  charts: "Charts",
  motion: "Motion",
  width: "Width",
  phone: "Phone",
  chat: "Chat",
  wide: "Wide",
  switchToLight: "Switch to light",
  switchToDark: "Switch to dark",
  inspect: "Inspect",
  tagline: "Agents answer with interfaces",
  intro:
    "A model writes a reply as markup. It renders live on UI SDK components, in your DESIGN.md, with motion that means something.",
  renderer: "Renderer",
  rendererHint: "The same reply, drawn by another framework's renderer.",
  rendererFailed: "This renderer could not be loaded.",
  retry: "Try again",
  docs: "Docs",
  modelSettings: "Model settings",
  examples: "Examples",
  agentAsked: "An agent was asked",
  askYourself: "Or ask one yourself",
  live: "Live",
  connectModel: "Connect a model",
  liveCaption: "OpenAI, Anthropic, DeepSeek, or any compatible endpoint. Your key stays in this tab.",
  writing: "Writing…",
  thinking: "Thinking…",
  done: "Done",
  speed: "Speed",
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
  instant: "Instant",
  replay: "Replay",
  provider: "Provider",
  endpoint: "Endpoint",
  model: "Model",
  key: "Key",
  keyPlaceholder: "kept in this tab only",
  ticketTools: "Ticket tools",
  emptyTitle: "Ask for anything you would rather see than read.",
  emptyBody: (design) =>
    `The model gets the language, the UI SDK behaviors, the ${design} design and the motion rules as its system prompt, and answers in markup that renders as it streams.`,
  suggest: [
    "Compare a 15-year and a 30-year mortgage on a $400k home",
    "Help me plan a dinner party for 8",
    "Give me a place to work the support queue",
  ],
  askInterface: "Ask for an interface",
  replyAgent: "Reply to the agent",
  message: "Message",
  stop: "Stop",
  send: "Send",
  markup: "Markup",
  state: "State",
  events: "Events",
  prompt: "Prompt",
  markupHint: "What the agent wrote. Edit it and the interface follows; its state is kept.",
  stateHint: "What the interface remembers. It travels with every message sent back to the agent.",
  resetState: "Reset state",
  eventsHint: "Messages to the agent, tool calls and warnings, newest first.",
  eventsEmpty: "Nothing yet. Use the interface.",
  promptHint: (design, tokens) =>
    `The system prompt built from the language guide, UI SDK, the ${design} DESIGN.md and the motion rules. About ${tokens}k tokens.`,
  connectNote: "Connect a model above to get a reply.",
  demoNote:
    "In a live session this message goes back to the agent, together with the interface's state, and the agent answers with the next interface.",
  providerOpenAI: "OpenAI",
  providerAnthropic: "Anthropic",
  providerDeepSeek: "DeepSeek",
  providerCustom: "Custom",
  demos: {
    charts: {
      title: "Charts",
      caption: "Release health: a headline metric with bar, donut and area charts",
      prompt: "How healthy is the harbor CLI release train?",
    },
    cards: {
      title: "Cards",
      caption: "Workshop posters you can scroll, tip chips, then a featured match",
      prompt: "What weekend workshops are open near Gion?",
    },
    budgets: {
      title: "Dashboards",
      caption: "Sprint load: KPIs, commit dots, squad capacity and blockers",
      prompt: "Show me sprint 14 load across the squads.",
    },
    forms: {
      title: "Forms",
      caption: "Focus-room booking with tags, steppers, amenity chips and a duration slider",
      prompt: "Help me book a focus room on Thursday afternoon.",
    },
    gears: {
      title: "Explain",
      caption: "A live diagram drawn in SVG, driven by sliders",
      prompt: "How do bike gears actually work?",
    },
    invest: {
      title: "Calculate",
      caption: "Assumptions become controls; the answer is derived",
      prompt: "If I put $500 a month into an index fund, what will I have in 20 years?",
    },
    trip: {
      title: "Decide",
      caption: "Options re-rank as priorities change, then hand back to the agent",
      prompt: "Kyoto, Lisbon or Mexico City for a week in April?",
    },
    dashboard: {
      title: "Dashboard",
      caption: "Stats, charts and a table that filter each other",
      prompt: "How did sales do in Q4?",
    },
    workbench: {
      title: "Workbench",
      caption: "Reads and writes a ticket system through tools, without the agent in the loop",
      prompt: "Give me a place to work the support queue.",
    },
    board: {
      title: "Invent",
      caption: "A component nobody predefined: a sprint board with cards that glide",
      prompt: "Show sprint 14 as a board I can move cards on.",
    },
    claim: {
      title: "Your components",
      caption: "Components a product registered, used beside ones the model invents",
      prompt: "Mei's Tokyo expense claim is waiting for me. Should I approve it?",
    },
  },
}

const zh: Copy = {
  design: "设计",
  charts: "图表",
  motion: "动效",
  width: "宽度",
  phone: "手机",
  chat: "对话",
  wide: "宽屏",
  switchToLight: "切换到浅色",
  switchToDark: "切换到深色",
  inspect: "检查",
  tagline: "让智能体用界面作答",
  intro: "模型把回复写成标记，由 UI SDK 组件实时渲染，遵循你的 DESIGN.md，动效各有其义。",
  renderer: "渲染器",
  rendererHint: "同一条回复，换一个框架的渲染器来画。",
  rendererFailed: "这个渲染器没能加载。",
  retry: "重试",
  docs: "文档",
  modelSettings: "模型设置",
  examples: "示例",
  agentAsked: "有人问智能体",
  askYourself: "或者自己问一句",
  live: "实时",
  connectModel: "连接模型",
  liveCaption: "OpenAI、Anthropic、DeepSeek，或任意兼容端点。密钥只留在本标签页。",
  writing: "正在写入…",
  thinking: "正在思考…",
  done: "完成",
  speed: "速度",
  slow: "慢",
  normal: "正常",
  fast: "快",
  instant: "瞬间",
  replay: "重播",
  provider: "提供商",
  endpoint: "端点",
  model: "模型",
  key: "密钥",
  keyPlaceholder: "只保存在本标签页",
  ticketTools: "工单工具",
  emptyTitle: "问任何你更想看到、而不是读到的东西。",
  emptyBody: (design) =>
    `模型会拿到语言说明、UI SDK 行为、${design} 设计与动效规则作为系统提示词，并以边流边渲染的标记作答。`,
  suggest: ["比较一套 40 万美元房子的 15 年和 30 年房贷", "帮我安排一顿 8 人的晚餐", "给我一个处理支持工单的工作台"],
  askInterface: "描述你想要的界面",
  replyAgent: "回复智能体",
  message: "消息",
  stop: "停止",
  send: "发送",
  markup: "标记",
  state: "状态",
  events: "事件",
  prompt: "提示词",
  markupHint: "智能体写下的内容。改这里，界面跟着变；状态会保留。",
  stateHint: "界面记住的东西。每次交还给智能体的消息都会带上它。",
  resetState: "重置状态",
  eventsHint: "发给智能体的消息、工具调用和警告，最新的在前。",
  eventsEmpty: "还没有。先操作一下界面。",
  promptHint: (design, tokens) =>
    `由语言指南、UI SDK、${design} DESIGN.md 和动效规则拼成的系统提示词。大约 ${tokens}k token。`,
  connectNote: "先在上方连接一个模型，才能得到回复。",
  demoNote: "在实时会话里，这条消息会连同界面状态一起交还给智能体，由它回答下一个界面。",
  providerOpenAI: "OpenAI",
  providerAnthropic: "Anthropic",
  providerDeepSeek: "DeepSeek",
  providerCustom: "自定义",
  demos: {
    charts: {
      title: "图表",
      caption: "发布健康度：主指标搭配柱状、环图与面积图",
      prompt: "harbor CLI 的发版节奏健康吗？",
    },
    cards: {
      title: "卡片",
      caption: "可横滑的工作坊海报、提示条，再跟一张精选推荐",
      prompt: "祗园附近周末有哪些开放的工作坊？",
    },
    budgets: {
      title: "仪表盘",
      caption: "迭代负载：KPI、提交点阵、小队容量与阻塞",
      prompt: "给我看第 14 迭代各小队的负载。",
    },
    forms: {
      title: "表单",
      caption: "专注室预订：标签、步进器、设施选项与时长滑块",
      prompt: "帮我预订周四下午的专注室。",
    },
    gears: {
      title: "解释",
      caption: "滑块驱动的 SVG 示意图",
      prompt: "自行车的齿轮到底是怎么工作的？",
    },
    invest: {
      title: "计算",
      caption: "假设变成控件，答案由它们推导",
      prompt: "如果我每月往指数基金存 500 美元，20 年后会有多少？",
    },
    trip: {
      title: "决定",
      caption: "优先级一变，选项重排，再交还给智能体",
      prompt: "四月去京都、里斯本还是墨西哥城玩一周？",
    },
    dashboard: {
      title: "看板",
      caption: "指标、图表和表格互相筛选",
      prompt: "第四季度销售怎么样？",
    },
    workbench: {
      title: "工作台",
      caption: "通过工具读写工单系统，智能体不在回路里",
      prompt: "给我一个处理支持队列的地方。",
    },
    board: {
      title: "发明",
      caption: "没人预定义过的组件：卡片会滑动的冲刺看板",
      prompt: "把 sprint 14 做成一个我能挪卡片的看板。",
    },
    claim: {
      title: "你的组件",
      caption: "产品注册的固定组件，和模型现场创作的组件一起用",
      prompt: "Mei 的东京报销单在等我审批，我该批吗？",
    },
  },
}

export const COPY: Record<Locale, Copy> = { en, zh }

export function t(locale: Locale): Copy {
  return COPY[locale]
}
