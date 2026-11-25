export type {
  Attr,
  AttrValue,
  ConstNode,
  Diagnostic,
  DiagnosticCode,
  Document,
  EachNode,
  ElementNode,
  ExprNode,
  IfNode,
  Node,
  TextNode,
} from "./ast"
export {
  BLOCKED_TAGS,
  DECLARATION_TAGS,
  HTML_TAGS,
  isComponentName,
  PRIMITIVE_TAGS,
  SVG_TAGS,
  VOID_TAGS,
} from "./elements"
export { decodeEntities, healMarkdownTail } from "./markdown"
export { locate, type ParseOptions, parse, prepare } from "./scan"
