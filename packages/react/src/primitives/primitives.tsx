import {
  iconPlaceholder,
  iconSpec,
  imageView,
  PRIMITIVE_VIEWS,
  type StyleMap,
} from "@open-intelligent-ui/core/renderer"
import { DynamicIcon, type IconName } from "lucide-react/dynamic"
import dynamicIconImports from "lucide-react/dynamicIconImports"
import { type CSSProperties, type ReactNode, useState } from "react"
import { toReact } from "../render/view"

/** Props as the renderer hands them over: already evaluated, not yet typed. */
export type PrimitiveProps = Record<string, unknown> & {
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

type Primitive = (props: PrimitiveProps) => ReactNode

/** The shared views read the class from `class` and take children separately. */
function viewProps(props: PrimitiveProps) {
  const { children, className, style, ...rest } = props
  return { children, props: { ...rest, class: className, style: style as StyleMap | undefined } }
}

/** Draws a lucide icon by name, at the sizes and colors of the design. */
const Icon: Primitive = (input) => {
  const spec = iconSpec(viewProps(input).props)
  const style = spec.style as CSSProperties
  if (spec.name === null || !Object.hasOwn(dynamicIconImports, spec.name)) {
    return toReact(iconPlaceholder(spec, true), PARTS)
  }
  return (
    <DynamicIcon
      name={spec.name as IconName}
      size={spec.pixels}
      strokeWidth={spec.stroke}
      aria-hidden={spec.label ? undefined : true}
      aria-label={spec.label ?? undefined}
      role={spec.label ? "img" : undefined}
      fallback={() => <>{toReact(iconPlaceholder(spec, false), PARTS)}</>}
      className={spec.class}
      style={style}
    />
  )
}

const PARTS = { icon: Icon }

const Image: Primitive = (input) => {
  const [failed, setFailed] = useState(false)
  return toReact(
    imageView(viewProps(input).props, { failed, onError: () => setFailed(true) }),
    PARTS
  )
}

const shared = Object.fromEntries(
  Object.entries(PRIMITIVE_VIEWS).map(([name, draw]): [string, Primitive] => [
    name,
    (input) => {
      const { props, children } = viewProps(input)
      return toReact(draw(props, children), PARTS)
    },
  ])
)

export const PRIMITIVES: Record<string, Primitive> = {
  ...shared,
  icon: Icon,
  image: Image,
}

export { Icon }
