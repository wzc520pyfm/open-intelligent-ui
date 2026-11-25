# 扩展与定制

Open Intelligent UI 默认带一份设计（Paper）、一套 CSS 动效、手写 SVG 的图表、六个预置组件和 UI SDK 的全部部件。产品接入时，这五样都可以换掉或加上自己的。本文说明每一样怎么换、换了之后提示词怎么跟上。

- [一个对象，两处使用](#一个对象两处使用)
- [注册自己的组件](#注册自己的组件)
- [预置小组件：写一次，五个渲染器都能画](#预置小组件写一次五个渲染器都能画)
- [提示词怎么跟上](#提示词怎么跟上)
- [换图表引擎](#换图表引擎)
- [换动效引擎](#换动效引擎)
- [换 DESIGN.md](#换-designmd)
- [安全](#安全)
- [入口一览](#入口一览)

## 一个对象，两处使用

所有扩展都放进一个 `Library`。渲染器读它来画，提示词生成器读它来写，两边看到的是同一份定义，所以提示词不会教模型用渲染器没有的东西。

```ts
import { defineLibrary } from "@open-intelligent-ui/core"
import { echartsCharts } from "@open-intelligent-ui/core/charts"
import { motionAdapter } from "@open-intelligent-ui/core/motion"
import { animate } from "motion"
import design from "./brand.DESIGN.md?raw"

export const library = defineLibrary({
  name: "Acme",
  design,                                            // 产品的 DESIGN.md
  components: [OrderCard, Steps, PolicyCheck],       // 自己的组件和小组件
  charts: echartsCharts(() => import("echarts")),    // <Chart> 由谁画
  motion: motionAdapter(animate),                    // 动效由谁播
  instructions: "金额一律用 <Number format=\"currency\">。",
})
```

```tsx
// 前端
<IntelligentUI source={reply} streaming={streaming} library={library} />

// 生成提示词的地方
buildSystemPrompt({ library, tools })
```

五个渲染器都接受 `library`：React、Solid、Svelte 是属性，Vue 是 `:library`，Web Components 是元素的 `library` 属性（property）或 `mount(target, { library })`。

每一项都可以不写。只写 `design` 就只换设计，只写 `charts` 就只换图表。

`library` 在模块顶层定义一次，不要在渲染函数里每次新建：动效适配器换了对象，渲染器会把它当成换了引擎。

## 注册自己的组件

模型可以自由组合原语和 UI SDK 部件，但有些东西必须长得和产品里其他地方一样，或者背后有模型写不出来的逻辑：订单卡片、审批流、座位图。用 `defineComponent` 注册，模型就只能按声明的方式使用它。

```tsx
import { defineComponent } from "@open-intelligent-ui/core"

const OrderCard = defineComponent({
  name: "OrderCard",
  description: "一张订单：状态、金额和收货人。凡是展示订单的地方都用它。",
  props: {
    order: { type: "object", required: true, description: "listOrders 返回的一项。" },
    tone: ["neutral", "urgent"],
    expanded: { type: "boolean", bindable: true },
  },
  events: { open: "卡片被点击；$value 是订单号。" },
  children: "卡片底部的操作按钮。",
  example: `<OrderCard order={order} on:open={picked = $value} />`,
  component: OrderCardView,
})
```

| 字段 | 含义 |
| --- | --- |
| `name` | 标签名，PascalCase。和预置组件或 UI SDK 部件同名时替换它 |
| `description` | 它是什么、什么时候用。模型读的就是这句话 |
| `props` | 接受的属性，三种写法见下 |
| `events` | 它会报告的事件，标记里用 `on:名字` 监听 |
| `children` | `true` 或一句话：标签之间放什么。不写就是不接受子内容 |
| `example` / `examples` | 完整的用法。第一个写进提示词 |
| `component` | 本框架的组件：React 组件、Vue 组件、Solid 组件、Svelte 组件；Web 渲染器里是自定义元素的标签名、`{ tag, properties, events }` 或一个返回 DOM 节点的函数 |
| `prompt: false` | 不写进提示词。用于替换一个提示词里已经讲过的预置组件 |

**属性的三种写法。**

```ts
// 1. 简写：类型名、可选值列表，或完整描述
props: {
  title: "string",
  size: ["sm", "md", "lg"],
  rows: { type: "array", items: { type: "object", properties: { id: "string", total: "number" } }, required: true },
  page: { type: "number", default: 1, bindable: true, description: "当前页。" },
}

// 2. JSON Schema（对象类型）
props: z.toJSONSchema(OrderCardProps)

// 3. 能自己给出 JSON Schema 的 Standard Schema（Zod 4、Valibot、ArkType）
props: OrderCardProps
```

**声明了 `props`，组件就是严格的。** 渲染器只把声明过的属性、事件和绑定传给组件，其余丢弃；类型不对的值丢弃并通过 `onWarning` 报告（`<OrderCard> takes "neutral" | "urgent" for "tone"`）；缺了必填属性也会报告；`default` 在标记没写时补上。标记是模型写的，可能受提示词注入影响，所以组件拿到的只会是它声明过要的东西。`class`、`style`、`motion`、`show`、`aria-*` 和 `data-*` 始终可用。

**事件和绑定。** `on:open` 以 `onOpen` 传给组件（Vue 是 `open` 事件的监听器）。`bindable: true` 的属性可以写 `bind:expanded={x}`，组件通过 `onExpandedChange` 报告变化（Vue 是 `onUpdate:expanded`，所以支持 `v-model:expanded` 的组件直接可用）。

**前后端分开时。** 定义可以不带 `component`，这样服务端引用它不会把 UI 代码带进去；渲染器从 `components` 属性里取同名的实现：

```tsx
// shared/library.ts —— 前后端都引用
export const library = defineLibrary({ components: [defineComponent({ name: "OrderCard", description: "…", props: { … } })] })

// 前端
<IntelligentUI library={library} components={{ OrderCard: OrderCardView }} />
```

原来的 `components` 属性加 `buildSystemPrompt({ hostComponents })` 仍然可用，只是那样描述是手写的，属性也不检查。

## 预置小组件：写一次，五个渲染器都能画

先回答一个问题：内置的预置组件（`Chart`、`Stat`、`Number`、`DataTable`、`CodeBlock`、`Skeleton`）**不是每个框架各写一遍**。它们画什么写在 `packages/core/src/renderer` 里，用的是不依赖框架的"视图"（`view(tag, 属性, 子节点)`），五个渲染器各自只负责把视图变成本框架的元素。需要本地状态的部分（表格排序翻页、数字滚动）每个渲染器有一层很薄的壳。

`defineWidget` 把同一套机制开放出来，连那层壳也不用写：一份定义，五个渲染器画出相同的 DOM。

```ts
import { defineWidget, view } from "@open-intelligent-ui/core"

const Steps = defineWidget<{ items: string[]; current?: number; onSelect?: (index: number) => void }>({
  name: "Steps",
  description: "固定流程走到了哪一步，例如审批或订单。凡是阶段序列都用它，不要自己画。",
  props: {
    items: { type: "array", items: "string", required: true, description: "各阶段，按顺序。" },
    current: { type: "number", default: 0, description: "进行中的阶段的下标。" },
  },
  events: { select: "某个阶段被点击。$value 是它的下标。" },
  example: `<Steps items={["提交", "主管", "财务", "打款"]} current={1} />`,
  setup: () => (props) =>
    view(
      "ol",
      { class: "acme-steps" },
      props.items.map((item, index) =>
        view(
          "li",
          {
            key: index,
            "data-stage": index < (props.current ?? 0) ? "done" : index === props.current ? "current" : "todo",
            on: { click: () => props.onSelect?.(index) },
          },
          [item]
        )
      )
    ),
})
```

`setup` 在组件每个使用位置调用一次，返回画图函数；画图函数在属性变化时再次调用。需要自己的状态时放在闭包里：

```ts
setup: (handle) => {
  let open = false
  handle.cleanup(() => { /* 离开页面时 */ })
  return (props, children) =>
    view("section", {}, [
      view("button", { on: { click: () => { open = !open; handle.redraw() } } }, [props.title]),
      open ? view("div", {}, children) : null,
    ])
}
```

| `handle` 的方法 | 作用 |
| --- | --- |
| `redraw()` | 自己的状态变了，用上次的属性再画一次 |
| `cleanup(fn)` | 离开页面时运行 |
| `attach(fn)` | 拿到自己的一个真实元素（接第三方库时用）。在 `setup` 里调用一次，把返回值放进那个元素的 `pass` |
| `report(message)` | 通过 `onWarning` 报告问题，界面照常工作 |

小组件的样式只用 `--iui-*` 变量，换设计、切深色时不用再管。演示站的 `apps/playground/src/library/product.ts` 有三个完整的例子（`Steps`、`Person`、`PolicyCheck`），"你的组件"那个示例用的就是它们。

什么时候用哪个：能用视图画出来的用 `defineWidget`，一次支持所有框架；要复用已有的框架组件（设计系统里现成的 React 组件）用 `defineComponent`。

## 提示词怎么跟上

思路和 OpenUI 相同：**提示词从组件定义生成，而不是另写一份。** `buildSystemPrompt({ library })` 为每个组件写出一节：

````
# Components from this product

Prefer these over building the same thing yourself.

Each takes only the props, events and bindings listed for it, besides
`class`, `style`, `motion`, `show` and `aria-*`. Anything else is dropped.

### Steps

Where something stands in a fixed sequence, such as an approval or an order. …

- `items`: `string[]`, required. The stages, in order.
- `current`: `number`, default `0`. The index of the stage in progress. …
- `on:select`: A stage was pressed. `$value` is its index.
- Takes no children; self-close it.

```
<Steps items={["Submitted", "Manager", "Finance", "Paid"]} current={1} />
```
````

库里的其他部分各归其位：图表引擎增加的图表类型写进图表一节，动效适配器的自定义预设写进动效一节，`design` 写成设计一节，`instructions` 放在最后。

和 OpenUI 相比多做的三件事：

1. **渲染时也按同一份定义检查。** OpenUI 用 schema 生成提示词；这里同一份 schema 还决定渲染器放行哪些属性，所以提示词说的和渲染器做的不会分叉。
2. **示例会被检查。** `validateLibrary(library)` 解析每个 `example`，检查它用到了这个组件、没有传未声明的属性、没有漏掉必填项、不接受子内容的没有塞子内容；还会报告设计里读不出来的令牌。把它放进测试：

   ```ts
   test("library", () => expect(validateLibrary(library)).toEqual([]))
   ```

3. **可以导出成 JSON 给后端。** 提示词往往在服务端生成，那里不该加载 UI 代码，也可能不是 Node。`librarySpec(library)` 把库变成纯数据（组件的描述、属性、事件、示例，图表和动效的说明，设计），在构建时写成文件：

   ```ts
   // scripts/library-spec.ts，构建时运行
   import { librarySpec } from "@open-intelligent-ui/core"
   import { library } from "../src/library"
   writeFileSync("dist/library.json", JSON.stringify(librarySpec(library)))
   ```

   ```ts
   // 服务端
   import { buildSystemPrompt } from "@open-intelligent-ui/core/prompt"
   const system = buildSystemPrompt({ library: JSON.parse(readFileSync("library.json", "utf8")), tools })
   ```

   这份 JSON 也可以交给别的语言写的服务自己拼提示词，或者放进 CI 里对比，发现组件接口的变化。

## 换图表引擎

`<Chart>` 默认由内置的 SVG 画。换引擎不改标记：模型写的还是 `<Chart type="bar" data={rows} x="month" y="revenue" />`，只是画它的换了。

```ts
import { echartsCharts, g2Charts } from "@open-intelligent-ui/core/charts"

defineLibrary({ charts: echartsCharts(() => import("echarts")) })      // Apache ECharts
defineLibrary({ charts: g2Charts(() => import("@antv/g2")) })          // AntV G2
```

```tsx
import * as Recharts from "recharts"
import { rechartsCharts } from "@open-intelligent-ui/react/recharts"

defineLibrary({ charts: rechartsCharts(Recharts) })                    // 只有 React 渲染器
```

| 适配器 | 渲染器 | 说明 |
| --- | --- | --- |
| `echartsCharts(echarts, options)` | 全部五个 | `renderer: "canvas" \| "svg"`；`option(option, spec)` 在画之前改 ECharts 的 option |
| `g2Charts(g2, options)` | 全部五个 | `options(options, spec)` 在画之前改 G2 的 options |
| `rechartsCharts(recharts, options)` | React | Recharts 本身是 React 组件；颜色直接用设计变量 |

三个适配器共同做的事：

- **引擎可以懒加载。** 传 `() => import("echarts")`，第一张图出现时才下载；也可以直接传模块。
- **跟着设计走。** 颜色、字体、网格线读自 `--iui-*` 变量；切换深色或换设计时重画。
- **比内置多三种图表**：`scatter`、`radar`、`funnel`。提示词会告诉模型 `type` 还能取这些值以及各自的用法。
- **其余行为不变**：`on:select`、`format`、`currency`、`unit`、图例、数值标签、`prefers-reduced-motion`。
- **只接管一部分。** `types: ["bar", "line"]` 让引擎只画这几种，其余仍由内置 SVG 画。Recharts 适配器不画 `spark`，那一种始终留给内置的。
- **`guide`** 给提示词补一段话，例如这个产品里图表的用法约定。

引擎是产品自己的依赖，这里不捆绑：用哪个装哪个。适配器是对着 ECharts 6、G2 5 和 Recharts 3 写和验证的。

**接别的图表库。** 实现 `ChartEngine` 的 `mount`。渲染器已经把标记写的属性整理成 `ChartSpec`：行、类别、系列、解析成 `rgb()` 的颜色、数字格式化函数、主题。

```ts
import type { ChartEngine } from "@open-intelligent-ui/core/charts"

const highcharts: ChartEngine = {
  name: "Highcharts",
  types: ["bar", "line", "area"],                        // 其余交给内置 SVG
  extra: { heatmap: "两个类别维度上的数值：每行一个格子。" },   // 新增的类型，连同给模型的说明
  async mount(element, spec, context) {
    const Highcharts = (await import("highcharts")).default
    const chart = Highcharts.chart(element, toOptions(spec, context))
    return {
      update: (next) => chart.update(toOptions(next, context), true, true),
      destroy: () => chart.destroy(),
    }
  },
}
```

`context.select(index)` 把被点击的行报告给 `on:select`；`context.reducedMotion` 为真时不要播动画。只服务一个框架时，也可以给 `component`（该框架的组件，直接接收标记写的属性）代替 `mount`。

## 换动效引擎

内置动效是 CSS：入场、离场、`stagger`、循环、`morph`（View Transitions）。换成 JS 动效库用适配器：**什么元素在什么时候动，仍然由渲染器决定；适配器只负责让它动。** 所以标记不变，`motion="rise"`、`stagger`、`show`、`morph` 的含义不变，流式到达、离场后移除、`prefers-reduced-motion` 这些也不用适配器操心。

```ts
import { gsapAdapter, motionAdapter, waapiAdapter } from "@open-intelligent-ui/core/motion"

import { animate } from "motion"
defineLibrary({ motion: motionAdapter(animate) })                          // Motion（motion.dev）

import gsap from "gsap"
defineLibrary({ motion: gsapAdapter(gsap, { eases: { emphasis: "back.out(1.7)" } }) })   // GSAP

defineLibrary({ motion: waapiAdapter() })                                  // Web Animations API，无依赖
```

| 适配器 | 特点 |
| --- | --- |
| `motionAdapter(animate, { transitions })` | `pop` 和 `morph` 默认用弹簧；`transitions` 按动作种类覆盖，例如 `{ enter: { type: "spring", bounce: 0.2 } }`，传 `false` 则沿用设计的缓动 |
| `gsapAdapter(gsap, { eases })` | 默认严格按设计的贝塞尔曲线；`eases` 按种类换成 GSAP 自己的缓动 |
| `waapiAdapter()` | 和内置 CSS 动得一样，但由脚本驱动。适合只想加几个自定义预设、不想多一个依赖的情况 |

适配器是对着 Motion 14 和 GSAP 3 写和验证的。时长和缓动仍然取自 DESIGN.md 的 `motion` 令牌，所以换引擎不会让节奏偏离设计。`morph` 默认改用 FLIP（由引擎把元素从旧位置移到新位置），传 `morph: "view-transition"` 则继续交给浏览器。

**自定义预设。** 每个适配器都接受 `presets`：名字、给模型看的说明、关键帧。提示词的动效一节会列出它们，模型就可以写 `motion="flip-in"`。

```ts
motionAdapter(animate, {
  presets: {
    "flip-in": {
      description: "翻转着出现。用于刚刚揭晓的结果，一次回复最多一处。",
      keyframes: { opacity: [0, 1], rotate: [-8, 0], scale: [0.9, 1] },
      token: "emphasis",
      transition: { type: "spring", bounce: 0.35 },     // 原样交给引擎
    },
  },
})
```

关键帧是与引擎无关的数字（`opacity`、`x`、`y`、`scale`、`rotate`、`blur`、`strokeDashoffset`），适配器翻译成引擎自己的写法。标记只能按名字引用预设，不能自己写关键帧。

**接别的动效库。** 整个约定是一个 `animate` 函数：在这个元素上，用这些关键帧和这个时间播放，并说明什么时候结束。

```ts
import { createMotionAdapter, cssKeyframes } from "@open-intelligent-ui/core/motion"
import { animate } from "animejs"

const anime = createMotionAdapter({
  name: "Anime.js",
  animate(element, keyframes, timing) {
    const animation = animate(element, {
      ...cssKeyframes(keyframes),
      duration: timing.duration,
      delay: timing.delay,
      loop: timing.repeat,
      alternate: timing.alternate,
    })
    return { finished: animation.then(), cancel: () => animation.revert() }
  },
})
```

`timing` 里有种类（`enter`、`exit`、`emphasis`、`draw`、`layout`、`loop`）、预设名、毫秒数、CSS 缓动以及拆好的贝塞尔控制点。两个可选的标志：

- `startsOnPaint`：引擎的时钟是否从元素第一次被画出来那一帧开始（CSS 和 WAAPI 是）。用脚本计时的引擎不是，页面忙着画的时候动画已经走了一半；对这类引擎，渲染器会先把要入场的元素藏住，等页面画过一帧再开始。默认 `false`。
- `writesStyle`：引擎是否在元素上留下行内样式。为真时渲染器在入场结束后恢复原样。默认 `true`。

`guide` 可以整段替换提示词的动效一节；多数情况不需要，因为标记的写法没变。

## 换 DESIGN.md

`design` 一直可以传任何一份 DESIGN.md。这次补上的是**为别的组件库写的 DESIGN.md**：它们往往没有令牌的 YAML，颜色名字的含义不同，正文里是另一个库的类名和安装步骤。

**直接传。** 文件里没有令牌 YAML 时，`parseDesign` 会从它记录的 CSS 变量里读出令牌：表格（变量名一列、浅色值一列、深色值一列）、行内的 `` `--name: value` ``、`css` 代码块。HeroUI 官方发布的 DESIGN.md 就是这种写法，不用改就能用：

```ts
import heroui from "./heroui.DESIGN.md?raw"

defineLibrary({ design: heroui })
```

包里自带的四套设计也可以直接引入，不必从仓库里复制文件：

```ts
import { paper, noir, heritage, signal } from "@open-intelligent-ui/core/designs"

defineLibrary({ design: noir })
```

读到的包括浅色和深色两套颜色、`--radius`、`--spacing`、字体。`oklch()`、`hsl()`、`color-mix()` 和 `var(--x)` 引用都认。

**按需调整。** `parseDesign(source, options)` 有三个选项，返回的 `Design` 可以直接给 `design`：

```ts
import { parseDesign } from "@open-intelligent-ui/core"

const design = parseDesign(heroui, {
  // 盖在文件声明的令牌之上：补它没有的（动效），或补它只提到名字的颜色
  tokens: {
    colors: { eclipse: "oklch(0.2103 0.0059 285.89)", snow: "oklch(0.9911 0 0)" },
    motion: { emphasis: { duration: "420ms", timingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" } },
  },
  // 这份设计的哪个颜色充当哪个角色
  roles: { primary: "accent", "muted-foreground": "muted" },
  // 模型读到的正文：去掉另一个库的安装和用法章节
  prose: { omit: ["Setup", "Source of Truth"] },
})
```

- **角色。** 渲染器的样式用固定的一组角色（`background`、`surface`、`foreground`、`muted`、`muted-foreground`、`border`、`primary`、`accent`、`success`、`warning`、`danger`、`info`、`chart-1…6` 和各自的 `-foreground`）。同名的令牌直接对上；常见的别名自动识别（shadcn 的 `card`、`destructive`，Material 的 `on-primary`）；`muted` 在一份设计里是文字色还是底色，按它和页面底色的明度差判断。判断不对或名字完全不同时用 `roles` 指定。`colorSources(design)` 返回每个角色最终取自哪个令牌。
- **正文。** 为别的库写的设计，提示词会先告诉模型：只取它在层次、颜色、形状、语气上的方向，它的类名、组件名和安装步骤在这里不适用。`prose.omit` 按标题删掉整节，传函数则自己改写。
- **问题。** 读不出来的值不会抛错，记在 `design.issues` 里，`validateLibrary` 会一并报告。

**只有样式表，没有 DESIGN.md。** `designFromCss` 读一份主题 CSS（shadcn/ui、HeroUI、Tailwind `@theme`、自己的变量表）：

```ts
import { designFromCss } from "@open-intelligent-ui/core"
import theme from "./theme.css?raw"

const design = designFromCss(theme, {
  name: "Acme",
  prose: "主色只用于每个界面里最重要的一个操作。",
})
```

`:root`、`html`、`@theme` 里的变量是浅色，`.dark`、`[data-theme="dark"]`、`@media (prefers-color-scheme: dark)` 里的是深色，其他选择器里的忽略。`210 40% 98%` 这种不带函数名的 HSL 三元组（shadcn 的旧写法）按 `hsl()` 读。

`design/third-party/` 收着 HeroUI 的原文件，演示站的设计选单里有它；测试用它保证"拿来就能用"一直成立。

## 安全

扩展点都是宿主的代码，但经过它们的数据来自模型。各处的界线：

| 扩展点 | 标记能做的 | 标记不能做的 |
| --- | --- | --- |
| 组件、小组件 | 按名字使用；传声明过且类型相符的属性 | 传未声明的属性；让组件收到 `ref`、`innerHTML` 一类；带地址的属性仍然先过协议过滤和 `allowUrl` |
| 图表引擎 | 写 `<Chart>` 的属性 | 写引擎的原始配置。适配器的提示框用 DOM 节点拼出来，标签文字不会被当成 HTML |
| 动效适配器 | 按名字引用预设 | 写关键帧、时长之外的引擎参数 |
| 设计 | 无（设计由宿主给） | 设计里的值照样过 CSS 净化：不能安全写进 CSS 的值（例如带 `url()` 或想提前结束声明的）丢弃并记入 `issues` |

自己写组件、引擎时要守的两条：属性里的文字一律当文本用，不要拼进 HTML；`ChartSpec.props` 是标记的原样属性，要用就自己检查。

## 入口一览

| 从哪里引入 | 有什么 |
| --- | --- |
| `@open-intelligent-ui/core` | `defineLibrary`、`defineComponent`、`defineWidget`、`view`、`librarySpec`、`validateLibrary`；`parseDesign`、`designFromCss`、`colorSources` |
| `@open-intelligent-ui/core/prompt` | `buildSystemPrompt({ library })` |
| `@open-intelligent-ui/core/charts` | `echartsCharts`、`g2Charts`；类型 `ChartEngine`、`ChartSpec`、`ChartContext`、`ChartHandle` |
| `@open-intelligent-ui/core/motion` | `motionAdapter`、`gsapAdapter`、`waapiAdapter`、`createMotionAdapter`、`cssKeyframes`、`cubicBezier`；类型 `MotionAdapter`、`MotionPreset`、`MotionTiming` |
| `@open-intelligent-ui/react/recharts` | `rechartsCharts` |
| `@open-intelligent-ui/core/designs` | `paper`、`noir`、`heritage`、`signal`：四份 DESIGN.md 的原文 |
| `@open-intelligent-ui/core/check` | `checkMarkup`、`repairMessage`；类型 `CheckOptions`、`CheckResult`、`Issue`、`IssueCode` |

注册了自己的组件之后，把同一个 `library` 交给检查器，它就按你声明的属性来查模型写的标记：

```ts
import { checkMarkup, repairMessage } from "@open-intelligent-ui/core/check"

let reply = await model(messages)
let result = checkMarkup(reply, { library, tools })
for (let round = 0; !result.ok && round < 2; round++) {
  messages.push({ role: "assistant", content: reply }, { role: "user", content: repairMessage(result) })
  reply = await model(messages)
  result = checkMarkup(reply, { library, tools })
}
```

每个渲染器包也重导出 `defineLibrary`、`defineComponent`、`defineWidget`、`librarySpec` 等，只装一个包时不必再单独引 core。
