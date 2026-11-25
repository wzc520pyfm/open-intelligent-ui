# 安全

标记是由渲染器解释的数据，从来不会被当作 JavaScript 执行。本页列出标记能做什么、不能做什么，以及哪些事仍然归宿主负责。

## 标记不能做什么 {#what-markup-can-t-do}

- **运行代码**。表达式在一个解释器里运行，访问不到 `window`、`document`、`fetch`、定时器和 `eval`，也够不到对象原型。
- **自带脚本或内嵌框架**。`<script>`、`<iframe>`、`<object>`、`<embed>`、`<meta>`、`<base>`、`<template>`、SVG `<foreignObject>` 和字符串形式的事件属性（`onclick="…"`）都会被丢弃。
- **链接到任意地址**。链接接受 `http`、`https`、`mailto`、`tel` 和相对 URL。图片和视频接受 `http`、`https`、`blob:` 和图片的 `data:` URL。`allowUrl` 可以进一步收窄，比如只允许你自己的域名，`open(url)` 也要经过它。
- **加入你的表单**。`form` 属性在任何地方都会被丢弃，所以控件没法凭 id 加入你的某个表单。
- **给你的页面加样式**。`<style>` 的作用范围限定在它所在的这块界面。`@import`、指向其他站点的 `url()` 和未知的 at 规则会被移除，`position: fixed` 会变成 `absolute`，所以一块界面没法盖在你的页面上面。
- **触及组件的内部**。注册的组件只会收到它声明过的 props。标记不能传 `ref` 或 `innerHTML`。
- **配置引擎**。标记写的是 `<Chart>` 的 props，引用的是动效预设的名字。它不能写图表引擎的原始选项，也不能写关键帧。

副作用只有这些动作：`send`、`call`、`refetch`、`reset`、`toast`、`copy`、`open`，以及你用 `actions` 添加的动作。

## 哪些事归宿主负责 {#what-is-the-host-s-job}

**对工具调用鉴权**。工具在浏览器里运行，用的是用户的会话，代表的是模型写出的标记。模型可能被它上下文里的文本带偏，所以要把每次调用都当作不可信的输入：

- 在服务端检查权限、校验输入。
- 只向模型描述用户有权使用的工具。
- 风险高的时候，破坏性的写操作要在你自己的 UI 里确认。

**把发出的内容显示出来**。模型可以写出一个标签和实际发送内容不一致的按钮。把 `send` 的文本作为一条用户消息显示在对话里，让用户看到以自己的名义说了什么。

**需要时收窄 URL**。每个链接和媒体地址都会调用 `allowUrl={(url, kind) => …}`。

## CSS 和你的页面 {#css-and-your-page}

样式表用了两个级联层，先 `ui-sdk` 后 `iui`，里面的所有规则都限定在 `.iui-root` 之内。你的页面不会被改样式。

反过来则要小心：不在任何层里的 CSS 优先于层里的 CSS，所以像 `button { color: inherit }` 这样没有分层的 reset，会在这块界面内部覆盖渲染器的样式。把 reset 放进一个最先声明的层里：

```css
@layer reset, ui-sdk, iui;

@layer reset {
  button { font: inherit; color: inherit; }
}
```

用 Tailwind 4 时，页面的样式本来就分了层。把它们的层名写在前面，让这块界面的层排在最后：

```css
@layer theme, base, components, utilities, ui-sdk, iui;
@import "tailwindcss";
```

对话框、弹出框、菜单和 toast 用的是浏览器的顶层（top layer），所以可滚动的聊天栏不会裁掉它们，也不需要你给它们设 `z-index`。

## 现状 {#status}

这套安全模型没有经过第三方审计。解释器、清理器和 URL 过滤器有仓库里的测试覆盖。
