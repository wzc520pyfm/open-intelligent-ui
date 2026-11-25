# IUI 标记规范

IUI 标记是模型写给渲染器的格式：Markdown，加上标签、状态声明和表达式。本文给实现渲染器和接入方看；给模型看的版本是 [`skills/intelligent-ui/references/language.md`](../skills/intelligent-ui/references/language.md)，两者描述同一种语言。

文中标着 `iui` 的代码块都是完整的界面，测试会逐个渲染它们（`apps/playground/test/docs.test.tsx`）。

- [一个例子](#一个例子)
- [文档](#文档)
- [标签](#标签)
- [属性](#属性)
- [声明](#声明)
- [指令](#指令)
- [逻辑块](#逻辑块)
- [表达式](#表达式)
- [动作](#动作)
- [动效属性](#动效属性)
- [流式渲染](#流式渲染)
- [出错时](#出错时)
- [不允许的内容](#不允许的内容)

## 一个例子

```iui
<state nights={3} breakfast={false} />
<derive total={nights * (180 + (breakfast ? 25 : 0))} />

**{nights} nights come to {currency(total)}.**

<card padding={4} gap={3}>
  <row gap={3}>
    <text>Nights</text>
    <spacer />
    <Button aria-label="One night fewer" on:click={if (nights > 1) nights -= 1}><icon name="minus" size="sm" /></Button>
    <text weight="semibold" tabular>{nights}</text>
    <Button aria-label="One night more" on:click={nights += 1}><icon name="plus" size="sm" /></Button>
  </row>
  <label><Switch bind:checked={breakfast}><SwitchThumb /></Switch> Breakfast, {currency(25)} a night</label>
  <Button variant="solid" on:click={send("Book " + nights + " nights", { nights, breakfast, total })}>Book for {currency(total)}</Button>
</card>
```

这里有全部四层：

| 层 | 例子里的写法 | 谁负责 |
| --- | --- | --- |
| 内容 | `**… come to …**` | Markdown |
| 布局与外观 | `<card>`、`<row>`、`<text>` | 原语，读 DESIGN.md 的令牌 |
| 行为 | `<Button>`、`<Switch>` | UI SDK |
| 状态 | `<state>`、`<derive>`、`bind:`、`on:` | 渲染器的状态仓库 |

点加号时不经过模型：`nights` 变了，`total` 重算，标题和按钮上的金额跟着变。只有按下 Book 时，`send()` 才把一句话和当时的数据交还给模型。

## 文档

一份文档是一段 Markdown，其中可以出现标签、`{表达式}` 和逻辑块，三者也可以出现在标签内部。

- Markdown 支持标题、段落、强调、列表、表格、链接、行内代码、围栏代码块、引用和分隔线。
- 行内代码和围栏代码块里的内容原样保留，不解析标签和表达式。围栏代码块渲染成带复制按钮的 `CodeBlock`。
- 文本里的 `{` 开始一个表达式；要输出字面的花括号写 `\{`。
- `<` 后面跟着已知标签名才算标签，所以 `a < b` 仍是文字。
- 整个回复不要包在代码围栏里。接入方可以用 `unwrapFence` 去掉模型多写的围栏。

## 标签

标签名的大小写决定它是什么。

| 写法 | 含义 | 来源 |
| --- | --- | --- |
| 小写，原语 | `box row grid grid-item card title text badge icon divider spacer image link list list-item` | 渲染器 |
| 小写，声明 | `state derive query define slot style` | 渲染器，不产生可见内容 |
| 小写，HTML 与 SVG | `div span table input svg path circle …`，白名单内 | 浏览器 |
| 大写开头 | 组件 | 见下 |

大写开头的名字按这个顺序查找，先找到的生效：

1. 宿主传入的组件（`components`）。
2. 本文档里 `<define>` 的组件。
3. 预置组件：`Chart Stat Number DataTable CodeBlock Skeleton`。
4. UI SDK 的部件（367 个，按需懒加载）。

每个标签都要闭合或自闭合（`<divider />`）。`br hr img input` 以及 `divider spacer icon image slot state derive query` 是空元素，可以不写斜杠。

`<svg>` 内部按 SVG 解析：其中的 `text`、`title`、`image`、`a` 是 SVG 元素，不是原语。

## 属性

| 写法 | 含义 |
| --- | --- |
| `name="text"` | 字符串 |
| `name="Hi {user}"` | 字符串，其中的 `{…}` 在渲染时求值 |
| `name={expression}` | 表达式的值 |
| `{name}` | 等同于 `name={name}` |
| `{...object}` | 展开一个对象的所有属性 |
| `name` | `true` |

原语的属性值是设计令牌而不是具体数值：`gap={3}` 是 3 个间距单位，`color="muted"` 是设计里叫 muted 的颜色，`radius="lg"` 是设计里的大圆角。完整列表见语言参考的 Primitives 一节。

## 声明

声明不产生可见内容，建议放在文档最前面。

### `<state>`

```
<state tab="plan" guests={4} items={[{ name: "Tea", qty: 2, price: 3.5 }]} />
<state notes="" persist />
```

- 每个属性声明一个状态，值是它的初始值。
- 同名状态只在第一次出现时生效，之后的声明被忽略。这条规则保证了流式过程中重新解析不会覆盖读者已经改过的值。
- `persist` 让这个标签里的状态在两次访问之间保留，存到宿主提供的 `storage` 里。
- `reset()` 把状态恢复为声明时的值。

### `<derive>`

```
<derive total={sumBy(items, i => i.qty * i.price)} perGuest={total / guests} />
```

每个属性是一个派生值，它读到的状态或派生值变化时重算。派生值可以互相引用，循环引用会报告警告并得到 `undefined`。派生值只读。

### `<query>`

```
<query id="tasks" tool="listTasks" input={{ status: filter }} />
<query id="price" tool="getQuote" input={{ symbol }} every={30} enabled={symbol != ""} />
```

| 属性 | 含义 |
| --- | --- |
| `id` | 名字。之后用它读结果 |
| `tool` | 宿主提供的工具名 |
| `input` | 传给工具的参数。它的值变化时重新请求 |
| `every` | 自动刷新的间隔，单位秒 |
| `enabled` | 为假时不请求 |

结果是 `{ data, loading, error, updatedAt }`，按 `id` 读取：`tasks.data`、`tasks.loading`。重新请求期间旧数据保留，所以界面不会闪回骨架屏。先发出的请求如果后返回，会被丢弃。

### `<define>`

```
<define name="PlanCard" props="plan, selected">
  <card interactive on:click={choice = plan.id}>
    <title level={3}>{plan.name}</title>
    <slot />
  </card>
</define>
```

声明一个可复用的组件。`props` 列出它接收的属性名；`<slot />` 是调用处子节点的位置。组件内部能读到自己的属性和整个界面的状态。对传进来的对象赋值会写回它所在的状态。

### `<style>`

```
<style>
  .ticket { background: var(--iui-color-surface); border-radius: var(--iui-radius-lg); }
  [data-slot="tabs-tab"][data-selected] { color: var(--iui-color-accent); }
</style>
```

CSS 只作用于当前界面。允许 `@keyframes`、`@media`、`@container`、`@starting-style`；`@import`、指向外站的 `url()` 和未知的 at 规则被移除，`position: fixed` 变成 `absolute`。UI SDK 部件通过 `[data-slot="…"]` 和状态属性来选中。

## 指令

指令是带前缀的属性。

| 指令 | 含义 |
| --- | --- |
| `bind:value={path}` | 双向绑定。读 `path` 作为 `value`，组件回调时写回。对原生输入框和任何有对应回调的组件属性都有效：`bind:checked`、`bind:open`、`bind:pressed`、`bind:page` |
| `on:click={action}` | 事件发生时执行动作。HTML 元素用 DOM 事件名；组件用回调名去掉 `on`（`on:valueChange`）。动作里 `$event` 是事件数据，`$value` 是新值 |
| `class:name={cond}` | 条件为真时加上这个类名 |
| `style:prop={value}` | 设置一个样式属性 |
| `let:name` | 组件把一个值交给子节点时，给它起名。用于 UI SDK 里以函数作为子节点的部件 |

绑定目标可以是路径：`bind:value={form.email}`、`bind:checked={todo.done}`。

`bind:` 到 UI SDK 的映射是机械的：`bind:x={p}` 等于传入 `x={p}` 和一个把新值写回 `p` 的 `onXChange`。宿主组件遵守同一约定即可被绑定。

## 逻辑块

```
{#if items.length == 0}
  <text color="muted">Nothing here yet.</text>
{:else if total > budget}
  <badge color="danger">Over budget</badge>
{:else}
  <badge color="success">On track</badge>
{/if}

{#each items as item, i (item.name)}
  <row><text>{i + 1}. {item.name}</text></row>
{:else}
  <text color="muted">No items.</text>
{/each}

{@const tax = total * 0.08}
```

- `{#each list as item, index (key)}`：`index` 和 `(key)` 可省略。行会增删或重排时应该给 key。`item` 可以解构：`as { name, price }`。
- `{#each 5 as n}` 重复五次，`n` 从 0 到 4。
- `{:else}` 在列表为空时显示。
- 对 `item` 赋值会写回列表：`item.qty += 1`。列表经过 `filter`、`sort` 之后仍然成立，只要其中的项是对象。
- `{@const name = expr}` 在当前块内定义一个局部值。

下面这个例子用到了 `<define>`、`{#each}`、`class:` 和 `<style>`。三张卡片的样子没有任何预置组件，是标记自己定义的：

```iui
<state choice="pro" />
<state plans={[
  { id: "free", name: "Free", price: 0, blurb: "One project, community support." },
  { id: "pro", name: "Pro", price: 12, blurb: "Unlimited projects, priority support." },
  { id: "team", name: "Team", price: 40, blurb: "Shared workspaces and roles." }
]} />
<derive picked={plans.find(p => p.id == choice)} />

<define name="PlanCard" props="plan, selected">
  <card interactive class="plan" class:chosen={selected} on:click={choice = plan.id}>
    <row><title level={3}>{plan.name}</title><spacer /><text weight="semibold">{currency(plan.price)}</text></row>
    <slot />
  </card>
</define>

<style>
  .plan { transition: border-color var(--iui-motion-state-change-duration) var(--iui-motion-state-change-easing); }
  .chosen { border-color: var(--iui-color-accent); }
</style>

<grid columns={3} gap={3}>
  {#each plans as plan (plan.id)}
    <PlanCard {plan} selected={choice == plan.id}><text size="sm" color="muted">{plan.blurb}</text></PlanCard>
  {/each}
</grid>

<Button variant="solid" on:click={send("Switch me to " + picked.name, { plan: picked.id })}>Continue with {picked.name}</Button>
```

## 表达式

表达式是 JavaScript 表达式的一个子集，由解释器求值，不经过 `eval`。

- 字面量、算术、比较、`&& || ?? ?:`、可选链、模板字符串、展开、箭头函数。
- `==`、`!=`、`===`、`!==` 的含义与 JavaScript 相同。
- 列表、文本、数字上的常用方法（`map filter find reduce slice join includes toFixed …`），白名单制。
- 内置函数：数值（`min max sum avg round clamp range`）、格式化（`currency percent compact date relative duration plural …`）、列表（`sortBy groupBy sumBy unique toggle without …`）、其他（`now today addDays uid json`），以及 `Math.*`。完整列表见语言参考。
- 没有 `window`、`document`、`fetch`、定时器，访问不到原型链。
- 有步数上限，死循环会被中止并报告。

## 动作

`on:` 里写的是动作：一条或多条用 `;` 分隔的语句。除了表达式，动作还可以赋值（`=`、`+=`、`++`）、用 `if`/`else`、`const` 和 `await`，并调用下面这些函数。

| 动作 | 作用 |
| --- | --- |
| `send(text, data?)` | 把一句话交还给模型，附带 `data` 和当前全部状态。宿主把它当作用户消息 |
| `call(tool, input?)` | 调用一个会修改数据的工具，完成后重新加载所有 `<query>`，返回工具的结果 |
| `refetch(id?)` | 重新加载一个或全部查询 |
| `reset(name?)` | 把一个或全部状态恢复为声明值 |
| `toast(message, tone?)` | 显示一条短消息 |
| `copy(text)` | 复制到剪贴板 |
| `open(url)` | 在新标签页打开链接 |

赋值不是原地修改：`todo.done = true`、`items.push(x)`、`items.splice(i, 1)` 都会沿路径复制并替换状态里的值，然后通知读过它的地方重新渲染。

动作里有 `await` 时，UI SDK 的 `Button` 会在它完成前保持 pending 状态。

读写后端数据的完整回路：

```iui
<state status="open" />
<query id="tickets" tool="listTickets" input={{ status }} every={30} />

{#if tickets.loading && !tickets.data}
  <Skeleton lines={3} />
{:else if tickets.error}
  <text color="danger">{tickets.error}</text>
{:else}
  {#each tickets.data as ticket (ticket.id)}
    <row gap={3}>
      <text mono color="muted">{ticket.id}</text>
      <text>{ticket.subject}</text>
      <spacer />
      <badge color={ticket.status == "open" ? "warning" : "neutral"}>{ticket.status}</badge>
      <Button size="sm" on:click={await call("updateTicket", { id: ticket.id, status: "solved" }); toast(ticket.id + " solved", "success")}>Solve</Button>
    </row>
  {:else}
    <text color="muted">No {status} tickets.</text>
  {/each}
{/if}
```

模型只写了这一次。之后读者每点一次 Solve，渲染器调用宿主的 `updateTicket`，再重新调用 `listTickets`，列表更新；其间没有模型参与。

## 动效属性

| 属性 | 含义 |
| --- | --- |
| `motion="fade\|rise\|drop\|scale\|slide-left\|slide-right\|blur\|pop"` | 入场方式。`pop` 是强调，一个界面用一次。`none` 关掉默认入场 |
| `motion="draw"` | 用在 SVG 的 `path`、`line`、`circle` 上，描出笔画 |
| `motion="pulse\|spin\|float"` | 循环动画，只用于表示实时状态 |
| `delay={120}` | 入场前等待的毫秒数 |
| `stagger` | 写在父元素上，子元素依次入场。`stagger={80}` 设定间隔 |
| `show={cond}` | 条件变真时入场，变假时带动画离场，离场结束后才从页面移除 |
| `morph="name"` | 给元素一个身份。状态变化使它换了位置时，它滑到新位置而不是跳过去 |

时长和缓动不写在标记里，来自 DESIGN.md 的 `motion` 令牌；CSS 里通过 `var(--iui-motion-<name>-duration)` 和 `-easing` 使用。读者开启“减少动态效果”时，所有动画和过渡缩短到 1 毫秒，循环动画只播一次：内容直接到位，功能不受影响。

```iui
<state open={false} amount={1200} />

<row gap={3} wrap>
  <text size="2xl" weight="semibold"><Number value={amount} format="currency" /></text>
  <spacer />
  <Button on:click={amount += 300}>Add {currency(300)}</Button>
  <Button variant="ghost" on:click={open = !open}>{open ? "Hide" : "Show"} breakdown</Button>
</row>

<card show={open} padding={4} gap={2} stagger>
  <row><text>Rent</text><spacer /><text tabular>{currency(amount * 0.6)}</text></row>
  <row><text>Food</text><spacer /><text tabular>{currency(amount * 0.25)}</text></row>
  <row><text>Other</text><spacer /><text tabular>{currency(amount * 0.15)}</text></row>
</card>
```

## 流式渲染

渲染器在每个数据块到达时重新解析到目前为止的全文。为了让半成品也能看：

- **未闭合的元素保持打开。** `<card>` 还没等到 `</card>` 就已经显示，后续内容继续往里加。
- **半截的标签和表达式被暂缓。** 文本停在 `<Butt` 或 `{items.fil` 时，这一段先不显示，等它写完。等待 `}` 最多暂缓 1200 个字符，超过就当作文字。
- **声明要完整才生效。** `<define>` 和 `<style>` 在闭合之后才注册。
- **状态不回退。** 已存在的状态保留当前值，所以读者在流式过程中拖过的滑块不会被重置。
- **还没加载完的 UI SDK 部件**先显示占位，加载完成后替换。
- **流式期间不显示错误。** 某一块渲染失败时显示占位，下一次解析再试；流结束后仍然失败才显示错误。
- **流式期间不为“还没声明”报警告。** 用到的名字或 `<define>` 组件在流里还没出现时先不报，流结束时仍然缺失才报。声明写在使用之后的回复因此不会在中途闪出警告。

模型侧对应的写作建议是：先写 `<state>`，再写最重要的一块，然后是细节。

## 出错时

原则是坏掉的部分不拖垮其余部分，并且每个问题都有去处（`onWarning`）。

| 情况 | 结果 |
| --- | --- |
| 表达式求值失败 | 该处得到 `undefined`（文字里什么都不显示），报告警告 |
| 未知的大写标签 | 渲染它的子节点，报告“不是已知组件” |
| 未知的小写标签 | 当作文字 |
| 组件渲染时抛错 | 所在的顶层块显示“这一部分无法显示”，其余照常 |
| 工具调用失败 | 查询的 `error` 被设置；`call()` 抛出，按钮恢复 |
| 解析问题 | 记入 `diagnostics`，每条带代码和位置，尽量保留为文字。解析器不抛错 |

模型常按别的语言的习惯写，下面几种写法解析器认得：

| 写法 | 结果 |
| --- | --- |
| `{/* 注释 */}` | 不显示，不报问题 |
| `{open && <card>…</card>}`、`{items.map(i => <row>…</row>)}` | 花括号里不能写标签：按文字显示，报 `tags-in-expression`，提示改用 `{#if}`、`{#each}` |
| `<stack>`、`<heading>` 这类不存在的小写标签 | 按文字显示，报 `unknown-tag` |
| `{count +}` 这类没写完的表达式 | 报 `bad-expression` |
| 正文里的 `{"ok": true}`、`{a; b}` | 是文字，不报问题 |

### 渲染之前先检查

上表是渲染时的行为。回复写完之后、展示之前，可以先用 `@open-intelligent-ui/core/check` 的 `checkMarkup(source, { library, tools })` 检查一遍，它不需要浏览器。返回 `{ ok, issues, errors, warnings }`，每个问题有代码、严重程度、行列、该行原文，以及能说清楚时应该怎么写。`error` 表示用户看到的会和写的不一样（少一块、控件没反应、界面变成了文字）；`warning` 表示写的某样东西被忽略了。

| 代码 | 含义 |
| --- | --- |
| 解析器的代码（`unclosed-tag`、`bad-expression`、`tags-in-expression`、`unknown-tag`、`blocked-tag` 等） | 同解析器的 `diagnostics` |
| `unknown-component` | 大写标签不是库里的组件、预置组件、UI SDK 部件，也没有在回复里 `<define>` |
| `misplaced-part` | UI SDK 的部件写在了它所属的组件之外 |
| `unknown-prop`、`missing-prop`、`wrong-type`、`no-children` | 组件没有这个属性、缺必填属性、值的类型不对、不接受子内容却给了 |
| `unknown-name` | 名字没有被 `<state>`、`<derive>`、`<query>` 或逻辑块声明 |
| `unknown-function` | 语言里没有的函数或方法（`setCount(…)`、`fetch(…)`、`toLocaleDateString()`），或者调用了一个存着值的状态 |
| `bad-write` | 写入派生值或查询结果，或在事件处理之外写入 |
| `bad-handler` | 事件处理或绑定没有写在花括号里（`on:click="…"`、`onclick="…"`），或绑定了不能写入的东西 |
| `unknown-tool` | 宿主没有这个工具，或 `<query>` 无法执行 |
| `unknown-value` | 不存在的图标、动效预设或图表类型 |
| `blocked-url` | 渲染器会拒绝的地址，如 `javascript:` |
| `duplicate-name` | 名字声明了两次，以第一次为准 |
| `fenced` | 界面被包在代码围栏里，会被当作代码显示 |
| `empty` | 什么都画不出来 |

通过派生值写入时，区分两种情况：`<derive next={tasks.find(t => !t.done)} />` 之后 `next.done = true` 改的是状态里的那个任务，允许；`<derive open={tasks.filter(…)} />` 之后 `open.push(…)`，或者给字面量派生值的属性赋值，改的是一个每次重新计算的值，改了也留不住，报 `bad-write`。

`repairMessage(result)` 把这些问题写成发回给模型的下一条消息。完整的修复循环见 [`extending.md`](extending.md#入口一览) 和文档站的“保证输出正确”。

## 不允许的内容

- `script iframe object embed meta base template noscript` 以及 SVG 的 `foreignObject`、`animate` 系列：解析后丢弃，内容不进入页面。
- 字符串形式的事件属性（`onclick="…"`）和 `dangerouslySetInnerHTML` 之类的属性：丢弃。
- 链接只接受 `http`、`https`、`mailto`、`tel` 和相对地址；图片和视频接受 `http`、`https`、`blob:` 和图片类型的 `data:`。宿主可以用 `allowUrl` 进一步收紧。
- 除了[动作](#动作)表里的函数，标记没有其他副作用，也没有其他访问网络的途径。

标记是被解释的数据，从不作为 JavaScript 执行。安全模型的完整说明在 [`architecture.md`](architecture.md#安全模型)。
