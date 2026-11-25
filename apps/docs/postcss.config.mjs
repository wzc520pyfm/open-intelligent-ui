import { postcssIsolateStyles } from "vitepress"

// The site's own rules for prose (`.vp-doc p`, `.vp-doc a`, the button reset)
// are unlayered, so they would beat the renderer's layered rules inside a
// live example. This keeps them off anything inside `.vp-raw`.
export default {
  plugins: [postcssIsolateStyles({ includeFiles: [/vp-doc\.css/, /base\.css/] })],
}
