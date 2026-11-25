/**
 * What the primitives and the preset widgets read from their props, so a
 * reply can be checked without drawing it. The views in `renderer/` are what
 * decide; this says the same thing as data, and a test holds the two together.
 */

const words = (text: string): string[] => text.split(/\s+/).filter(Boolean)

/** Props every box-like primitive takes: spacing, size, flex and look. */
const BOX = words(`
  padding paddingX paddingY paddingTop paddingBottom paddingLeft paddingRight
  margin marginX marginY marginTop marginBottom gap rowGap columnGap
  width height minWidth maxWidth minHeight maxHeight
  flex grow shrink align justify self wrap
  background color radius border borderColor shadow opacity overflow aspectRatio
  position top right bottom left inset zIndex
`)

/** What reaches the element itself. */
const DOM = words("id title role tabIndex hidden lang dir")

const TEXT = words(
  "size variant type weight align mono italic tabular uppercase strike truncate balance lines tracking"
)

/** The props each primitive reads, by tag. */
export const PRIMITIVE_PROPS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries({
    box: [...BOX, ...DOM, "direction"],
    row: [...BOX, ...DOM],
    grid: [...BOX, ...DOM, "columns", "minColumnWidth", "responsive"],
    "grid-item": [...BOX, ...DOM, "span", "colSpan", "columnSpan", "rowSpan"],
    card: [...BOX, ...DOM, "variant", "interactive"],
    text: [...BOX, ...DOM, ...TEXT, "block"],
    title: [...BOX, ...DOM, ...TEXT, "level"],
    badge: [...BOX, ...DOM, "color", "tone", "variant", "size"],
    icon: ["name", "size", "color", "stroke", "label"],
    divider: ["vertical", "orientation", "color", "spacing"],
    spacer: ["size"],
    image: [...BOX, ...DOM, "src", "alt", "fit"],
    link: [...BOX, ...DOM, ...TEXT, "href"],
    list: [...BOX, ...DOM, "marker", "connector"],
    "list-item": [...BOX, ...DOM, "icon"],
  }).map(([tag, props]) => [tag, new Set(props)])
)

export interface PresetSpec {
  props: ReadonlySet<string>
  /** Events markup can listen to with `on:name`. */
  events: readonly string[]
  /** Props without which there is nothing to show. */
  needs: readonly string[]
}

/** The props each preset widget reads, by name. */
export const PRESET_PROPS: Record<string, PresetSpec> = {
  Chart: {
    props: new Set(
      words(
        "type data x y names colors stacked height format currency digits unit locale legend labels grid"
      )
    ),
    events: ["select"],
    needs: ["data"],
  },
  Stat: {
    props: new Set([
      ...BOX,
      ...words(
        "label value format currency digits unit delta deltaFormat deltaDigits trend invert caption icon"
      ),
    ]),
    events: [],
    needs: ["value"],
  },
  Number: {
    props: new Set(words("value format currency digits unit duration locale")),
    events: [],
    needs: ["value"],
  },
  DataTable: {
    props: new Set(words("data columns sortable pageSize selected rowKey empty")),
    events: ["select"],
    needs: ["data"],
  },
  CodeBlock: { props: new Set(words("code lang language")), events: ["copy"], needs: [] },
  Skeleton: { props: new Set(words("lines width height circle")), events: [], needs: [] },
}

/** Attributes the renderer reads itself, on any element. */
export const UNIVERSAL = new Set([
  "key",
  "show",
  "class",
  "className",
  "style",
  "motion",
  "delay",
  "stagger",
  "morph",
])

/** Values of `motion="…"` that CSS plays and that are not entrances. */
export const EXTRA_MOTIONS = ["none", "draw", "float", "pulse", "spin"]

/** The chart types the built-in SVG draws. */
export const CHART_TYPES = ["bar", "line", "area", "donut", "pie", "spark"]

/** Events an element reports, as `on:name` writes them. */
export const DOM_EVENTS = new Set(
  words(`
    click dblclick contextmenu input change submit reset invalid select beforeinput
    focus blur focusin focusout keydown keyup keypress
    pointerdown pointerup pointermove pointerenter pointerleave pointercancel pointerover pointerout
    mousedown mouseup mousemove mouseenter mouseleave mouseover mouseout wheel scroll
    touchstart touchend touchmove touchcancel
    dragstart drag dragend dragenter dragleave dragover drop copy cut paste
    toggle load error animationstart animationend transitionend compositionstart compositionend
  `)
)

