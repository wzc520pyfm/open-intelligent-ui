import "@open-intelligent-ui/vue/styles.css"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme"
import { h } from "vue"
import CheckDemo from "./CheckDemo.vue"
import LiveExample from "./LiveExample.vue"
import PlaygroundLink from "./PlaygroundLink.vue"
import "./style.css"

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "nav-bar-content-before": () => h(PlaygroundLink),
      "nav-screen-content-before": () => h(PlaygroundLink, { screen: true }),
    }),
  enhanceApp({ app }) {
    app.component("LiveExample", LiveExample)
    app.component("CheckDemo", CheckDemo)
  },
} satisfies Theme
