/**
 * What renderers share. Everything a framework doesn't decide lives here:
 * how attributes become props, how markup becomes nodes, what the primitives
 * and presets draw, and the stylesheet they are drawn with. Unlike the rest
 * of this package, some of it expects a browser.
 */
export {
  CHART_WIDTH,
  type ChartData,
  type ChartState,
  chartDataKey,
  chartValues,
  chartView,
  readChartData,
} from "./chart"
export {
  easeOut,
  type FormatOptions,
  formatValue,
  prefersReducedMotion,
} from "./format"
export {
  COPIED_LIFETIME,
  type CodeState,
  codeText,
  codeView,
  copyCode,
  numberTarget,
  numberView,
  PRESET_NAMES,
  skeletonView,
  statView,
  type TableSort,
  type TableState,
  tableView,
} from "./presets"
export {
  type IconSpec,
  type ImageState,
  iconName,
  iconPlaceholder,
  iconSpec,
  imageView,
  PRIMITIVE_VIEWS,
  type ViewProps,
} from "./primitives"
export {
  BLOCKED_PROPS,
  buildProps,
  camel,
  capitalize,
  type ElementKind,
  type ElementProps,
  evalAttr,
  type PropsContext,
  type PropsDialect,
  plainArg,
} from "./props"
export { createRegistry, type Lookup, type Registry } from "./registry"
export {
  createRenderer,
  type LetBinding,
  type RenderContext,
  type RenderHost,
  type RenderOptions,
} from "./render"
export {
  copyText,
  designCss,
  guard,
  modelCss,
  openUrl,
  runMorph,
  styleText,
  TOAST_LIFETIME,
  TOAST_LIMIT,
  type Toast,
  usesMorph,
} from "./surface"
export type { StyleMap } from "./tokens"
export {
  hasContent,
  isView,
  joinClass,
  part,
  px,
  type View,
  type ViewHandler,
  type ViewOptions,
  view,
} from "./view"