/**
 * What a name from another library is called here. Keys are in lower case;
 * a value is the tag to write, or a sentence when there is more to say.
 */
export const OTHER_NAMES: Record<string, string> = {
  stack: "<box>",
  vstack: "<box>",
  column: "<box>",
  col: "<box>",
  container: "<box>",
  section: "<box>",
  view: "<box>",
  flex: "<row>",
  hstack: "<row>",
  group: "<row>",
  inline: "<row>",
  heading: "<title>",
  header: "<title>",
  typography: "<text>",
  paragraph: "<text>",
  label: "<text>, or <Label> for a form control",
  span: "<text>",
  tag: "<badge>",
  chip: "<badge>",
  pill: "<badge>",
  status: "<badge>",
  img: "<image>",
  picture: "<image>",
  avatar: "<Avatar>",
  hr: "<divider>",
  separator: "<divider>",
  anchor: "<link>",
  a: "<link>",
  ul: "<list>",
  li: "<list-item>",
  item: "<list-item>",
  table: "<DataTable>, or a Markdown table for a few fixed rows",
  datagrid: "<DataTable>",
  code: "<CodeBlock>",
  spinner: "<Skeleton>",
  loader: "<Skeleton>",
  loading: "<Skeleton>",
  metric: "<Stat>",
  statistic: "<Stat>",
  kpi: "<Stat>",
  counter: "<Number>",
  graph: "<Chart>",
  barchart: '<Chart type="bar">',
  linechart: '<Chart type="line">',
  areachart: '<Chart type="area">',
  piechart: '<Chart type="pie">',
  donutchart: '<Chart type="donut">',
  sparkline: '<Chart type="spark">',
  modal: "<Dialog>",
  sheet: "<Drawer>",
  dropdown: "<Menu> for actions, <Select> for a choice",
  textfield: "<Input>",
  textinput: "<Input>",
  textbox: "<Input>",
  numberfield: "<NumberInput>",
  checkboxgroup: "<Checkbox> for each choice",
  radiogroup: "<RadioGroup>",
  toggleswitch: "<Switch>",
  range: "<Slider>",
  progressbar: "<Progress>",
  alert: "<card> with an <icon> and a <text>",
  callout: "<card> with an <icon> and a <text>",
  banner: "<card> with an <icon> and a <text>",
  toast: 'the toast("Saved", "success") action, called from a handler',
  form: "<box>; controls keep their values in <state> with bind:value",
  fragment: "nothing: tags can sit side by side without a wrapper",
}

/** A prop under the name another library gives it, for a hint. Keys are in lower case. */
export const OTHER_PROPS: Record<string, string> = {
  spacing: "gap",
  space: "gap",
  gutter: "gap",
  alignitems: "align",
  justifycontent: "justify",
  flexdirection: 'direction="row" on <box>, or <row>',
  flexwrap: "wrap",
  flexgrow: "grow",
  p: "padding",
  px: "paddingX",
  py: "paddingY",
  pt: "paddingTop",
  pb: "paddingBottom",
  m: "margin",
  mx: "marginX",
  my: "marginY",
  mt: "marginTop",
  mb: "marginBottom",
  w: "width",
  h: "height",
  bg: "background",
  backgroundcolor: "background",
  colour: "color",
  textcolor: "color",
  rounded: "radius",
  borderradius: "radius",
  cornerradius: "radius",
  elevation: "shadow",
  boxshadow: "shadow",
  cols: "columns",
  columncount: "columns",
  colspan: "span",
  bold: 'weight="bold"',
  fontweight: "weight",
  fontsize: "size",
  textalign: "align",
  underline: "class and a <style> rule",
  strikethrough: "strike",
  linethrough: "strike",
  maxlines: "lines",
  clamp: "lines",
  nowrap: "truncate",
  ellipsis: "truncate",
  monospace: "mono",
  intent: "color",
  status: "color",
  severity: "color",
  appearance: "variant",
  kind: "variant",
  url: "href",
  to: "href",
  source: "src",
  objectfit: "fit",
  heading: "a <title> inside",
  subtitle: "a <text> inside",
  header: "a <title> inside",
  footer: "a <row> inside, at the end",
  onclick: "on:click={…}",
  onpress: "on:click={…}",
  ontap: "on:click={…}",
}

