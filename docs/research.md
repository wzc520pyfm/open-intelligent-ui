# 调研：现有 Gen UI 方案，以及 UI SDK 能否成为新方案的地基

调研时间：2026-11-22。除特别注明外，结论来自官方页面、随包发布的文档，以及在本仓库里实际运行的结果。每一节末尾列出来源。

- [结论](#结论)
- [四个方案放在一起看](#四个方案放在一起看)
- [A2UI](#a2ui)
- [OpenUI](#openui)
- [OpenAI 智能界面](#openai-智能界面)
- [UI SDK](#ui-sdk)
- [DESIGN.md](#designmd)
- [动效讨论](#动效讨论)
- [UI SDK 兼容性：实测](#ui-sdk-兼容性实测)
- [预置小组件：借了什么，和 UI SDK 冲突吗](#预置小组件借了什么和-ui-sdk-冲突吗)
- [状态语法：三家怎么存数据，我们怎么选](#状态语法三家怎么存数据我们怎么选)
- [没有验证的部分](#没有验证的部分)

## 结论

1. **三家方案的上限都由组件库决定。** A2UI 的原话是“Your design system, locked. Agents place only components you registered”；OpenUI 的模型只能调用用 Zod 注册过的组件；OpenAI 的说法是“构建了一个支持流式呈现的原生组件库”。模型在选择和组合，而不是在创作。
2. **UI SDK 可以把“组件库”换成“行为库”。** 它提供 55 个入口、367 个部件，只管焦点、键盘、选中、弹层和无障碍，不带视觉。模型拿到的是积木的“关节”，外形由它自己用布局、CSS 和 SVG 决定。
3. **兼容性实测通过。** 55 个入口里，52 个的官方示例可以原样写成标记并渲染；Calendar 需要一个 `let:` 语法来接住函数子节点；Toast 和 Preferences 是 JavaScript API，用 `toast()` 动作和 `<state persist>` 代替。详见[实测](#ui-sdk-兼容性实测)。
4. **UI SDK 不够用的地方是“内容”而不是“交互”。** 它没有布局、排版、图表、数据表格。这部分借鉴了 ChatGPT 的布局原语和 OpenUI 的数据组件，做成 15 个原语和 6 个预置组件，全部读 DESIGN.md 的令牌，和 UI SDK 互不干扰。
5. **端渲染器必须有状态语法。** 三家都有：A2UI 用数据模型加 JSON Pointer，OpenUI 用 `$变量` 加 `Query`/`Mutation`，OpenAI 的编译产物里有常量表和数据绑定。本方案用 `<state>`、`<derive>`、`<query>`、`bind:` 和动作，写法接近 Svelte，可以边流边解析。
6. **样式靠 DESIGN.md，动效靠令牌加一套会“看”的流程。** DESIGN.md 的令牌变成 CSS 变量，正文交给模型当设计指导；动效按“变化的种类”取令牌，并用真实浏览器逐帧截图来检查。

## 四个方案放在一起看

| | A2UI | OpenUI | OpenAI 智能界面 | 本方案 |
| --- | --- | --- | --- | --- |
| 模型输出 | JSON 消息流 | OpenUI Lang，一行一个组件 | Markdown 加标签，经编译器 | Markdown 加标签（IUI 标记） |
| 可用的东西 | 宿主注册的组件目录 | 宿主用 Zod 定义的组件库 | OpenAI 自建的原生组件库 | UI SDK 行为、布局原语、CSS、SVG、`<define>` 自定义组件，少量预置组件 |
| 模型能否做出没人预先定义的组件 | 不能 | 不能 | 文章未说明；观察到的输出都是库内组件 | 能，用行为加样式组合，或用 `<define>` |
| 界面内状态 | 每个 surface 一份 JSON 数据模型，JSON Pointer 绑定 | `$变量`，`@Set`、`@Reset` | 编译产物含常量表和数据绑定（观察所得） | `<state>`、`<derive>`、`bind:`、赋值语句 |
| 读写后端 | 事件回传智能体，或调用智能体侧函数 | `Query`、`Mutation`，由渲染器直接调工具 | 未公开 | `<query>` 读，`call()` 写，由渲染器直接调工具 |
| 把决定交还给模型 | `action.event` | `@ToAssistant` | 未公开 | `send()` |
| 流式渲染 | 支持 | 支持 | 支持，靠流式编译器 | 支持，半截标签会被暂缓 |
| 视觉来源 | 宿主组件自带 | 宿主组件自带 | 组件库自带 | DESIGN.md：令牌变 CSS 变量，正文进提示词 |
| 动效 | 由组件决定 | 由组件决定 | 由组件决定 | 设计系统里的动效令牌，加标记属性 |
| 跨端 | React、Lit、Angular、Flutter、SwiftUI、Compose | React、Vue、Svelte、Angular 等 | ChatGPT 网页与移动端 | 目前只有 React |
| 安全边界 | 声明式数据，不执行代码 | 声明式语言 | 未公开 | 声明式标记；表达式在解释器里运行，CSS 被限定作用域 |

这张表里本方案最弱的两项是跨端和成熟度：只有 React 渲染器，UI SDK 自身还在 beta。最强的一项是第三行。

## A2UI

Google 主导的开源生成式 UI 框架。智能体发 JSON 消息，客户端用原生组件渲染。

- **消息。** `createSurface` 建立一个界面，`updateComponents` 发组件，`updateDataModel` 发数据。组件以扁平列表给出，靠 id 互相引用。
- **组件目录。** 宿主注册组件目录（catalog），模型只能放目录里的组件。官网把这一点作为卖点：品牌一致、安全。
- **数据模型。** 每个 surface 有一份独立的 JSON 数据模型。组件属性可以是字面量，也可以是绑定 `{"@path": "/reservation/destination"}`（RFC 6901 JSON Pointer）。输入类组件的 `value` 绑定是双向的，用户输入只改本地数据模型，不逐键回传。
- **列表。** 容器的 `children` 可以是 `{ "path": "/guests", "componentId": "guestRow" }`，渲染器按数组逐项展开模板，模板内的相对路径相对于当前项。
- **回传。** 三种：事件里带上绑定路径的当前值（`action.event.context`）；v1.0 起可以直接调智能体侧函数（`action.functionCall`）；或 `sendDataModel: true` 让每条消息都附上整份数据模型。
- **“生成式 UI 光谱”。** 官网把方案分三档：预制小部件（完全受控，但没预料到的需求只能退回文字）、从原生目录组合（A2UI 的主场）、生成 HTML 和 JS 在沙箱里跑（最自由，但隔离在 iframe 里，和设计系统、状态、无障碍脱节）。

对本方案的启发：数据和结构分离、双向绑定只改本地状态、列表模板的局部作用域，都被采纳了。它点出的第三档的缺点（脱离设计系统、iframe 隔离）正是本方案想补的空档：比“从目录组合”自由，但不执行任意代码。

来源：<https://a2ui.org/>，<https://a2ui.org/concepts/data-binding/>。

## OpenUI

Thesys 维护的开源方案，核心是 OpenUI Lang。

- **语言。** 不是 JSON。每行定义一个组件并赋给一个名字，例如 `root = Stack([header, chart])`，所以可以边流边渲染。官网称比 JSON 格式少 67% 的 token。
- **组件库。** 宿主用 Zod schema 和框架组件定义库；提示词由库生成；解析器按库校验；渲染器把解析结果映射到宿主组件。
- **状态。** 名字以 `$` 开头的语句是响应式变量，右边是默认值。把它传给输入组件的 `value` 就是双向绑定。`@Set($days, "30")` 在点击时赋值，`@Reset($title)` 恢复默认。变量变化时，读它的表达式重算，用它做参数的 `Query` 重新请求。
- **读写。** `Query("list_tickets", {}, {rows: []}, 30)` 四个参数：工具名、参数、加载前的默认值、自动刷新的秒数。`Mutation(...)` 不会自动执行，要在动作里 `@Run`。工具由渲染器的 `toolProvider` 提供，可以是函数表或 MCP 客户端，调用不经过模型。
- **交还。** `@ToAssistant("…")` 把一句话发回给模型，用在需要重新推理或重新布局的时候。
- **看板。** 文档有专门的 Dashboards 部分：智能体按提示词生成看板，每次打开时加载最新数据；还有增量编辑（模型只发补丁，按名字合并）。

对本方案的启发：`Query` 的四个参数几乎原样对应 `<query tool input every>`，`Mutation` 加 `@Run` 对应 `call()`，`@ToAssistant` 对应 `send()`。“模型只写一次接线，之后界面自己跑”这个原则被完整采纳。没有采纳的是它的语法：位置参数（`Select("days", […], null, null, $days)`）要求模型记住每个组件的参数顺序，也没法自然地嵌入 Markdown、CSS 和 SVG。

来源：<https://www.openui.com/>，<https://www.openui.com/docs/openui-lang/overview>，<https://www.openui.com/docs/openui-lang/reactive-state>，<https://www.openui.com/docs/openui-lang/queries-mutations>，<https://www.openui.com/llms.txt>。

## OpenAI 智能界面

2026-10-07 随 GPT-6 发布。

**官方文章说了什么：**

- 回答可以包含图形、可点按的按钮、表单、图表和可直接使用的交互体验；模型自己决定用界面还是用文字。
- 实现上是“一个支持流式呈现的原生组件库，以及一个能在模型生成界面的同时对其进行处理的编译器”。组件库提供熟悉的设计基础，模型决定如何组合。
- 模型经过专门训练，评估维度是清晰度、实用性和完整性。
- 展望：“不再是人去适应软件，而是软件来适应人。”

**从一段分享对话的页面数据里观察到的**（非公开文档，可能随版本变化）：

- 模型的原始输出是 Markdown 混合标签。小写标签是布局和文字原语：`<box>`、`<row>`、`<grid>`、`<grid-item>`、`<list>`、`<list-item>`、`<text>`、`<title>`、`<badge>`、`<icon>`、`<divider>`。大写开头的是智能组件：`<AsyncImage query="…">`、`<Entity value="…">`、`<Link ref="…">`。
- 属性写法是 `gap={3}`、`align="center"`、`background="surface-secondary"`、`color="secondary"`，颜色和间距用的是语义名，不是具体值。
- 有 Svelte 风格的控制流：`{#each [...] as item} … {item.t} … {/each}`。
- 编译产物是一个渲染函数，形如 `DIL.render(__dil.jsx(() => { const __dilConstants = DIL.useConstants(); const __dilModelDataBindings = DIL.useAppData(…modelDataBindings…) … }))`，文字被抽成常量表，求值包在 `__dilSafe(evaluate, failureValue)` 里。可见确实存在“模型数据绑定”这一层，以及“某个表达式失败不拖垮整体”的容错。

对本方案的启发：标记的整体形态（Markdown、小写原语、大写组件、`{#each}`、语义化属性值）直接沿用，这样模型已有的习惯可以迁移；容错也照做了，每个块有自己的错误边界。不同之处在于大写标签背后不是一个封闭的组件库，而是 UI SDK 的全部行为，加上模型自己 `<define>` 的组件。

来源：<https://openai.com/zh-Hans-CN/index/gpt-6-for-everyone/>；分享对话 <https://chatgpt.com/share/6b028551-ed5c-83ec-b8b4-e6077d6b79e1> 的页面内嵌数据。

## UI SDK

Vercel 的 `@ui-sdk/core` 与 `@ui-sdk/react`，调研版本 0.1.0-beta.13，自述是“A library of behaviors to build your components. Made for agents.”

- **形态。** 无样式组件，按部件组合：`Popover` 持有状态，`PopoverTrigger` 打开它，`PopoverContent` 显示内容。部件通过上下文找到自己的根。
- **状态约定。** 统一的受控写法：`value`/`onValueChange`、`open`/`onOpenChange`、`checked`/`onCheckedChange`、`pressed`/`onPressedChange`，以及对应的 `defaultValue` 等非受控写法。
- **样式钩子。** 每个部件有 `data-slot`；状态是属性（`data-open`、`data-selected`、`data-disabled`）；进出场用 `data-starting-style` 和 `data-ending-style`；弹层暴露 `--transform-origin`、`--available-width` 等变量。
- **可选的默认样式。** `@ui-sdk/core/web.css` 给每个组件一个朴素的外观，读 `--ui-*` 变量。
- **弹层。** 用浏览器的 Popover API 进入顶层，不受滚动容器裁剪。
- **面向智能体。** 文档以 Markdown 随包发布（`docs/`、`llms.txt`），带一个 skill；`@ui-sdk/react/agent` 的 `createAgent()` 能给出界面快照并代为操作。
- **要求。** React 19 以上。

来源：npm 包 `@ui-sdk/react@0.1.0-beta.13` 内的 `docs/`，<https://ui-sdk.dev/docs>。

## DESIGN.md

Google Labs 的格式：一份 Markdown，前面是 YAML 令牌，后面是给智能体读的设计说明。

- **令牌。** `colors`、`typography`、`rounded`、`spacing`、`components`。
- **正文。** Overview、Colors、Typography、Layout、Elevation、Shapes、Components、Do's and Don'ts 等章节，用自然语言解释“什么时候用、为什么”。
- **工具。** `@google/design.md` 提供 `lint`、`diff`、`export`（Tailwind、DTCG、CSS 变量）、`spec`。
- **版本差。** 仓库主分支的规范已有明暗两套颜色（`colors.light`、`colors.dark`）和 `motion` 分组；npm 上的 0.4.0 还不认识它们，会报“缺少 primary”“令牌未被引用”“motion 不是已知键”三类警告。`pnpm design:lint` 过滤掉这三类，其余照常报。

本方案对它的用法是“一份文件，两个读者”：渲染器读令牌，生成 `--iui-*` CSS 变量并映射到 UI SDK 的 `--ui-*`；提示词生成器把令牌名和正文交给模型。所以换一份 DESIGN.md，界面和模型的设计判断一起换。

来源：<https://github.com/google-labs-code/design.md>，`npx design.md spec`。

## 动效讨论

来自需求里给出的那段 ChatGPT 对话（标题“指导AI创建丝滑动效”）。要点：

- 问题有两层：**设计认知**（何时该动、怎么动、节奏和层次）和**工程实现**（用专业手段而不是随手写 transition）。
- **统一动效令牌。** 时长、缓动、位移距离先定成一套，避免每个组件各写各的。
- **九条原则。** 目的、连续、自然、层次、错峰、可打断、性能、无障碍、一致。并强调“不是动画越多越好”。
- **六步流程。** 分析、设计、实现、预览、审查、精修。
- **最值得做的方向。** “不要只让 AI 学会写动画，而是让 AI 学会观察动画”：在真实浏览器里录制、逐帧看、检查跳变和掉帧。
- 推荐了几个现成的 skill 和引擎（Emil Kowalski 的 skills、LottieFiles 的 motion-design-skill、GSAP、Motion），并建议长期自建一套。

本方案的落实：

| 讨论里的建议 | 落实在哪里 |
| --- | --- |
| 统一动效令牌 | DESIGN.md 的 `motion` 分组，五个角色：`state-change`、`surface-enter`、`surface-exit`、`layout`、`emphasis` |
| 原则与流程 | `skills/motion/SKILL.md`，以及系统提示词里的 Motion 一节 |
| 可复用的动效模式 | 标记属性 `motion`、`delay`、`stagger`、`show`、`morph`，模型不需要自己写关键帧 |
| 让 AI 观察动画 | `skills/motion/scripts/capture.mjs`：放慢播放、逐帧截图、拼成一张图，并列出正在运行的动画和可疑之处 |
| 可打断、无障碍 | 状态切换用 transition；`prefers-reduced-motion` 下统一降级 |

没有采纳的：引入 Motion 或 GSAP 之类的动画引擎。生成的界面不能执行任意 JavaScript，CSS 动画、`@starting-style` 和 View Transitions 已经覆盖了入场、退场、状态切换和位置变化；引擎可以由宿主通过自有组件提供。

那个截图脚本在本仓库里已经起过一次作用：它拍到看板卡片移动时，滚动区域外的卡片会在过渡期间盖住输入框，据此改了 `morph` 的实现（只给完整可见的元素命名）。

## UI SDK 兼容性：实测

问题是：一个声明式的、不执行 JavaScript 的标记，能不能驱动一个为 JSX 设计的组件库。

**方法。** `scripts/generate-ui-sdk.mjs` 读取随包文档，生成两份清单：每个组件名从哪个入口懒加载，以及每个入口的说明、部件、结构、示例和属性。测试 `packages/react/test/ui-sdk.test.tsx` 把每个入口的官方示例转成标记后逐个挂载。

**结果。**

| 项目 | 结果 |
| --- | --- |
| 入口数 | 55 |
| 可按标签名使用的组件 | 367 |
| 官方示例原样可挂载 | 52 / 55 |
| Calendar | 子节点是函数。用 `let:` 接住：`<CalendarWeeks let:cell><CalendarDay value={cell.date} /></CalendarWeeks>` |
| Toast | 靠 JavaScript 调用触发。改用 `toast(message, tone)` 动作 |
| Preferences | 需要在 JavaScript 里创建控制器。改用 `<state persist>` |
| 受控状态 | 机械映射：`bind:value={x}` 等于 `value={x}` 加 `onValueChange` 写回。对 `checked`、`open`、`pressed`、`page` 等同理 |
| 事件 | `on:valueChange={…}` 对应 `onValueChange`；`$value` 是新值 |
| 异步按钮 | `Button` 的处理函数返回 Promise 时自带 pending 状态；`await call(...)` 的动作直接受益 |
| 弹层 | 进入浏览器顶层，在聊天的滚动列里不被裁剪 |
| 智能体桥 | `createAgent()` 可以读取并操作生成的界面（测试里改了一个输入框的值） |

**遇到的问题和处理。**

- **默认样式的作用域。** `web.css` 的规则是全局的。生成脚本把它整体收进 `.iui-root` 和一个层叠层 `ui-sdk`，不影响宿主页面。
- **令牌对接。** UI SDK 读 `--ui-background`、`--ui-primary` 等；在 `.iui-root` 上把它们指向 DESIGN.md 生成的 `--iui-color-*`，UI SDK 组件就跟着设计系统走了。
- **伪元素图标。** 部件没有图标时，`web.css` 会用 `::before` 画一个。模型常常既不放图标也放了文字（“−”“+”），于是出现两个符号。对有内容的增减按钮关掉伪元素；对日历翻页和日期选择触发器，隐藏文字、保留图标。
- **元素选择器的冲突。** 我们给 Markdown 的 `table`、`th`、`h2`、`button` 写的基础样式会落到 UI SDK 的部件上（日历是 `table`，手风琴标题是 `h3`）。现在基础样式一律排除带 `data-slot` 的元素。
- **没写遮罩的对话框。** 官方示例的 Dialog 不含 `DialogBackdrop`，模型照着写就没有变暗的背景。现在没有遮罩部件时，用内容元素的 `::backdrop` 补上。
- **宿主的无层样式。** 层叠层之外的 CSS 优先级高于层内，所以宿主的全局 reset 会盖过渲染器。这是用层的代价，写在集成文档里。

**判断。** 兼容是成立的，而且不是偶然：UI SDK 的三个设计（部件组合、统一的受控约定、状态走属性）恰好都能被声明式标记表达。风险在于它还是 beta：升级后需要重新运行 `pnpm generate`，上面那个“52 / 55”的测试会指出哪里变了。

## 预置小组件：借了什么，和 UI SDK 冲突吗

UI SDK 的 55 个入口几乎全是交互。回答问题最常用的“内容”它没有，所以补了两组。

**布局与文字原语（15 个，小写标签）。** `box`、`row`、`grid`、`grid-item`、`card`、`title`、`text`、`badge`、`icon`、`divider`、`spacer`、`image`、`link`、`list`、`list-item`。命名和属性风格跟 ChatGPT 观察到的原语保持一致（`gap={3}`、`color="muted"`、`radius="lg"`），值一律是设计令牌。

**预置组件（6 个）。**

| 组件 | 借鉴 | 为什么不让模型自己画 |
| --- | --- | --- |
| `Chart` | OpenUI 的图表组件，ChatGPT 的图表 | 坐标轴、刻度、取整、悬停、图例，每次重画又贵又容易错 |
| `Stat` | 看板里的指标卡 | 数字格式、涨跌方向、涨跌颜色有固定规矩 |
| `Number` | — | 数值变化时滚动到新值，是“数值变了”这类动效的标准做法 |
| `DataTable` | OpenUI 的 `Table` | 排序、分页、选中行、单元格格式 |
| `CodeBlock` | Markdown 代码块 | 复制按钮 |
| `Skeleton` | — | 查询加载时的占位 |

**与 UI SDK 的关系。**

- 名字不冲突：UI SDK 没有这六个名字，有一条测试守着这一点。
- 样式同源：预置组件只读 `--iui-*` 变量，和 UI SDK 部件用的是同一套令牌，换设计时一起变。
- 状态同构：`Chart` 和 `DataTable` 的 `on:select` 与 UI SDK 的回调走同一条路，写进同一个状态。
- 可以嵌套，也共用同一份状态：看板示例里 `Stat` 嵌着迷你图，`SegmentedControl` 切换柱状图的指标，点环形图的一块会筛选下面的 `DataTable`；工作台示例把 `DataTable`、`Select` 筛选和 `Dialog` 里的表单接在同一组查询上。
- 无新依赖：图表是手写 SVG，没有引入图表库。

刻意没有预置的：看板卡片、时间线、对比表、定价卡之类。这些正是该由模型用原语、CSS 和 `<define>` 现场做的东西，示例里的冲刺看板就是这样写出来的。

## 状态语法：三家怎么存数据，我们怎么选

| 需求 | A2UI | OpenUI | 本方案 |
| --- | --- | --- | --- |
| 声明状态 | `updateDataModel` 写入路径 | `$days = "7"` | `<state days={7} />` |
| 派生值 | 函数调用 | 表达式语句 | `<derive total={…} />` |
| 双向绑定 | `value: {"@path": "/a/b"}` | 把 `$var` 传给 `value` | `bind:value={a.b}` |
| 按钮改状态 | 事件回传或本地函数 | `@Set($x, v)` | `on:click={x = v}` |
| 条件与循环 | 模板加数据路径 | 三元表达式 | `{#if}`、`{#each}` |
| 读数据 | 智能体推送 | `Query(tool, args, default, refresh)` | `<query id tool input every />` |
| 写数据 | `functionCall` | `Mutation` 加 `@Run` | `await call(tool, input)` |
| 交还模型 | `action.event` | `@ToAssistant(text)` | `send(text, data)` |
| 持久化 | 宿主负责 | 看板产品里由服务端保存 | `<state persist />` |

选择标签加表达式而不是 JSON 或赋值语句，理由有四条：

1. **和内容同处一个流。** 状态声明、文字、控件都在同一份 Markdown 里，自上而下出现；不需要第二个通道，也不需要模型维护一张 id 表。
2. **表达式是 JavaScript 的子集。** 模型不需要学新语言：`items.filter(i => i.done).length`、`price * qty`、`cond ? a : b` 直接可用。运行在解释器里，碰不到页面。
3. **赋值就是更新。** `on:click={item.qty += 1}` 会沿路径复制并写回状态；对经过 `filter` 或 `sort` 的列表项、对传进 `<define>` 的对象也成立（按对象身份找回原位）。
4. **残缺也能渲染。** 流到一半的 `<state …` 不生效，已经渲染的部分保持用户调过的值；半截标签暂缓，不报错。

代价是要自己实现标记解析器、表达式解释器和状态仓库，合计约四千五百行，在 `packages/core`。

## 没有验证的部分

- **没有用真实模型跑过。** 环境里没有模型密钥。提示词里的每个示例都由测试渲染过，六个演示是手写的 IUI 标记；模型在这份提示词下实际写得怎么样，没有数据。演示站的 Live 模式可以接任意 OpenAI 兼容端点，SSE 客户端只对着假端点测过。
- **token 成本没有量过。** 默认系统提示词约 3.4 万字符。标记比 JSON 省多少、比 OpenUI Lang 多多少，没有做基准。
- **OpenAI 的语法是从一段对话里看到的**，不是规范，文中标了“观察所得”的都属于这一类。
- **只有 React。** 核心包不依赖框架，但其他框架的渲染器没有写。
- **UI SDK 是 beta。** 以上结论对应 0.1.0-beta.13。
- **浏览器。** 目测检查只在桌面版 Chrome 里做过；`morph` 依赖 View Transitions API，不支持的浏览器会直接切换。
