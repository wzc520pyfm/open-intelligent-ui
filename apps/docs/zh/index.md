---
layout: home
title: Open Intelligent UI
titleTemplate: 让模型来写界面

hero:
  name: Open Intelligent UI
  text: 让模型来写界面
  tagline: 模型写的是混着标签的 Markdown，渲染器把这段流式到达的文本变成有状态、有数据、有动效的界面。行为来自 UI SDK，外观来自你的 DESIGN.md。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh/guide/start
    - theme: alt
      text: 标记语言
      link: /zh/guide/markup
    - theme: alt
      text: GitHub
      link: https://github.com/wzc520pyfm/open-intelligent-ui

features:
  - title: 是写出来的，不是从目录里挑的
    details: 模型用布局基础元素、55 个 UI SDK 行为、图表、内联 SVG 和带作用域的 CSS 来组合界面。它能做出什么，不受“有人注册过哪些组件”的限制。
    link: /zh/guide/markup
  - title: 用你的设计系统
    details: 传入一份 DESIGN.md，可以是你自己的，也可以是为别的组件库写的。其中的 token 变成 CSS 变量，文字说明进入提示词。包里自带四套设计。
    link: /zh/guide/design
  - title: 你的组件、图表和动效
    details: 注册带 props 声明的组件，用 ECharts、G2 或 Recharts 画图表，用 Motion 或 GSAP 播放动效。提示词和渲染器读的是同一份定义。
    link: /zh/guide/components
  - title: 先检查，再展示
    details: 检查器按渲染器的方式读一遍回复，逐行指出每个错误。把它生成的消息发回给模型，模型自己改正。
    link: /zh/guide/correctness
  - title: 状态和数据不需要再问模型
    details: 标记里声明状态，用查询读你的工具，用调用写回去。拖一下滑块、保存一行数据，都不消耗一个回合。
    link: /zh/guide/data
  - title: 五个渲染器，同一种标记
    details: React、Vue、Svelte、Solid 和 Web Components 渲染的是同一份回复。标记被当作数据解释，从不作为代码执行。
    link: /zh/guide/start
---

## 一份回复，画出来是这样 {#a-reply-drawn}

下面是模型写的内容，以及用户看到的结果。拖动滑块、切换设计，或者重新流式播放一遍，看它是怎么到达的。

```iui live designs
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

- `<state>` 和 `<derive>` 分别是界面记住的东西，和由此算出来的东西。
- `<Slider>` 是 UI SDK 的行为。`bind:value` 把它绑到状态上，所以拖动时句子、圆环和按钮一起更新，不需要调用模型。
- 圆环不是组件，是模型自己画的 SVG，颜色和过渡时间用的是设计里的 token。
- `send()` 把用户的决定连同他选的数字交回给模型。