/** Per component, a prop under the name another library gives it. Keys are in lower case. */
export const OTHER_PROPS_OF: Record<string, Record<string, string>> = {
  Chart: {
    kind: "type",
    variant: "type",
    charttype: "type",
    values: "data",
    rows: "data",
    series: 'y={["a", "b"]}, one name per series',
    dataset: "data",
    xkey: "x",
    xaxis: "x",
    xfield: "x",
    category: "x",
    ykey: "y",
    yaxis: "y",
    yfield: "y",
    value: "y",
    keys: "y",
    title: "a <title> above the chart",
    color: 'colors={["accent"]}',
    showlegend: "legend",
    showlabels: "labels",
    showgrid: "grid",
  },
  Stat: {
    title: "label",
    name: "label",
    heading: "label",
    number: "value",
    amount: "value",
    change: "delta",
    diff: "delta",
    difference: "delta",
    percent: "delta",
    description: "caption",
    subtitle: "caption",
    help: "caption",
    hint: "caption",
    suffix: "unit",
    prefix: 'format="currency", or unit',
  },
  Number: { number: "value", amount: "value", decimals: "digits", precision: "digits", suffix: "unit" },
  DataTable: {
    rows: "data",
    items: "data",
    records: "data",
    cols: "columns",
    headers: "columns",
    fields: "columns",
    pagesize: "pageSize",
    perpage: "pageSize",
    rowsperpage: "pageSize",
    sort: "sortable",
    emptytext: "empty",
    placeholder: "empty",
    onrowclick: "on:select={…}",
    keyfield: "rowKey",
    idfield: "rowKey",
  },
  CodeBlock: { language: "lang", value: "code", source: "code", content: "code" },
  Skeleton: { count: "lines", rows: "lines", round: "circle", rounded: "circle" },
  icon: { icon: "name", type: "name", glyph: "name", symbol: "name" },
  badge: { type: "color", label: "the text between the tags", text: "the text between the tags" },
  title: { size: "level, or size for the font size", as: "level", h: "level" },
  text: { as: "block, for a line of its own" },
  card: { title: "a <title> inside the card" },
  image: { url: "src", source: "src", description: "alt", caption: "a <text> under the image" },
  link: { url: "href", to: "href", target: "nothing: a link to another site opens in a new tab" },
  grid: { gutter: "gap", cols: "columns", minwidth: "minColumnWidth", mincolumnwidth: "minColumnWidth" },
  "grid-item": { colspan: "span", columns: "span", width: "span" },
  "list-item": { marker: "icon", bullet: "icon" },
  list: { type: "marker", ordered: 'marker="number"', bullets: 'marker="bullet"' },
}

/** What to write instead of a name a browser or another language has and this one doesn't. */
export const OTHER_GLOBALS: Record<string, string> = {
  Date: "now() and today() give the time, and date(value), time(value), relative(value) show one",
  Intl: "num(), currency(), percent(), compact(), date() and time() format values",
  console: "leave it out: there is no console",
  window: "there is no window: keep what you need in <state>",
  document: "there is no document: keep what you need in <state>",
  localStorage: "<state persist …> keeps state between visits",
  sessionStorage: "<state persist …> keeps state between visits",
  fetch: '<query id="…" tool="…" /> reads data and call("tool", input) changes it',
  alert: 'toast("message") shows a message',
  confirm: "show the question in the interface: a <Dialog>, or a second button",
  prompt: "an <Input> bound to state asks for text",
  setTimeout: "there are no timers: <query every={30}> loads again every 30 seconds",
  setInterval: "there are no timers: <query every={30}> loads again every 30 seconds",
  navigator: 'copy("text") copies, and open("https://…") opens a link',
  Set: "unique(list) removes duplicates, and list.includes(x) tests for one",
  Map: "an object, { key: value }, holds values by name",
  Promise: "call() and send() are awaited for you: write await call(…)",
  RegExp: "text.includes(), startsWith(), endsWith(), split() and replace() take text, not patterns",
  moment: "date(value), time(value) and relative(value) show a time",
  dayjs: "date(value), time(value) and relative(value) show a time",
  notify: 'toast("message") shows a message',
  navigate: 'open("https://…") opens a link, and send("message") asks the assistant for the next view',
  router: 'open("https://…") opens a link, and send("message") asks the assistant for the next view',
  dispatch: "state changes by assigning to it, and send(…) or call(…) reach the host",
  emit: "send(…) or call(…) reach the host",
  useState: "<state name={value} /> declares state, and name = value changes it",
  useEffect: "<derive name={…} /> computes from state, and <query> loads data",
  useMemo: "<derive name={…} /> computes from state",
  React: "this is not JSX: tags and {#if}/{#each} blocks, with state in <state>",
  props: "inside <define>, a prop is read by its own name",
  this: "there is no this: state is read by name",
  event: "$event is the event and $value is its value, inside a handler",
  e: "$event is the event and $value is its value, inside a handler",
  value: "$value is the new value, inside a handler",
}

