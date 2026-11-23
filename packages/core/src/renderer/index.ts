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
  type ChartContext,
  type ChartDescription,
  type ChartEngine,
  type ChartHandle,
  type ChartSeries,
  type ChartSpec,
  type ChartTheme,
  chartSpec,
  describeChart,
  engineChart,
  engineDraws,
  resolveColors,
} from "./chart-engine"
export {
  type FormatOptions,
  formatValue,
  prefersReducedMotion,
  tween,
  tweenless,
} from "./format"
export { type ClaimedId, claimId } from "./ids"
export {
  attachMotion,
  bezierOf,
  MOTION_PRESET_NAMES,
  type MotionAdapter,
  type MotionKeyframes,
  type MotionKind,
  type MotionPlayback,
  type MotionPreset,
  type MotionTiming,
  motionRuntime,
} from "./motion"
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
  isHtmlAttribute,
  lazyRecord,
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
  exitAnimations,
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
export { startWidget, WIDGET_REPORT, type WidgetHost, type WidgetInstance } from "./widget"
