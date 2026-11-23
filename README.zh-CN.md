# Open Intelligent UI

[English](README.md) · 中文

让智能体不是从组件库里挑选界面，而是创作界面。

模型写 Markdown 加标签的标记，渲染器边流边把它变成可以操作的界面。交互行为来自 [UI SDK](https://ui-sdk.dev/docs)，视觉来自一份 [DESIGN.md](https://github.com/google-labs-code/design.md)，动效来自设计系统里的动效令牌和一个 motion skill。状态、数据读写和把决定交还给模型，都由标记里的几种语法完成。

| | |
| --- | --- |
| <img src="docs/images/dashboard.png" alt="模型生成的销售看板：指标卡、柱状图、环形图和可排序的表格" width="420"> | <img src="docs/images/workbench.png" alt="模型生成的工单工作台：筛选、表格、详情和写操作" width="420"> |
| <img src="docs/images/board.png" alt="模型用原语和 CSS 现场定义的冲刺看板" width="420"> | <img src="docs/images/gears.png" alt="由滑块驱动的 SVG 齿轮示意图" width="420"> |

这四个界面都是一段标记，没有一个是预先写好的组件。它们在 `apps/playground/src/demos/` 里，是手写的示例标记，不是模型的输出；本仓库还没有用真实模型跑过，见[现状与限制](#现状与限制)。

## 为什么

A2UI、OpenUI 和 OpenAI 的智能界面都让模型在一个预先定义的组件库里选择和组合。库里有什么，界面就只能是什么。

UI SDK 提供的是另一种东西：组件的行为（焦点、键盘、选中、弹层、无障碍），不带样子。把它交给模型，模型拿到的是积木的关节，外形可以自己决定。缺的两块是“怎样才好看”和“怎样动才对”，分别由 DESIGN.md 和动效规则补上。

| 地基 | 提供什么 | 在这个仓库里 |
| --- | --- | --- |
| UI SDK | 55 个入口、367 个部件的交互行为 | 按名字懒加载，标记里直接写 `<Tabs>`、`<Dialog>`、`<Select>` |
| DESIGN.md | 颜色、字体、圆角、间距、动效令牌，以及怎么用它们的说明 | 令牌变成 CSS 变量，正文进系统提示词。`design/` 里有三份 |
| 动效 skill | 什么变化配什么动效，以及在浏览器里逐帧检查的方法 | `skills/motion/`，标记属性 `motion`、`show`、`stagger`、`morph` |
| 少量预置 | UI SDK 没有的内容类组件 | 15 个布局原语，`Chart`、`Stat`、`Number`、`DataTable`、`CodeBlock`、`Skeleton` |

调研过程和取舍依据在 [`docs/research.md`](docs/research.md)，包括 UI SDK 兼容性的实测结果。

## 标记长什么样

```iui
<state saved={1800} goal={12000} monthly={400} />
<derive
  months={ceil(max(goal - saved, 0) / monthly)}
  share={min((saved + monthly * 12) / goal, 1)}
/>

**You reach {currency(goal)} in {months} months.** A year from now you would be {percent(share)} of the way.

<card padding={4}>
  <row gap={4} wrap>
    <svg viewBox="0 0 80 80" width="96" role="img" aria-label="{percent(share)} of the goal after a year">
      <circle cx="40" cy="40" r="32" fill="none" stroke="var(--iui-color-muted)" stroke-width="8" />
      <circle class="ring" cx="40" cy="40" r="32" fill="none" stroke="var(--iui-color-accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="{share * 201} 201" transform="rotate(-90 40 40)" />
      <text x="40" y="45" text-anchor="middle" font-size="14" font-weight="600" fill="var(--iui-color-foreground)">{percent(share)}</text>
    </svg>
    <box flex={1} minWidth={220} gap={3}>
      <Slider min={50} max={1500} step={50} bind:value={monthly}>
        <row><text size="sm" color="muted">Set aside each month</text><spacer /><text size="sm" weight="medium" tabular>{currency(monthly)}</text></row>
        <SliderControl><SliderTrack><SliderIndicator /><SliderThumb aria-label="Monthly amount" /></SliderTrack></SliderControl>
      </Slider>
      <Button variant="solid" on:click={send("Set up a monthly transfer of " + currency(monthly), { monthly, months })}>Start saving {currency(monthly)} a month</Button>
    </box>
  </row>
</card>

<style>
  .ring { transition: stroke-dasharray var(--iui-motion-layout-duration) var(--iui-motion-layout-easing); }
</style>
```

- `<state>` 和 `<derive>` 是界面记住的东西和由它算出来的东西。
- `<Slider>` 是 UI SDK 的行为，`bind:value` 把它接到状态上。拖动时句子、圆环和按钮文字一起变，不经过模型。
- 圆环不是组件，是模型自己画的 SVG，颜色和过渡时间取自设计系统的变量。
- `send()` 把读者的决定连同数据交还给模型，开始下一轮对话。
- 接上工具之后，`<query>` 读数据，`call()` 写数据，界面就成了一个可读可写的工作台，同样不需要模型在场。

完整的语言定义在 [`docs/spec.md`](docs/spec.md)。

## 试一试

需要 Node 22 以上和 pnpm。

```bash
pnpm install
pnpm dev
```

打开 <http://localhost:5173>。左边有六个示例，可以调流式速度、切换三套设计、明暗和宽度；Inspect 面板里能直接改标记、看状态、看发给模型的系统提示词。线上演示站：<https://open-intelligent-ui-one.vercel.app>。要接真实模型，选左边的「实时」，在 OpenAI、Anthropic、DeepSeek 或自定义端点中选一个；密钥只留在当前标签页里。

```bash
pnpm test
pnpm typecheck
pnpm design:lint      # 用 DESIGN.md 官方 CLI 检查 design/ 下的三份设计
pnpm check:packages   # 构建两个包，检查将要发到 npm 的 tarball
```

## 接入

```bash
npm install @open-intelligent-ui/react @open-intelligent-ui/core @ui-sdk/react @ui-sdk/core
```

> 还没有发布到 npm。两个包已经可以构建和打包（`pnpm check:packages`），首次发布在等 npm 凭据。在那之前，请通过工作区使用，或者在 `packages/core` 和 `packages/react` 里运行 `pnpm pack`，安装生成的 tarball。

```tsx
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
import { IntelligentUI } from "@open-intelligent-ui/react"
import "@open-intelligent-ui/react/styles.css"

const system = buildSystemPrompt({ design, tools: toolDescriptions })

<IntelligentUI
  source={replySoFar}
  streaming={isStreaming}
  design={design}
  tools={{ listTickets, updateTicket }}
  onAction={(action) => {
    if (action.type === "send") askModel(action.text, action.data, action.state)
  }}
/>
```

两个包都是 ESM，带类型声明；React 包的入口标了 `"use client"`。工具、主题、宿主组件、状态读写和安全边界的说明在 [`skills/intelligent-ui/references/integration.md`](skills/intelligent-ui/references/integration.md)。

## 仓库结构

```
packages/core     标记解析、表达式解释器、状态仓库、DESIGN.md、系统提示词。不依赖框架
packages/react    React 渲染器、原语、预置组件、样式
apps/playground   演示站
design/           三份 DESIGN.md：Paper、Heritage、Signal
skills/           给编码智能体的两个 skill：intelligent-ui 和 motion
docs/             调研、语言规范、架构
scripts/          从 UI SDK 生成清单、生成 skill 参考页、检查设计
```

## 文档

| 文档 | 内容 |
| --- | --- |
| [`docs/research.md`](docs/research.md) | A2UI、OpenUI、OpenAI 智能界面、UI SDK、DESIGN.md 的调研；UI SDK 兼容性实测；预置组件和状态语法的取舍 |
| [`docs/spec.md`](docs/spec.md) | IUI 标记规范 |
| [`docs/architecture.md`](docs/architecture.md) | 各部分的分工、数据流、安全模型、测试覆盖 |
| [`skills/intelligent-ui/SKILL.md`](skills/intelligent-ui/SKILL.md) | 给智能体：怎么写界面、怎么接入 |
| [`skills/motion/SKILL.md`](skills/motion/SKILL.md) | 给智能体：怎么设计和检查动效 |

## 现状与限制

这是一个可以运行的原型，不是可以直接上线的产品。

- **没有用真实模型验证过。** 示例是手写的标记。系统提示词里的每个示例都经过测试渲染，但模型按这份提示词实际写得怎么样、token 成本如何，没有数据。
- **UI SDK 是 beta**（0.1.0-beta.13）。升级后运行 `pnpm generate`，测试会指出变化。
- **只有 React 渲染器**，需要 React 19。UI SDK 另有 Vue、Svelte、Solid 和 Web Components 的包，组件名相同；`packages/core` 和样式表不依赖框架，但其他框架的渲染器没有写。见 [`docs/research.md`](docs/research.md#其他框架)。
- **还没有发布到 npm。** 两个包会构建到 `dist/`，打出的 tarball 在仓库之外的一个 Vite 应用和一个 Next.js 应用里安装并运行过；发布这一步还没有做。
- **目测只在桌面版 Chrome 里做过。** 位置过渡依赖 View Transitions API，不支持的浏览器会直接切换。
- **安全模型没有经过外部审计。** 标记不会被当作代码执行，但工具调用的权限检查是宿主的责任。
- **宿主页面不分层的全局 CSS 会影响界面内部**，接入时需要把 reset 放进层叠层。

## 许可

MIT。来自 UI SDK 的生成文件仍按 Apache-2.0，见 [`NOTICE`](NOTICE)。
