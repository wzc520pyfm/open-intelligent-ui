# 数据、工具与回合

生成的界面如果只能显示模型写进去的内容，画出来的那一刻就过时了。工具让它直接读写你的数据；某个决定需要模型再参与时，`send()` 把回合交回给模型。

## 工具 {#tools}

工具是只接收一个参数的函数，返回一个值或一个 promise。函数交给渲染器，函数的描述交给提示词。

```tsx
<IntelligentUI
  source={text}
  tools={{
    listTickets: (input) => api.get("/tickets", input),
    updateTicket: (input) => api.post("/tickets/update", input),
  }}
  callTool={(name, input) => mcp.callTool(name, input)}
  onTool={(event) => audit(event)}
/>
```

```ts
buildSystemPrompt({
  tools: [
    { name: "listTickets", kind: "read", description: "Support tickets, most urgent first.", input: '{ status?: "open" | "pending" | "solved" }', output: "[{ id, subject, customer, priority, status }]" },
    { name: "updateTicket", kind: "write", description: "Changes a ticket's status.", input: '{ id: string, status?: string }' },
  ],
})
```

- `tools` 是标记能调用到的函数。只有你传入的工具才存在，标记没有别的途径访问网络。
- `callTool` 接收对不在 `tools` 里的名字的调用。用它转发给你的服务器或 MCP 客户端。
- `onTool` 报告每一次调用：先是 `start`，然后是 `done` 或 `error`，并标明是 `read` 还是 `write`。

## 用查询读取 {#reading-with-a-query}

`<query>` 在界面出现时运行一个工具，之后每当它的 `input` 变化就再运行一次。它在自己的 `id` 下提供 `{ data, loading, error, updatedAt }`。重新加载期间，之前的数据留在屏幕上。`every` 按定时器重新加载，单位是秒。

下面的例子跑在这个页面上的一个内存工单系统上。

```iui live
<state status="open" />
<query id="tickets" tool="listTickets" input={{ status }} />

<box gap={3}>
  <SegmentedControl aria-label="Status" bind:value={status}>
    <SegmentedControlIndicator />
    <SegmentedControlItem value="open">Open</SegmentedControlItem>
    <SegmentedControlItem value="pending">Pending</SegmentedControlItem>
    <SegmentedControlItem value="solved">Solved</SegmentedControlItem>
  </SegmentedControl>

  {#if tickets.loading && !tickets.data}
    <Skeleton lines={4} />
  {:else if tickets.error}
    <text color="danger">{tickets.error}</text>
  {:else}
    <DataTable
      data={tickets.data}
      rowKey="id"
      pageSize={4}
      columns={["id", "subject", { key: "priority", label: "Priority", badge: { urgent: "danger", normal: "neutral", low: "neutral" } }, { key: "waiting", label: "Waiting", format: "duration", align: "right" }]}
    />
  {/if}
</box>
```

## 用调用写入 {#writing-with-a-call}

事件处理里的 `call(tool, input)` 运行一次工具，然后重新加载所有查询。它返回工具的结果，所以事件处理可以 `await` 它。如果 `<Button>` 的事件处理里有 await，按钮会一直处于等待状态，直到事件处理执行完。

```iui live
<query id="tickets" tool="listTickets" input={{ status: "open" }} />

<box gap={2}>
  {#if tickets.data}
    {#each tickets.data.slice(0, 3) as ticket (ticket.id)}
      <card padding={3}>
        <row gap={3} wrap>
          <box gap={0} flex={1} minWidth={200}>
            <text weight="medium">{ticket.subject}</text>
            <text size="sm" color="muted">{ticket.customer} · waiting {duration(ticket.waiting)}</text>
          </box>
          <Button on:click={await call("updateTicket", { id: ticket.id, status: "solved" }); toast(ticket.id + " solved", "success")}>Mark solved</Button>
        </row>
      </card>
    {:else}
      <text color="muted">The open queue is empty.</text>
    {/each}
  {:else}
    <Skeleton lines={3} />
  {/if}
</box>
```

工具在浏览器里运行，用的是用户的会话，替模型写的标记办事。把每次调用都当作不可信输入：在服务器上检查权限并做校验，只描述用户有权使用的工具，破坏性的写入要在你自己的 UI 里确认。更多内容见[安全](./safety)。

## 把回合交回去 {#handing-the-turn-back}

界面靠 `send(text, data)` 变成对话。用户做完选择，按下按钮，模型就收到一句话，里面带着用户选的数字。

```iui live
<state seats={8} plan="team" />
<derive monthly={seats * (plan == "team" ? 12 : 29)} />

<card padding={4} gap={3}>
  <row gap={3} wrap>
    <SegmentedControl aria-label="Plan" bind:value={plan}>
      <SegmentedControlIndicator />
      <SegmentedControlItem value="team">Team</SegmentedControlItem>
      <SegmentedControlItem value="business">Business</SegmentedControlItem>
    </SegmentedControl>
    <NumberInput min={1} max={50} bind:value={seats}>
      <NumberInputGroup>
        <NumberInputDecrement aria-label="One seat fewer">−</NumberInputDecrement>
        <NumberInputControl aria-label="Seats" />
        <NumberInputIncrement aria-label="One seat more">+</NumberInputIncrement>
      </NumberInputGroup>
    </NumberInput>
    <spacer />
    <text size="xl" weight="semibold" tabular>{currency(monthly)} / month</text>
  </row>
  <row>
    <Button variant="solid" on:click={send("Upgrade to " + capitalize(plan) + " with " + seats + " seats", { plan, seats, monthly })}>Upgrade to {capitalize(plan)}</Button>
  </row>
</card>
```

按一下按钮：例子下方的说明就是你的 `onAction` 会收到的内容。

## 动作 {#actions}

`onAction` 接收界面向宿主提出的请求。返回 `true` 表示你已经处理了，默认行为会被跳过。

| `action.type` | 写法 | 默认行为 |
| --- | --- | --- |
| `send` | `send(text, data)` | 无。把 `text` 作为用户消息加入对话，附上 `data` 和 `state` 作为上下文，然后再次请求模型 |
| `open` | `open(url)`、链接 | 打开新标签页，带 `noopener` |
| `copy` | `copy(text)` | 写入剪贴板 |
| `toast` | `toast(message, tone)` | 在这块界面内显示一条 toast |

另外三个作用于这块界面本身：`call(tool, input)`、`refetch(id)` 和 `reset(name)`。用 `actions` prop 添加你自己的动作，用 `functions` 添加给表达式用的纯函数：

```tsx
<IntelligentUI
  source={text}
  actions={{ track: (name: string) => analytics.track(name) }}
  functions={{ fx: (amount: number, to: string) => amount * rates[to] }}
/>
```

用 `buildSystemPrompt({ instructions })` 把它们告诉模型，用 `checkMarkup(reply, { actions: ["track"], functions: ["fx"] })` 把它们告诉检查器。

## 从外部读写状态 {#reading-and-writing-state-from-outside}

宿主通过句柄拿到这块界面的状态，可以用来保存草稿或恢复草稿。

```tsx
const surface = useRef<IntelligentUIHandle>(null)

<IntelligentUI ref={surface} source={text} initialState={saved} onStateChange={save} />

surface.current?.getState()
surface.current?.setState({ guests: 6 })
surface.current?.reset()
surface.current?.refetch("tickets")
```

`<state persist>` 的值保存在 `storage` 里，前提是 `storage` 和 `storageKey` 这两个 prop 你都传了，例如 `storage={localStorage}`，并把消息 id 作为 `storageKey`。它们存成一条 JSON，条目名是 `iui:` 加上这个 key。
