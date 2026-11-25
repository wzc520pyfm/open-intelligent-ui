# API

## 包和入口 {#packages-and-entry-points}

| 导入路径 | 内容 |
| --- | --- |
| `@open-intelligent-ui/core` | `parse`、`Surface`、`defineLibrary`、`defineComponent`、`defineWidget`、`view`、`librarySpec`、`validateLibrary`、`parseDesign`、`designFromCss`、`colorSources`。不依赖框架 |
| `@open-intelligent-ui/core/prompt` | `buildSystemPrompt`、`describeComponent`、各篇指南和 UI SDK 目录。在服务器上导入 |
| `@open-intelligent-ui/core/check` | `checkMarkup`、`repairMessage`。不需要 DOM |
| `@open-intelligent-ui/core/designs` | `paper`、`noir`、`heritage`、`signal`，都是 DESIGN.md 文本 |
| `@open-intelligent-ui/core/charts` | `echartsCharts`、`g2Charts`；类型 `ChartEngine`、`ChartSpec`、`ChartContext`、`ChartHandle` |
| `@open-intelligent-ui/core/motion` | `motionAdapter`、`gsapAdapter`、`waapiAdapter`、`createMotionAdapter`、`cssKeyframes`、`cubicBezier`；类型 `MotionAdapter`、`MotionPreset`、`MotionTiming` |
| `@open-intelligent-ui/react` | `IntelligentUI`、`preloadUiSdk`，以及再次导出的 `define*` 函数。`/recharts` 里有 `rechartsCharts`；`/styles.css` 是样式表 |
| `@open-intelligent-ui/vue`、`/svelte`、`/solid` | 各框架对应的同一套内容，同样带 `/styles.css` |
| `@open-intelligent-ui/web` | `mount`，以及用来注册 `<intelligent-ui>` 的 `/define`；`/styles.css`，另有 `/elements.css`，给已经加载了其他渲染器样式表的页面用 |
| `open-intelligent-ui` | 不带 scope 的包名。重新导出 `@open-intelligent-ui/core`，连同 `/prompt`、`/check`、`/designs`、`/charts` 和 `/motion` |

## `<IntelligentUI>` {#intelligentui}

每个渲染器的 props 都一样。在 Vue 里，回调是接收函数的 props（`:on-action="fn"`）。在 `<intelligent-ui>` 元素上，文本类选项既是 attribute 也是 property，其余的只是 property，每个回调同时也是一个事件。

| Prop | 类型 | |
| --- | --- | --- |
| `source` | `string` | 标记。`streaming` 期间可以不完整 |
| `streaming` | `boolean` | `source` 还在陆续到达时为 true |
| `design` | `string \| Design` | 一份 DESIGN.md，或用 `parseDesign` 读出来的设计。默认：Paper |
| `scheme` | `"light" \| "dark" \| "auto"` | 用哪套配色。默认 `auto` |
| `library` | `Library` | 产品添加的内容，用 `defineLibrary` 创建 |
| `components` | `Record<string, Component>` | 按名字提供的组件，没有描述，也不做检查。优先用 `library` |
| `tools` | `Record<string, Tool>` | 界面用 `<query>` 读、用 `call()` 写的函数 |
| `callTool` | `(name, input) => unknown` | `tools` 里找不到的工具会调用它 |
| `onAction` | `(action) => boolean \| undefined` | `send`、`open`、`copy`、`toast`。返回 `true` 表示替换默认行为 |
| `onTool` | `(event) => void` | 每次工具调用：先是 `start`，然后是 `done` 或 `error` |
| `onWarning` | `(message) => void` | 渲染过程中发现的问题 |
| `onDiagnostics` | `(diagnostics) => void` | 当前标记的解析问题，带问题代码和位置 |
| `onStateChange` | `(state) => void` | 每次变化之后界面的状态 |
| `initialState` | `Record<string, unknown>` | 初始状态，覆盖声明的值 |
| `functions` | `Record<string, Function>` | 表达式可用的额外纯函数 |
| `actions` | `Record<string, Function>` | 事件处理可用的额外动作 |
| `locale`、`currency` | `string` | 用于数字、日期和货币的格式化 |
| `storage`、`storageKey` | `StorageLike`, `string` | `<state persist>` 的值存放的地方 |
| `allowUrl` | `(url, kind) => boolean` | 返回 `false` 表示拒绝一个链接或媒体地址 |

