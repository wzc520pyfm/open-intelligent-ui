# 架构

本文说明各部分怎么分工、数据怎么流动，以及几个不显而易见的设计决定。语言本身见 [`spec.md`](spec.md)，调研和取舍的依据见 [`research.md`](research.md)。

- [一次回复的全过程](#一次回复的全过程)
- [代码在哪里](#代码在哪里)
- [解析器](#解析器)
- [表达式解释器](#表达式解释器)
- [状态仓库](#状态仓库)
- [渲染](#渲染)
- [UI SDK 的接入](#ui-sdk-的接入)
- [设计系统](#设计系统)
- [样式分层](#样式分层)
- [动效](#动效)
- [提示词](#提示词)
- [安全模型](#安全模型)
- [测试守着什么](#测试守着什么)

## 一次回复的全过程

```
            DESIGN.md ──────────────┬──────────────────────────────┐
                                    │                              │
  工具描述 ──▶ buildSystemPrompt ◀──┘                              ▼
                    │                                        designToCss
                    ▼                                              │
                  模型 ──(流式文本)──▶ parse ──▶ Surface ──▶ render ◀┘
                    ▲                              │  ▲          │
                    │                              │  │          ▼
                    └────── send(text, data) ◀─────┘  └──── 读者操作界面
                                                   │
                                宿主的工具 ◀── <query> / call()
```

1. 宿主用 `buildSystemPrompt` 生成系统提示词：语言、原语、UI SDK 组件、动效规则、DESIGN.md 的令牌和正文、可用工具。
2. 模型流式返回 IUI 标记。每来一段，宿主把到目前为止的全文交给 `<IntelligentUI source streaming>`。
3. `parse` 把全文解析成树。流式期间，末尾半截的标签和表达式先不解析。
4. `Surface` 读树里的声明：建立状态、派生值、查询、自定义组件和样式。已有的状态不动。
5. 渲染器把树变成所在框架的元素（React 或 Vue）：原语、预置组件、UI SDK 部件、HTML 和 SVG。
6. 读者操作界面。事件处理是标记里的动作，在解释器里执行，写状态仓库；读过这些状态的地方重新渲染。这一步没有模型参与。
7. `<query>` 和 `call()` 直接调用宿主提供的工具，读写真实数据。这一步也没有模型参与。
8. 动作调用 `send()` 时，宿主收到一句话、附带的数据和当时的全部状态，把它作为用户消息交给模型，开始下一轮。

第 6、7 步是和“每次点击都问一次模型”的方案的主要区别：模型只写一次接线。

## 代码在哪里

```
packages/core            不依赖任何框架
  src/markup             标记解析：扫描器、Markdown、标签白名单
  src/expr               表达式：分词、解析、求值、内置函数
  src/runtime            Surface：状态、派生值、查询、动作
  src/design             DESIGN.md 解析、令牌到 CSS 变量、CSS 作用域与净化
  src/prompt             系统提示词、语言指南、UI SDK 清单（生成）
  src/renderer           各渲染器共用的部分，不依赖框架，但会用到 DOM
                         树的遍历、属性与指令、令牌、原语、预置组件、图表
  styles                 样式表，只有这一份
packages/react           React 渲染器，建在 @ui-sdk/react 上
packages/vue             Vue 渲染器，建在 @ui-sdk/vue 上；两个包的结构相同
  src/IntelligentUI      组件本体：状态订阅、流式更新、提示、morph
  src/render             本框架的命名规则、视图到元素、错误边界、离场
  src/primitives         图标和图片；其余原语直接用共用的视图
  src/presets            预置组件里需要本地状态的部分（排序、翻页、数字滚动）
  src/registry           UI SDK 部件的懒加载表（生成）
apps/playground          演示站：六个示例、流式回放、接真实模型
apps/vue-demo            同一批示例，用 Vue 渲染器
design                   三份 DESIGN.md
skills                   给编码智能体的两个 skill
scripts                  生成 UI SDK 清单、生成 skill 参考、检查 DESIGN.md
```

运行时依赖只有三个：`marked`（Markdown）、`yaml`（DESIGN.md 的令牌）和图标（React 包用 `lucide-react`，Vue 包用同一版本的 `@lucide/vue`）。UI SDK 和框架本身是 peer 依赖。

## 解析器

`packages/core/src/markup/scan.ts`。一个手写的递归下降扫描器，输出 `Document`。

- **两种语法交织。** 扫描器负责标签、`{表达式}` 和 `{#if}`/`{#each}` 块；它们之间的文字交给 `marked` 处理成 Markdown 节点。Markdown 生成的元素标记为 `origin: "markdown"`，标签写出的标记为 `origin: "tag"`。渲染器据此区分：只有写成标签的名字才会被当作原语或声明。
- **从不抛错。** 看不懂的内容保留为文字或丢弃，并记入 `diagnostics`。模型的输出不保证合法，解析器必须对任何输入都给出一棵树。
- **流式模式。** `parse(source, { streaming: true })` 把“输入结束”理解为“还没写完”：未闭合的元素保持打开（`closed: false`）；末尾的半截标签、半截闭合标签、未闭合的表达式被暂缓，`Document.complete` 为 `false`。
- **每次全量重新解析。** 没有做增量解析。演示里最长的一份标记约 5900 字符，在这台机器的 Node 里完整解析一次约 0.3 毫秒，按每 40 个字符一段重新解析完整个流共约 27 毫秒。全量解析换来的是实现简单，以及“相同输入必然得到相同的树”。

## 表达式解释器

`packages/core/src/expr`。分词、解析成 AST、在作用域链上求值。

- **不使用 `eval` 或 `Function`。** 标记永远不会变成可执行的 JavaScript。
- **白名单。** 全局只有内置函数和 `Math` 这样没有原型的命名空间；方法调用只允许列出的列表、文本、数字方法；属性访问屏蔽 `__proto__`、`constructor`、`prototype`。
- **两种模式。** 属性和文字里的表达式是只读的，赋值会报错；`on:` 里的动作可以赋值、调用动作函数、`await`。
- **步数上限。** 每次求值最多 20 万步，超过即中止，防止死循环卡住页面。
- **赋值的含义。** 见下一节。

## 状态仓库

`packages/core/src/runtime/surface.ts`。每个界面一个 `Surface`。

**状态不可变。** 赋值不修改对象，而是沿路径复制：`todo.done = true` 会生成新的 todo、新的列表，再替换状态里的那一项。React 侧用 `useSyncExternalStore` 订阅版本号，Vue 侧把版本号放进一个 `shallowRef`。

**按身份写回。** 难点在于被赋值的对象常常不是从状态里直接取的：

```
{#each todos.filter(t => !t.done) as todo}
  <Checkbox bind:checked={todo.done} />
{/each}
```

`todo` 来自 `filter` 的结果，没有路径可循。做法是按对象身份在状态里找到它原来的位置，再沿那条路径复制替换。对 `{#each}` 的项、`<define>` 收到的属性、`find` 的结果都适用。找不到（比如项是数字这样的原始值）时动作报错并通过 `onWarning` 报告，而不是悄悄不生效。

**派生值惰性求值。** `<derive>` 在被读到时计算，按状态版本缓存；自己依赖自己会被检测出来。

**查询。** 每个 `<query>` 以“工具名加参数的稳定序列化”为键。键变了才重新请求，所以 `input` 引用的状态变化会自动触发刷新；请求有序号，过期的响应被丢弃；刷新时保留旧数据。`call()` 成功后所有查询失效重取。

**重新解析时保留状态。** `update(doc)` 每次解析后都会调用。已经存在的状态保持当前值，派生值、自定义组件、样式按新的树替换，树里不再出现的查询被清理。这是“边流边交互”的基础。

## 渲染

渲染分两层。`packages/core/src/renderer` 是共用的一层，决定“渲染成什么”；`packages/react` 和 `packages/vue` 各自只决定“在这个框架里怎么写出来”。

共用层向框架要两样东西：

- **命名规则（`PropsDialect`）。** 同一个意思在不同框架里名字不同：类名是 `className` 还是 `class`，`on:keydown` 是 `onKeyDown` 还是 `onKeydown`，`bind:value` 写回时监听哪个事件。标记里的 `on:change` 在两边都表示“每次编辑”，所以在 Vue 里落到 `input` 事件上。
- **宿主（`RenderHost`）。** 怎么创建元素、片段和组件，怎么把子树交给组件（`let:`），怎么做离场和占位。

原语、预置组件和图表不直接生成框架元素，而是生成一棵中性的视图树（`view.ts`：标签、类名、样式、事件、子节点），每个框架用一个几十行的转换函数把它变成自己的元素。排序、翻页、悬停这类本地状态留在框架一侧，画什么由共用层决定。

- **树到元素。** `createRenderer(host)` 返回的 `renderNodes` 逐节点生成元素。大写名字的查找顺序是宿主组件、`<define>`、预置组件、UI SDK。
- **属性。** `props.ts` 把标记属性转成组件属性：`bind:` 变成值加回调，`on:` 变成事件处理函数，`class:`、`style:` 合并，危险属性（`dangerouslySetInnerHTML`、`srcdoc`、`formaction` 等）丢弃，链接和媒体地址经过 `safeUrl`。
- **原语的属性是令牌。** `tokens.ts` 把 `gap={3}`、`color="muted"`、`radius="lg"` 解析成 `var(--iui-…)`；不认识的颜色名按 CSS 颜色处理并经过净化。
- **错误边界。** 每个顶层块包在一个 `Boundary` 里。一块出错只影响这一块；流式期间不显示错误，只显示占位，因为下一个数据块可能就修好了。
- **离场。** `show={false}` 的元素由 `Presence` 多保留一段时间：先加上离场状态，等动画结束再卸载。
- **提示。** `toast()` 渲染在界面自己的一个 `popover` 区域里，进入浏览器顶层。

## UI SDK 的接入

`scripts/generate-ui-sdk.mjs` 读取随包发布的文档和样式，生成三个文件：

| 文件 | 内容 | 用途 |
| --- | --- | --- |
| `packages/react/src/registry/ui-sdk.generated.ts`、`packages/vue/src/registry/ui-sdk.generated.ts` | 组件名到入口的表，每个入口一个动态 `import()`，分别指向 `@ui-sdk/react` 和 `@ui-sdk/vue` | 渲染器按名字懒加载 |
| `packages/core/src/prompt/ui-sdk-catalog.generated.ts` | 每个入口的说明、部件、结构、示例、属性 | 提示词和 `describeComponent` |
| `packages/core/styles/ui-sdk.generated.css` | UI SDK 的 `web.css`，限定在 `.iui-root` 和 `ui-sdk` 层里 | 默认外观 |
| `packages/vue/src/primitives/icons.generated.ts` | 图标名到 `@lucide/vue` 单个图标文件的表 | Vue 渲染器按名字懒加载图标 |

渲染器不认识任何一个具体的 UI SDK 组件：标记里出现 `<Tabs>`，就按名字加载、传属性、渲染子节点。所以 UI SDK 新增组件后，重新运行 `pnpm generate` 即可用，不需要改渲染器。

生成脚本会核对两个包：版本必须相同，React 清单里的每个组件名在 `@ui-sdk/vue` 里都要能找到，否则报错。

需要特别处理的只有一类：以函数作为子节点的部件（Calendar 的周和日）。带 `let:` 的元素会把自己的子树编译成一个函数再传给组件。React 的部件把一个值传给函数子节点；Vue 的部件把一个对象传给默认插槽（多数是 `{ state }`，也有 `{ cell }`、`{ index }`），而且 `state` 是按字段读取时才取值并建立订阅的代理。所以 Vue 一侧不复制它，而是包成 `lazyRecord`：表达式读到哪个字段，才去取哪个字段，取到的值照常转成纯数据。

加载是异步的。部件第一次出现时先渲染占位，模块到达后触发重新渲染；`preloadUiSdk()` 可以提前加载。

## 设计系统

`packages/core/src/design`。

`parseDesign` 读 DESIGN.md 的 YAML 头和正文。`designToCss` 把令牌写成限定在某个界面上的 CSS 变量：

| DESIGN.md | CSS 变量 | 谁在用 |
| --- | --- | --- |
| `colors.light.*`、`colors.dark.*` | `--iui-color-<name>` | 原语、预置组件、模型写的 CSS |
| `typography.*` | `--iui-font-<role>-family\|size\|weight\|line\|tracking` | `<text variant>`、标题、正文 |
| `rounded.*` | `--iui-radius-<name>` | `radius="lg"` |
| `spacing.*` | `--iui-space-<name>`、`--iui-space-unit` | `gap={3}`、`padding="md"` |
| `motion.*` | `--iui-motion-<name>-duration`、`-easing` | 入场、离场、状态过渡 |
| `components.*` | `--iui-c-<component>-<property>` | 按钮、卡片等的细节 |

几个决定：

- **角色有回退。** 设计里没写 `success` 或 `chart-3` 时，从已有颜色推出一个，所以任意一份合法的 DESIGN.md 都能驱动整个界面。`variables.ts` 列出了每个角色和它的回退。
- **明暗两套。** 设计同时有 `colors.light` 和 `colors.dark` 时两套变量都输出：暗色那套挂在 `data-iui-scheme="dark"` 上，`scheme="auto"` 时由媒体查询切换。
- **UI SDK 走同一套变量。** 在 `.iui-root` 上把 UI SDK 的 `--ui-*` 指向 `--iui-*`，行为组件和原语的视觉因此一致。
- **令牌值会被检查。** DESIGN.md 可能来自不受信任的地方；含有 `;`、`{`、`}`、`<`、反斜杠、`url(`、`image-set(`、`@import` 的值被丢弃，不写进样式表。
- **正文给模型。** 令牌解决“用什么值”，正文解决“什么时候用”。`buildSystemPrompt` 把两者都放进提示词。

## 样式分层

`packages/core/styles/index.css` 声明两个层叠层，两个渲染器发布的 `styles.css` 都是它：

```css
@layer ui-sdk, iui;
```

| 层 | 内容 |
| --- | --- |
| `ui-sdk` | UI SDK 的默认外观 |
| `iui` | Markdown 元素、原语、预置组件、UI SDK 的主题化、动效 |
| 不分层 | 模型在 `<style>` 里写的 CSS |

所有选择器都限定在 `.iui-root` 之内，所以渲染器不会改动宿主页面。模型的 CSS 不分层，因此不需要 `!important` 就能覆盖前两层；它被 `scopeCss` 限定在所属界面上（规则嵌套在界面的选择器里，`@keyframes` 改名），两个界面不会互相影响。

两个需要知道的后果：

- **宿主不分层的 CSS 优先级更高。** 这是层叠层的规则。宿主的全局 reset（`button { color: inherit }`）会影响界面内部。集成文档给出了做法：把 reset 放进一个更早声明的层。
- **`iui` 层的元素选择器要避开 UI SDK 部件。** Markdown 的 `table`、`h2`、`button` 样式都带 `:not([data-slot])`，否则会改掉日历、手风琴标题这些部件的外观。

## 动效

三个来源，一套令牌。

1. **入场。** 顶层块在出现时淡入并上移；`motion`、`delay`、`stagger` 属性调整它。实现是 CSS 动画，时长和缓动取 `surface-enter` 令牌。
2. **状态变化。** UI SDK 部件用 `data-starting-style`、`data-ending-style` 和状态属性做过渡；原语和预置组件用 `transition`。取 `state-change` 和 `layout` 令牌。
3. **位置变化。** `morph="name"` 用 View Transitions API。动作执行时，渲染器给当前完整可见的 morph 元素分配 `view-transition-name`，在 `document.startViewTransition` 的回调里同步提交状态变化，再给新位置上的元素分配名字；过渡结束后清除。

第 3 点的几个细节来自逐帧截图发现的问题：

- 只给完整可见的元素命名。被滚动容器裁掉的元素一旦参与过渡，会在过渡期间画到容器外面。
- 同名元素只取第一个。重名会让整个过渡被浏览器取消。
- 读者正在操作的那个元素的过渡组提到最上层，否则它会从邻居下面穿过去。
- 浏览器不支持时直接更新，没有动画。

`prefers-reduced-motion: reduce` 下，所有动画和过渡的时长降到 1 毫秒，循环动画只播一次。

## 提示词

`packages/core/src/prompt`。`buildSystemPrompt` 把几份指南拼起来：

| 部分 | 内容 |
| --- | --- |
| 语言 | 标记、状态、绑定、动作、逻辑、表达式、查询、自定义组件、样式、SVG |
| 原语与预置组件 | 每个标签的用途和属性 |
| UI SDK | 常用组件给出结构和示例，其余列出名字；`components` 选项控制详略 |
| 动效 | 属性、令牌、规则 |
| 写法 | 先给答案、一卡一事、让它可调、少说、把决定交还 |
| 设计 | DESIGN.md 的令牌名和正文 |
| 工具 | 宿主声明的读、写工具 |

两条约束：

- **提示词里的每个示例都由测试渲染。** 提示词不能教渲染器做不到的事。
- **skill 的参考页由同一份指南生成。** `pnpm generate:skills` 写出 `skills/**/references/` 下的三个文件，测试检查它们没有过期。

## 安全模型

前提：标记由模型写成，模型可能被提示词注入，所以标记按不可信输入处理。

| 风险 | 做法 |
| --- | --- |
| 执行脚本 | 标记是被解释的数据。没有 `eval`；`<script>` 等标签在解析后丢弃；字符串事件属性丢弃 |
| 逃出解释器 | 表达式访问不到 `window`、`document`、原型链；方法是白名单 |
| 卡死页面 | 求值有步数上限；自定义组件嵌套最多 24 层；图表刻度按个数生成，数值再大再密也不会循环不止 |
| 加载外部资源 | CSS 里的 `@import` 和外站 `url()` 被移除；链接和媒体地址按协议过滤，宿主可用 `allowUrl` 收紧 |
| 遮盖宿主页面 | 样式限定在界面内；`position` 只接受关键字，`fixed` 和能代表它的 `var()`、`attr()` 改为 `absolute`；`popover` 属性不在允许之列。界面不裁剪溢出的内容（下拉、提示要伸出去），所以绝对定位加偏移仍然能画到界面的边框之外，只是钉不到窗口上。需要硬边界的宿主给容器加 `overflow: clip` 或 `contain: paint` |
| 模型的选择器伸到界面之外 | 嵌套在界面规则里的选择器通常只匹配界面内部，但写了 `&`（界面自己）就不再是了：`body:has(&) .sidebar`、`:not(&)` 能选中整页；以 `+`、`~` 开头的选择器选中界面后面的兄弟元素。这几类选择器，不论嵌套多深，都在被选中的那个元素上加一个 `:where(界面, 界面 *)` 的条件。规则里嵌套的规则逐条处理，`@scope`、`@layer` 等在任何深度都丢弃 |
| 净化器和浏览器读法不一致 | 检查只有在两边对文本的读法相同时才成立：浏览器不认的一个 `{` 会让界面的规则提前结束，后面的规则就成了全局规则；浏览器不认的一个字符串可以藏一个 `url()`。`scopeCss` 按浏览器的规则读字符串、反斜杠转义（`\{`、`\"`、`u\72l(`）、`url()` 的两种写法和换行符，没有闭合或带多余内容的 `url()` 整个换成 `none`；删掉注释和标签之后重新检查，输出里不会再拼出 `/*` 或 `</style`。行内样式的值不能含有字符串之外的 `;`。SVG 的 `fill`、`filter`、`mask`、`cursor` 等属性按同一套规则检查。这部分用真实的 Chrome 做过对照：把净化后的 CSS 放进页面，界面之外的元素样式不变、没有 `position: fixed`、没有网络请求 |
| 一条回复的样式漏到另一条 | 样式按界面的 id 限定。框架给的 id 只在一个应用或一个根里不重复（Vue 按应用计数，React 在服务端渲染的根之间会重复），所以渲染器在页面范围内再登记一次：id 被别的界面占用时换一个，界面卸载时归还 |
| 经组件改写 DOM | 组件没有声明的属性，Vue 会透传到它的根元素上，并在元素有同名属性（property）时直接赋值；`outerHTML` 能把部件换成任意 HTML，`hostname` 能改掉已经检查过的链接。Vue 渲染器对这类名字只按 HTML 属性（attribute）设置，和 React 对未知属性的处理一致；`innerHTML`、`outerHTML` 在两边都丢弃。`defineAsyncComponent` 的组件按它加载到的组件所声明的属性处理 |
| 绕过 `allowUrl` 加载资源 | UI SDK 组件会把不认识的属性放到自己的元素上。`srcset`、`imagesrcset`、`ping`、`attributionsrc` 一律丢弃；组件上的 `href`、`src`、`poster` 先问 `allowUrl` |
| 动作绕过 `allowUrl` | `open(url)` 这个动作由渲染器用 `window.open` 打开。它和链接走同一个 `allowUrl`：宿主拒绝的地址，按钮也打不开 |
| 函数返回的地址 | `Pagination` 的 `getHref` 是标记里写的函数，组件把它的返回值写成链接的 `href`。React 自己会拦 `javascript:` 地址，Vue、Solid、Svelte 不会。所以这个函数每次被调用，返回值都走和 `href` 相同的检查（协议过滤加 `allowUrl`），不通过就没有 `href` |
| 伸进宿主的表单 | `form` 属性按 id 指向页面上任何一个表单，宿主的也算：控件会把自己的值加进那个表单，`type="submit"` 的按钮会提交它。`form` 在所有元素和组件上都丢弃，不论大小写、是否经 `bind:` 或展开写入。控件要属于某个表单，就写在这个表单里面 |
| 换个写法绕过检查 | 被禁的名字和带地址的名字不论大小写都按同一条规则处理（HTML 元素的属性名不分大小写）；`bind:` 绑定的值和直接写的值走同一套检查，样式、地址、事件名都一样。字符串不会落到 `on` 开头的属性上，否则在 Vue 里会成为内联事件处理器 |
| 借框架的钩子读到宿主 | Vue 的 `onVnodeMounted` 一类属性不是事件，调用时会拿到虚拟节点，顺着它能读到应用上下文。Vue 渲染器在标记能写到的每一处都丢弃这类名字；`ref` 在两边都丢弃 |
| 嵌入其他文档 | `iframe`、`object`、`embed`、SVG `foreignObject` 被丢弃 |
| 越权读写数据 | 标记只能调用宿主传入的工具。工具在读者的会话里运行，宿主应在服务端校验每一次调用 |

渲染器挡不住的：模型写出有误导性的界面，比如按钮文字和它 `send()` 的内容不一致。建议宿主把每次 `send` 的文字作为用户消息显示出来，并把有后果的写操作放在自己控制的工具后面。

这套模型没有经过外部安全审计。

## 测试守着什么

| 测试 | 断言 |
| --- | --- |
| `packages/core/test/markup.test.ts` | 解析结果；任意位置截断都不抛错 |
| `packages/core/test/expr.test.ts` | 表达式语义；访问不到宿主环境 |
| `packages/core/test/surface.test.ts` | 状态、按身份写回、派生值、查询 |
| `packages/core/test/design.test.ts` | DESIGN.md 到 CSS 变量；不安全的值被丢弃；模型 CSS 的作用域 |
| `packages/core/test/prompt.test.ts` | 提示词内容；其中的示例都能解析 |
| `packages/react/test/guide.test.tsx` | 提示词里的每个示例都能渲染，且没有警告 |
| `packages/react/test/claims.test.tsx` | 提示词里的每条承诺（按钮 pending、查询轮询、morph、离场动画等） |
| `packages/react/test/ui-sdk.test.tsx` | UI SDK 55 个入口的官方示例；预置组件不重名；智能体桥 |
| `packages/core/test/renderer.test.ts` | 组件交给标记的值只能是纯数据；按需读取的记录不泄露函数和原型 |
| `packages/vue/test/conformance.test.ts` | 一致性：仓库里的每个示例（六个演示、提示词和文档里的全部示例）分别用 React 和 Vue 渲染，DOM 和警告必须相同 |
| `packages/vue/test/render.test.ts`、`claims.test.ts`、`ui-sdk.test.ts` | React 那三组测试在 Vue 上的对应版本，另加 Vue 特有的部分（`v-model` 式的宿主组件、`.prop` 和 `^attr` 写法不能被标记利用） |
| `apps/playground/test/demos.test.tsx` | 六个演示能渲染、能交互、在任意截断点都能流式显示 |
| `apps/playground/test/docs.test.tsx` | 文档和 skill 里的每个 `iui` 示例；skill 参考页没有过期 |

测试在 jsdom 里运行，不覆盖布局、绘制和动画，一致性测试比较的也只是 DOM。这些是在 Chrome 里用截图检查的，见 [`skills/motion/SKILL.md`](../skills/motion/SKILL.md) 里的截图脚本。