/** What to write instead of a method JavaScript has and this language doesn't. */
export const OTHER_METHODS: Record<string, string> = {
  toLocaleDateString: "date(value)",
  toLocaleTimeString: "time(value)",
  toISOString: "the value itself: dates are kept as text or numbers",
  toDateString: "date(value)",
  getFullYear: 'date(value, "year")',
  getMonth: 'date(value, "month")',
  getDate: 'date(value, "month-day")',
  getDay: 'date(value, "weekday")',
  getHours: "time(value)",
  getMinutes: "time(value)",
  getTime: "the value itself: a time is a number of milliseconds",
  format: "num(), currency(), percent(), date() or time()",
  toCurrency: "currency(value)",
  sum: "sum(list), or sumBy(list, \"field\")",
  avg: "avg(list)",
  average: "avg(list)",
  min: "min(list), or minBy(list, \"field\")",
  max: "max(list), or maxBy(list, \"field\")",
  count: "len(list), or list.length",
  size: "len(value)",
  len: "len(value)",
  length: "list.length, with no brackets",
  first: "first(list)",
  last: "last(list)",
  unique: "unique(list)",
  distinct: "unique(list)",
  groupBy: "groupBy(list, \"field\")",
  sortBy: "sortBy(list, \"field\")",
  orderBy: "sortBy(list, \"field\")",
  remove: "list = without(list, item), or list = list.filter(x => x != item)",
  delete: "list = without(list, item), or list = list.filter(x => x != item)",
  add: "list.push(item)",
  append: "list.push(item)",
  insert: "list.splice(index, 0, item)",
  has: "list.includes(item)",
  contains: "list.includes(item)",
  get: "object.name or object[key]",
  set: "object.name = value",
  keys: "keys(object)",
  values: "values(object)",
  entries: "entries(object)",
  toggle: "flag = !flag, or list = toggle(list, item)",
  match: "text.includes(part), startsWith() or endsWith()",
  test: "text.includes(part)",
  search: "text.indexOf(part)",
  substr: "text.slice(start, end)",
  trimLeft: "text.trimStart()",
  trimRight: "text.trimEnd()",
  capitalize: "capitalize(text)",
  toNumber: "Number(text)",
  toInt: "parseInt(text)",
  toBoolean: "Boolean(value)",
  then: "await: write let result = await call(…) and use result on the next statement",
  catch: "nothing: a failed call is shown to the reader as a message",
  finally:
    "nothing: there is no finally. The statements after an await run only when it succeeds, and a failed call is shown to the reader as a message",
  preventDefault: "nothing: a form here never leaves the page",
  stopPropagation: "nothing",
  clear: "list = []",
  empty: "list = []",
  isEmpty: "len(value) == 0",
  toArray: "the list itself",
  clone: "the value itself: state is copied when it changes",
  equals: "a == b",
  isInteger: "value % 1 == 0",
  isArray: "isArray(value)",
  now: "now()",
  floor: "floor(value), or Math.floor(value)",
  round: "round(value, digits)",
  abs: "abs(value)",
}