句柄（React 和 Solid 里是 `ref`，Vue 里是模板引用，Svelte 里是 `bind:this`，web 渲染器里就是元素本身）：

| 方法 | |
| --- | --- |
| `getState()` | 界面的状态，纯数据形式 |
| `setState(values)` | 写入状态，效果和用户自己改的一样 |
| `reset(...names)` | 把状态恢复成声明的值 |
| `refetch(...ids)` | 重新加载指定的查询，不指定则全部重新加载 |

## `buildSystemPrompt` {#buildsystemprompt}

```ts
import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"

const system = buildSystemPrompt(options)
```

| 选项 | |
| --- | --- |
| `library` | 一个 `Library`，或 `librarySpec` 生成的 JSON。它的组件、图表类型、动效预设、设计和说明都会写进提示词 |
| `design` | 没有组件库时用：一份 DESIGN.md 或解析过的设计。默认：Paper |
| `tools` | `[{ name, kind: "read" \| "write", description, input?, output? }]` |
| `components` | 哪些 UI SDK 组件带例子：`"core"`（默认）、`"all"`，或一个列表，比如 `["tabs", "dialog"]`。其余的只列出名字 |
| `motion` | 传 `false` 去掉动效一节。传文本则替换这一节 |
| `instructions` | 产品特有的说明，加在末尾 |

默认提示词大约 34,000 个字符。要缩短它，可以在 `components` 里少列一些组件，设置 `motion: false`，再把 `describeComponent(name, { props: true })` 作为工具提供给模型，让它在需要某个组件的完整描述时调用。

## `checkMarkup` 和 `repairMessage` {#checkmarkup-and-repairmessage}

```ts
import { checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"

const result = checkMarkup(source, options)
const message = repairMessage(result, { limit: 12 })
```

| 选项 | |
| --- | --- |
| `library` | 一个 `Library`，或它的 `librarySpec` JSON |
| `tools` | 宿主能响应的工具：名字，或传给 `buildSystemPrompt` 的那些描述 |
| `components`、`state`、`functions`、`actions` | 宿主作为 `components`、`initialState`、`functions`、`actions` 传给渲染器的内容，或者只传名字 |

`result` 是 `{ ok, errors, warnings, issues }`。每个问题是 `{ code, severity, message, hint?, line, column, excerpt }`。[保证输出正确](../guide/correctness#the-checker)列出了所有代码。

没有可发回的内容时，`repairMessage` 返回空字符串：也就是没有错误，并且没有“设了 `warnings: true` 且存在警告”这种情况。`limit` 限制最多列出多少个问题（默认 12 个）。

## 组件库 {#library}

```ts
import { defineComponent, defineLibrary, defineWidget, librarySpec, validateLibrary, view } from "@open-intelligent-ui/core"
```

| 函数 | |
| --- | --- |
| `defineLibrary({ name, design, components, charts, motion, instructions })` | 产品添加的内容，供渲染器、提示词和检查器使用 |
| `defineComponent({ name, description, props, events, children, example, component })` | 带声明 props 的框架组件。[接入自己的组件](../guide/components#registering-a-component) |
| `defineWidget({ name, description, props, events, example, setup })` | 用 `view()` 渲染的组件，所有渲染器通用。[各渲染器通用的组件](../guide/components#widgets-written-once-for-every-renderer) |
| `validateLibrary(library)` | 组件库有哪些问题，以句子形式给出。没有问题时为空 |
| `librarySpec(library)` | JSON 形式的组件库，给服务器用 |

## 设计 {#design}

```ts
import { colorSources, designFromCss, parseDesign } from "@open-intelligent-ui/core"
```

| 函数 | |
| --- | --- |
| `parseDesign(source, { tokens, roles, prose })` | 读一份 DESIGN.md。这些选项用来补上它没写明的部分。`design.issues` 列出没能读懂的内容 |
| `designFromCss(css, { name, prose })` | 把主题样式表里的变量读成一套设计 |
| `colorSources(design)` | 每个颜色角色取自哪个 token |

## 更底层的接口 {#lower-level}

`parse(source)` 返回文档树，带 `diagnostics`。`Surface` 是由渲染器驱动的状态存储和动作执行器。`@open-intelligent-ui/core/renderer` 里是五个渲染器共用的部分（指令、基础元素、预设组件、图表），给想为其他框架写渲染器的人用。这些接口在同一个次版本内足够稳定，可以在上面构建，但文档不如其他部分详细。
