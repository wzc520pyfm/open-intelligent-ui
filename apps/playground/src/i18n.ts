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
  /** The documentation, served from this site. */
  docsUrl: string
  modelSettings: string
  examples: string
  agentAsked: string
  askYourself: string
  live: string
  connectModel: string
  /** The Live entry in the sidebar. */
  liveTitle: string
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
  /** The empty Live session: a design, then an interface, kept in the browser. */
  emptyLive: string
  suggest: string[]
  laneLabel: string
  laneDesign: string
  laneInterface: string
  askDesign: string
  designSuggestLabel: string
  interfaceSuggestLabel: string
  designSuggest: string[]
  screenshot: string
  attachShot: string
  removeShot: string
  shotHint: string
  shotType: string
  shotSize: string
  shotRead: string
  shotDesignAsk: string
  shotInterfaceAsk: string
  share: string
  shareCopied: string
  shareDesignOnly: string
  shareTooBig: string
  shareUnread: string
  exportStudio: string
  importStudio: string
  imported: string
  importFailed: string
  newChat: string
  /** The round button that opens share, export, import and a new chat. */
  studioMenu: string
  designApplied: (name: string) => string
  designRejected: string
  designFixing: (round: number, of: number) => string
  designPartial: string
  designLeft: string
  designHint: string
  openedShare: string
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
  /** The line under the markup once it has been checked. */
  checkClean: string
  checkFound: (errors: number, warnings: number) => string
  line: (line: number) => string
  /** Notes in the thread while a live reply is being fixed. */
  fixing: (errors: number, round: number, of: number) => string
  fixed: (rounds: number) => string
  notFixed: (errors: number) => string
  promptHint: (design: string, tokens: number) => string
  connectNote: string
  demoNote: string
  /** Shown under a finished demo surface to steer people into LIVE. */
  liveGuideTitlePrefix: string
  liveGuideTitleAccent: string
  liveGuideTitleSuffix: string
  liveGuideBody: string
  liveGuideAction: string
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
  docsUrl: "/docs/",
  modelSettings: "Model settings",
  examples: "Examples",
  agentAsked: "An agent was asked",
  askYourself: "Or ask one yourself",
  live: "Live",
  connectModel: "Connect a model",
  liveTitle: "A design, then an interface",
  liveCaption: "From a prompt or a screenshot. Saved in this browser. Share a link or a file.",
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
  emptyLive:
    "Describe a look, or paste a screenshot, and the model writes a DESIGN.md that this page draws. Then ask for an interface in that design. The key stays in this tab. The design and the conversation stay in this browser.",
  suggest: [
    "Compare a 15-year and a 30-year mortgage on a $400k home",
    "Help me plan a dinner party for 8",
    "Give me a place to work the support queue",
  ],
  laneLabel: "What this message does",
  laneDesign: "Design",
  laneInterface: "Interface",
  askDesign: "Describe a design, or paste a screenshot",
  designSuggestLabel: "Write a design",
  interfaceSuggestLabel: "Ask for an interface",
  designSuggest: [
    "A calm editorial design: warm paper, serif headlines, one terracotta accent",
    "A dense operations console: near-black, mono labels, one lime signal",
    "Soft and round, like a consumer finance app, with a single indigo accent",
  ],
  screenshot: "Screenshot",
  attachShot: "Add a screenshot",
  removeShot: "Remove screenshot",
  shotHint:
    "Sent with the next message to the model you connected. It is not saved in the link or on this device. The model has to be able to see images.",
  shotType: "Use a PNG, JPEG, WebP, or GIF.",
  shotSize: "That image is too large. Try a smaller screenshot.",
  shotRead: "That image could not be read.",
  shotDesignAsk: "Write a DESIGN.md that matches this screenshot.",
  shotInterfaceAsk: "Make an interface that matches this screenshot.",
  share: "Share",
  shareCopied: "Link copied. It opens this design in Live.",
  shareDesignOnly:
    "Link copied. The interface was too large for a URL, so the link has the design. Export a file to share both.",
  shareTooBig: "This is too large for a link. Export a file instead.",
  shareUnread: "This share link could not be read.",
  exportStudio: "Export",
  importStudio: "Import",
  imported: "Imported. The design is saved in this browser.",
  importFailed: "That file isn't a design or a Live export.",
  newChat: "New",
  studioMenu: "Actions",
  designApplied: (name) => `${name} is the design on this page.`,
  designRejected: "This reply isn't a usable DESIGN.md, so the design on the page stayed as it was.",
  designFixing: (round, of) =>
    `This design file has problems. Asking the model to fix it (${round} of ${of})…`,
  designPartial: "What could be read is now the design. Some of the file still needs a fix.",
  designLeft: "The design file still isn't usable, so the page kept the previous one.",
  designHint: "The DESIGN.md the model wrote. Edit it and the design follows; it stays in this browser.",
  openedShare: "Opened from a shared link. Saved in this browser.",
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
  eventsHint: "Messages to the agent, tool calls, checks and warnings, newest first.",
  eventsEmpty: "Nothing yet. Use the interface.",
  checkClean: "Checked: nothing wrong with this markup.",
  checkFound: (errors, warnings) =>
    [
      errors ? `${errors} ${errors === 1 ? "error" : "errors"}` : "",
      warnings ? `${warnings} ${warnings === 1 ? "warning" : "warnings"}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  line: (line) => `Line ${line}`,
  fixing: (errors, round, of) =>
    `The check found ${errors} ${errors === 1 ? "error" : "errors"} in this reply. Asking the model to fix ${errors === 1 ? "it" : "them"} (${round} of ${of})…`,
  fixed: (rounds) => `The model fixed its reply in ${rounds === 1 ? "one round" : `${rounds} rounds`}.`,
  notFixed: (errors) =>
    `${errors} ${errors === 1 ? "error is" : "errors are"} still in this reply after two fixes. The Markup panel lists ${errors === 1 ? "it" : "them"}.`,
  promptHint: (design, tokens) =>
    `The system prompt built from the language guide, UI SDK, the ${design} DESIGN.md and the motion rules. About ${tokens}k tokens.`,
  connectNote: "Connect a model above to get a reply.",
  demoNote:
    "In a live session this message goes back to the agent, together with the interface's state, and the agent answers with the next interface.",
  liveGuideTitlePrefix: "Try it in ",
  liveGuideTitleAccent: "Live Playground",
  liveGuideTitleSuffix: "",
  liveGuideBody: "Write a DESIGN.md from a prompt or a screenshot, then an interface in it. Saved in this browser.",
  liveGuideAction: "Open Playground",
  providerOpenAI: "OpenAI",
  providerAnthropic: "Anthropic",
  providerDeepSeek: "DeepSeek",
  providerCustom: "Custom",
  demos: {
    charts: {
      title: "Charts",
      caption: "Release health: a headline metric with bar, donut and area charts",
      prompt: "How healthy is the Open Intelligent UI release train?",
    },
    cards: {
      title: "Cards",
      caption: "Hotel posters you can scroll, tip chips, then a featured match",
      prompt: "Help me book a hotel in Paris.",
    },
    budgets: {
      title: "Dashboards",
      caption: "Engineering load: KPIs, commit dots, team capacity and blockers",
      prompt: "Show me load across the department's engineering teams.",
    },
    forms: {
      title: "Forms",
      caption: "Meeting-room booking with tags, steppers, amenity chips and a duration slider",
      prompt: "Help me book a meeting room on Thursday afternoon.",
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
  docsUrl: "/docs/zh/",
  modelSettings: "模型设置",
  examples: "示例",
  agentAsked: "有人问智能体",
  askYourself: "或者自己问一句",
  live: "实时",
  connectModel: "连接模型",
  liveTitle: "先定设计，再生成界面",
  liveCaption: "用一段话或一张截图。存在这台浏览器里，可以分享链接或文件。",
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
  emptyLive:
    "描述一种风格，或贴上一张截图，模型会写成 DESIGN.md，这个页面立刻按它来画。然后再要一个用这套设计的界面。密钥只留在本标签页。设计和对话留在这台浏览器里。",
  suggest: ["比较一套 40 万美元房子的 15 年和 30 年房贷", "帮我安排一顿 8 人的晚餐", "给我一个处理支持工单的工作台"],
  laneLabel: "这条消息做什么",
  laneDesign: "设计",
  laneInterface: "界面",
  askDesign: "描述一种设计，或贴上一张截图",
  designSuggestLabel: "写一套设计",
  interfaceSuggestLabel: "要一个界面",
  designSuggest: [
    "安静的编辑风：暖纸色、衬线标题、一个赤陶色强调",
    "密集的运维控制台：近黑底、等宽标签、一抹青柠色",
    "圆润柔软，像消费金融应用，只用一种靛蓝作强调",
  ],
  screenshot: "截图",
  attachShot: "添加截图",
  removeShot: "移除截图",
  shotHint: "会随下一条消息发给你连接的模型。不会写进分享链接，也不会存在这台设备上。模型需要能看图。",
  shotType: "请用 PNG、JPEG、WebP 或 GIF。",
  shotSize: "这张图太大了。换一张小一点的截图。",
  shotRead: "这张图没能读出来。",
  shotDesignAsk: "按这张截图写一份 DESIGN.md。",
  shotInterfaceAsk: "做一个和这张截图一样的界面。",
  share: "分享",
  shareCopied: "链接已复制。打开它会在实时里看到这套设计。",
  shareDesignOnly: "链接已复制。界面太大，放不进网址，所以链接里只有设计。要一起分享，请导出文件。",
  shareTooBig: "内容太大，放不进链接。请改为导出文件。",
  shareUnread: "这个分享链接读不出来。",
  exportStudio: "导出",
  importStudio: "导入",
  imported: "已导入。设计存在这台浏览器里。",
  importFailed: "这个文件不是设计，也不是实时的导出。",
  newChat: "新对话",
  studioMenu: "功能",
  designApplied: (name) => `${name} 已用在这个页面上。`,
  designRejected: "这条回复还不是能用的 DESIGN.md，页面上的设计没有改。",
  designFixing: (round, of) => `这份设计文件有问题，正在让模型修正（第 ${round} 次，最多 ${of} 次）…`,
  designPartial: "能读出来的部分已经用上了。文件里还有要修的地方。",
  designLeft: "设计文件还是不能用，页面保留了上一套。",
  designHint: "模型写下的 DESIGN.md。改这里，设计跟着变；它留在这台浏览器里。",
  openedShare: "从分享链接打开。已存在这台浏览器里。",
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
  eventsHint: "发给智能体的消息、工具调用、检查结果和警告，最新的在前。",
  eventsEmpty: "还没有。先操作一下界面。",
  checkClean: "已检查：这段标记没有问题。",
  checkFound: (errors, warnings) =>
    [errors ? `${errors} 个错误` : "", warnings ? `${warnings} 个警告` : ""].filter(Boolean).join("，"),
  line: (line) => `第 ${line} 行`,
  fixing: (errors, round, of) => `检查发现这条回复有 ${errors} 个错误，正在让模型修正（第 ${round} 次，最多 ${of} 次）…`,
  fixed: (rounds) => `模型用 ${rounds} 轮修正了它的回复。`,
  notFixed: (errors) => `修正两次后，这条回复里还有 ${errors} 个错误，“标记”面板里列出了它们。`,
  promptHint: (design, tokens) =>
    `由语言指南、UI SDK、${design} DESIGN.md 和动效规则拼成的系统提示词。大约 ${tokens}k token。`,
  connectNote: "先在上方连接一个模型，才能得到回复。",
  demoNote: "在实时会话里，这条消息会连同界面状态一起交还给智能体，由它回答下一个界面。",
  liveGuideTitlePrefix: "在 ",
  liveGuideTitleAccent: "Live Playground",
  liveGuideTitleSuffix: " 里试试",
  liveGuideBody: "用一段话或一张截图写成 DESIGN.md，再生成界面。内容存在这台浏览器里。",
  liveGuideAction: "打开 Playground",
  providerOpenAI: "OpenAI",
  providerAnthropic: "Anthropic",
  providerDeepSeek: "DeepSeek",
  providerCustom: "自定义",
  demos: {
    charts: {
      title: "图表",
      caption: "发布健康度：主指标搭配柱状、环图与面积图",
      prompt: "open intelligent ui 的发版节奏健康吗？",
    },
    cards: {
      title: "卡片",
      caption: "可横滑的酒店海报、提示条，再跟一张精选推荐",
      prompt: "帮我预订巴黎的酒店。",
    },
    budgets: {
      title: "仪表盘",
      caption: "研发负载：KPI、提交点阵、团队容量与阻塞",
      prompt: "给我看部门各研发团队的负载。",
    },
    forms: {
      title: "表单",
      caption: "会议室预订：标签、步进器、设施选项与时长滑块",
      prompt: "帮我预订周四下午的会议室。",
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
