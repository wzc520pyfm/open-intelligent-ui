# 这是什么

Open Intelligent UI 让模型用界面来回答。模型写的是混着标签的 Markdown，你产品里的渲染器在这段文本流式到达的同时，把它变成用户可以直接用的界面：它有状态，通过工具读写你的数据，有动效，还能把用户的决定交回给模型。

## 它的位置 {#where-it-sits}

生成式 UI 目前有两种成熟的做法。

| 做法 | 模型写什么 | 你得到什么 | 代价 |
| --- | --- | --- | --- |
| 组件目录组合（A2UI、OpenUI、json-render） | 对你注册过的组件的引用 | 你的设计系统、真实的交互行为、安全 | 界面只能是目录里有的东西 |
| 一整个页面（沙箱里的 HTML 和 JavaScript） | 任何东西 | 任何形态 | 没有设计系统，没有真正的控件行为，要自己管隔离，难以流式输出 |
| Open Intelligent UI | 由基础元素、行为、绘图和你的组件组合成的标记 | 任何形态，用你的设计系统，带真实行为 | 要教模型一种语言，要信任一个渲染器 |

它的办法是给模型零件，而不是成品组件：

| 基础 | 给模型的是什么 |
| --- | --- |
| [UI SDK](https://ui-sdk.dev/docs) | 55 个组件的行为（焦点、键盘、选择、弹层、无障碍），本身没有外观 |
| [DESIGN.md](https://github.com/google-labs-code/design.md) | 颜色、字体、圆角、间距和动效的 token，以及说明怎么用它们的文字 |
| 布局基础元素和预设组件 | `<card>`、`<row>`、`<grid>`、`<text>` 等；UI SDK 没有的内容由 `<Chart>`、`<Stat>`、`<DataTable>` 补上 |
| HTML、SVG 和带作用域的 CSS | 组件覆盖不到的地方，用它们来画。是一份白名单，不是一个页面 |
| 一门小型表达式语言 | 状态、派生值、列表、格式化。由解释器执行，从不当作 JavaScript 运行 |

## 内置了什么 {#what-comes-built-in}

下面这些不需要任何配置就能用，每一行都可以替换或者扩充。

| | 内置 | 怎么换 |
| --- | --- | --- |
| 渲染器 | React、Vue、Svelte、Solid、Web Components | [快速开始](./start) |
| 设计 | Paper（默认）、Noir、Heritage、Signal，每套都有亮色和暗色 | [设计](./design)：你自己的 DESIGN.md、别的组件库的，或者一份主题样式表 |
| 组件 | 15 个布局基础元素，55 个 UI SDK 组件（367 个部件），2,410 个 Lucide 图标，6 个预设组件 | [接入自己的组件](./components)：`defineComponent`、`defineWidget` |
| 图表 | bar、line、area、donut、pie、spark，用 SVG 绘制，没有依赖 | [图表](./charts)：ECharts、G2、Recharts 或你自己的引擎；还会多出 scatter、radar、funnel |
| 动效 | 8 种入场、描边绘制、3 种循环、交错、进入和离开、共享元素的形变过渡，用 CSS 实现 | [动效](./motion)：Motion、GSAP、Web Animations API 或你自己的引擎；也可以加自己的预设 |
| 检查 | 一个检查回复的检查器，以及要求模型改正的那条消息 | [保证输出正确](./correctness) |

## 一份回复怎样变成界面 {#how-a-reply-becomes-an-interface}

1. 你用 `buildSystemPrompt` 生成系统提示词。它教模型这种标记，并描述你的设计、你的组件和你的工具。
2. 模型用标记回复。每收到一段，你就把到目前为止的全文传给 `<IntelligentUI>`。
3. 渲染器解析已经完整的部分，写到一半的标签先不画，然后渲染。后面的内容继续到达时，状态保持用户留下的样子。
4. 用户使用界面。控件改变状态，查询读你的工具，事件处理调用它们。
5. 界面调用 `send()` 时，你把它加进对话，再问一次模型。

## 现状 {#status}

这是一个可以工作的原型。各个包已经发布并有测试，但还没有产品基于它上线。[保证输出正确](./correctness#what-has-been-measured)里写了哪些在真实模型上测量过，哪些没有。UI SDK 本身还在 beta 阶段。
