# Safety

Markup is data the renderer interprets. It is never evaluated as JavaScript. This page lists what markup can and can't do, and what remains the host's job.

## What markup can't do

- **Run code.** Expressions run in an interpreter with no access to `window`, `document`, `fetch`, timers or `eval`, and no way to reach object prototypes.
- **Bring its own script or frame.** `<script>`, `<iframe>`, `<object>`, `<embed>`, `<meta>`, `<base>`, `<template>`, SVG `<foreignObject>` and string event attributes (`onclick="…"`) are dropped.
- **Link anywhere.** Links accept `http`, `https`, `mailto`, `tel` and relative URLs. Images and video accept `http`, `https`, `blob:` and image `data:` URLs. `allowUrl` narrows that, for example to your own domains, and is asked about `open(url)` too.
- **Join your forms.** The `form` attribute is dropped everywhere, so a control can't join a form of yours by its id.
- **Style your page.** `<style>` is scoped to its surface. `@import`, `url()` to other sites and unknown at-rules are removed, and `position: fixed` becomes `absolute`, so a surface can't draw over your page.
- **Reach a component's internals.** A registered component receives only the props it declared. Markup can't pass `ref` or `innerHTML`.
- **Configure an engine.** Markup writes `<Chart>`'s props and names motion presets. It can't write a chart engine's raw options or keyframes.

The only side effects are the actions: `send`, `call`, `refetch`, `reset`, `toast`, `copy`, `open`, and any you add with `actions`.

## What is the host's job

**Authorize tool calls.** Tools run in the browser with the reader's session, on behalf of markup a model wrote. A model can be steered by text in its context, so treat every call as untrusted input:

- Check permissions and validate input on the server.
- Describe to the model only the tools the reader may use.
- Confirm destructive writes in your own UI when the stakes are high.

**Show what was sent.** A model can write a button whose label doesn't match what it sends. Show the text of a `send` as a user message in the conversation, so the reader sees what was said on their behalf.

**Narrow URLs if you need to.** `allowUrl={(url, kind) => …}` is called for every link and media address.

## CSS and your page

The stylesheet uses two cascade layers, `ui-sdk` then `iui`, and everything in it is confined to `.iui-root`. Your page is not restyled.

The reverse needs care: CSS outside any layer beats layered CSS, so an unlayered reset such as `button { color: inherit }` overrides the renderer inside the surface. Put resets in a layer declared first:

```css
@layer reset, ui-sdk, iui;

@layer reset {
  button { font: inherit; color: inherit; }
}
```

With Tailwind 4 the page's styles are already layered. Name their layers first so the surface's come last:

```css
@layer theme, base, components, utilities, ui-sdk, iui;
@import "tailwindcss";
```

Dialogs, popovers, menus and toasts use the browser's top layer, so a scrolling chat column doesn't clip them and they need no `z-index` from you.

## Status

The safety model has not been audited by a third party. The interpreter, the sanitizer and the URL filter are covered by tests in the repository.
