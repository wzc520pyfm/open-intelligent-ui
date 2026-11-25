# Data, tools and turns

A generated interface that can only show what the model put in it goes stale the moment it is drawn. Tools let it read and write your data directly, and `send()` hands the turn back to the model when a decision needs one.

## Tools

A tool is a function of one argument that returns a value or a promise. You give the renderer the functions and the prompt their descriptions.

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

- `tools` are the functions markup can reach. Only tools you pass exist; markup has no other way to the network.
- `callTool` receives calls to names not in `tools`. Use it to forward to your server or an MCP client.
- `onTool` reports each call as `start`, then `done` or `error`, marked `read` or `write`.

## Reading with a query

`<query>` runs a tool when the interface appears and again whenever its `input` changes. It gives `{ data, loading, error, updatedAt }` under its `id`. Earlier data stays on screen while it reloads. `every` reloads on a timer, in seconds.

The example below runs against an in-memory ticket system on this page.

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

## Writing with a call

`call(tool, input)` in a handler runs a tool once, then reloads every query. It returns the tool's result, so a handler can `await` it. A `<Button>` whose handler awaits stays pending until the handler is done.

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

Tools run in the browser, with the reader's session, on behalf of markup a model wrote. Treat every call as untrusted input: check permissions and validate on the server, describe only tools the reader may use, and confirm destructive writes in your own UI. [Safety](./safety) has more.

## Handing the turn back

`send(text, data)` is how an interface becomes a conversation. The reader adjusts three sliders, presses a button, and the model receives a sentence with the numbers they chose.

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

Press the button: the note under the example is what your `onAction` would receive.

## Actions

`onAction` receives what the interface asks of its host. Return `true` to say you handled it and skip the default.

| `action.type` | Written as | Default |
| --- | --- | --- |
| `send` | `send(text, data)` | None. Add `text` to the conversation as a user message, with `data` and `state` as context, and ask the model again |
| `open` | `open(url)`, links | Opens a new tab, `noopener` |
| `copy` | `copy(text)` | Writes to the clipboard |
| `toast` | `toast(message, tone)` | Shows a toast inside the surface |

Three more act on the surface itself: `call(tool, input)`, `refetch(id)` and `reset(name)`. Add your own with the `actions` prop, and pure functions for expressions with `functions`:

```tsx
<IntelligentUI
  source={text}
  actions={{ track: (name: string) => analytics.track(name) }}
  functions={{ fx: (amount: number, to: string) => amount * rates[to] }}
/>
```

Tell the model about them in `buildSystemPrompt({ instructions })`, and the checker with `checkMarkup(reply, { actions: ["track"], functions: ["fx"] })`.

## Reading and writing state from outside

The handle gives the host the surface's state, for saving a draft or restoring one.

```tsx
const surface = useRef<IntelligentUIHandle>(null)

<IntelligentUI ref={surface} source={text} initialState={saved} onStateChange={save} />

surface.current?.getState()
surface.current?.setState({ guests: 6 })
surface.current?.reset()
surface.current?.refetch("tickets")
```

`<state persist>` values are kept in `storage` under `storageKey` when you pass both, for example `localStorage` and the message id.
