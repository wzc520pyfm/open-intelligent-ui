# 动效

动效用来说明发生了什么变化。哪个元素动、什么时候动，由渲染器决定：一个块随流式输出到达时，面板显示或隐藏时，状态把一个元素从一处移到另一处时。时长和缓动由设计决定。负责播放动画的部分可以替换。

## 内置 {#built-in}

不做任何配置时，动效用 CSS 实现。块在写出来的同时淡入并上升，UI SDK 的弹出层和标签页带动画，图表以生长的方式出现，`<Number>` 和 `<Stat>` 会滚动到新的数值。标记用五个属性添加动效。

| 属性 | 作用 |
| --- | --- |
| `motion="…"` | 元素怎么入场：`fade`、`rise`、`drop`、`scale`、`slide-left`、`slide-right`、`blur`、`pop`。`none` 关掉默认动效 |
| `motion="draw"` | 把 SVG `<path>`、`<line>` 或 `<circle>` 的描边一笔画出来 |
| `motion="pulse\|spin\|float"` | 循环，只用于实时状态 |
| `stagger` | 写在父元素上，让子元素一个接一个入场。`stagger={80}` 设置间隔，单位是毫秒 |
| `show={condition}` | 条件变为 true 时入场，变为 false 时带着动画离场 |
| `morph="name"` | 共享的身份：状态把元素移到别处时，它在两个位置之间滑过去 |
| `delay={120}` | 等待，单位是毫秒 |

```iui live
<state view="stats" order={["Design", "Build", "Ship"]} />

<row gap={2} wrap>
  <SegmentedControl aria-label="View" bind:value={view}>
    <SegmentedControlIndicator />
    <SegmentedControlItem value="stats">Stagger</SegmentedControlItem>
    <SegmentedControlItem value="panel">Show and hide</SegmentedControlItem>
    <SegmentedControlItem value="morph">Morph</SegmentedControlItem>
  </SegmentedControl>
</row>

<grid columns={3} gap={3} stagger show={view == "stats"}>
  <Stat label="Visitors" value={18420} delta={0.08} />
  <Stat label="Sign-ups" value={612} delta={0.21} />
  <Stat label="Paid" value={87} delta={-0.04} />
</grid>

<card padding={4} gap={2} show={view == "panel"} motion="blur">
  <row gap={2}><icon name="circle-check" color="success" /><text weight="medium" motion="pop">Deployed in 42 seconds</text></row>
  <svg viewBox="0 0 200 40" height="40" role="img" aria-label="Build time trend">
    <path motion="draw" d="M4 30 C40 8, 70 34, 100 20 S160 6, 196 14" fill="none" stroke="var(--iui-color-accent)" stroke-width="2.5" stroke-linecap="round" />
  </svg>
</card>

<box gap={2} show={view == "morph"}>
  <row gap={2} wrap>
    {#each order as step (step)}
      <card padding={3} morph="step-{step}"><text weight="medium">{step}</text></card>
    {/each}
  </row>
  <row><Button on:click={order = order.toReversed()}>Reverse the order</Button></row>
</box>
```

时长和缓动来自设计的 `motion` token：`state-change`、`surface-enter`、`surface-exit`、`layout` 和 `emphasis`。模型写的 CSS 用的是同一批 token，写成 `var(--iui-motion-layout-duration)` 和 `var(--iui-motion-layout-easing)`。`prefers-reduced-motion` 会被遵守，模型和宿主都不用做任何事。没有配置适配器时，`morph` 用 View Transitions；不支持它的浏览器会原地替换元素。

## 用你自己的动效库 {#using-your-motion-library}

动效适配器放在[组件库](./components#one-library-two-readers)里。动什么、什么时候动，仍然由渲染器决定，适配器负责让它动起来。标记不变。流式到达、离场后的移除和减弱动效，都不用适配器操心。

```ts
import { defineLibrary } from "@open-intelligent-ui/core"
import { gsapAdapter, motionAdapter, waapiAdapter } from "@open-intelligent-ui/core/motion"

import { animate } from "motion"
defineLibrary({ motion: motionAdapter(animate) })                                       // Motion (motion.dev)

import gsap from "gsap"
defineLibrary({ motion: gsapAdapter(gsap, { eases: { emphasis: "back.out(1.7)" } }) })  // GSAP

defineLibrary({ motion: waapiAdapter() })                                               // Web Animations API
```

| 适配器 | 特点 |
| --- | --- |
| `motionAdapter(animate, { transitions })` | `pop` 和 `morph` 默认用弹簧。`transitions` 按种类覆盖，例如 `{ enter: { type: "spring", bounce: 0.2 } }`；`false` 保留设计的缓动 |
| `gsapAdapter(gsap, { eases })` | 默认严格按设计的贝塞尔曲线走。`eases` 按种类换成 GSAP 自己的缓动 |
| `waapiAdapter()` | 动起来和内置的 CSS 一样，由脚本驱动，没有依赖。适合用来添加预设 |

时长和缓动仍然来自设计，所以换引擎不会改变节奏。用了适配器之后，`morph` 默认用 FLIP（引擎把元素从旧位置移到新位置）；`morph: "view-transition"` 则把它交给浏览器。这些适配器是对照 Motion 14 和 GSAP 3 编写并检查的。

## 你自己的预设 {#your-own-presets}

每个适配器都接受 `presets`：一个名字、一段给模型看的描述，以及关键帧。提示词的动效一节会列出它们，所以模型可以写 `motion="flip-in"`。

```ts
motionAdapter(animate, {
  presets: {
    "flip-in": {
      description: "Turns into view. For a result that was just revealed; once per reply at most.",
      keyframes: { opacity: [0, 1], rotate: [-8, 0], scale: [0.9, 1] },
      token: "emphasis",
      transition: { type: "spring", bounce: 0.35 },   // 原样交给引擎
    },
  },
})
```

关键帧是与引擎无关的数字：`opacity`、`x`、`y`、`scale`、`rotate`、`blur`、`strokeDashoffset`。标记按名字引用预设。它不能写关键帧、时长或引擎选项。

## 其他动效库 {#another-motion-library}

整个约定只有一个 `animate` 函数：按这组时间参数，在这个元素上播放这些关键帧，并在播完时告知。

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

`timing` 里有种类（`enter`、`exit`、`emphasis`、`draw`、`layout`、`loop`）、预设的名字、毫秒数、CSS 缓动和它的贝塞尔控制点。另有两个可选的标志用来描述引擎：

- `startsOnPaint`：引擎的时钟是否从元素第一次被绘制的那一帧开始计时，CSS 和 Web Animations API 就是这样。由脚本计时的引擎不是这样，所以渲染器会把正在入场的元素先藏起来，等页面绘制过一次再显示。默认 `false`。
- `writesStyle`：引擎是否会在元素上留下内联样式。为 true 时，渲染器在入场结束后把元素恢复原状。默认 `true`。

## 设计动效 {#designing-motion}

仓库里有一个给 agent 用的动效 skill，`skills/motion`，里面有哪种变化配哪种动效的规则，还有逐帧审查动画的方法。简版写在提示词里：只对 `opacity`、`translate`、`scale` 和 `rotate` 做动画；移动距离要短；一个界面只强调一处；除非是在报告实时状态，否则什么都不循环；绝不让用户等动画播完才能操作。
