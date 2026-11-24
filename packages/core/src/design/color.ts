/**
 * Reading a CSS color well enough to say how light it is. A design names
 * its colors in whatever notation its tools write: hex, `rgb()`, `hsl()`,
 * or the `oklch()` that Tailwind and most current themes use.
 */

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 128, 0],
  lime: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  fuchsia: [255, 0, 255],
  magenta: [255, 0, 255],
  pink: [255, 192, 203],
  aqua: [0, 255, 255],
  cyan: [0, 255, 255],
  teal: [0, 128, 128],
  navy: [0, 0, 128],
  maroon: [128, 0, 0],
  olive: [128, 128, 0],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  silver: [192, 192, 192],
}

const FUNCTIONS = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i

/** Whether a value is a color, as far as its notation says. */
export function isColor(value: string): boolean {
  const text = value.trim()
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return true
  if (FUNCTIONS.test(text)) return true
  const word = text.toLowerCase()
  return Object.hasOwn(NAMED, word) || word === "transparent" || word === "currentcolor"
}

/** The arguments of a color function, with the alpha after `/` left out. */
function parts(text: string): string[] {
  const inside = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")"))
  return (inside.split("/")[0] as string).split(/[\s,]+/).filter(Boolean)
}

/** A number, or a percentage of `full`. */
function amount(text: string | undefined, full: number): number {
  if (text === undefined || text === "none") return 0
  const value = Number.parseFloat(text)
  if (!Number.isFinite(value)) return Number.NaN
  return text.trim().endsWith("%") ? (value / 100) * full : value
}

function degrees(text: string | undefined): number {
  if (text === undefined || text === "none") return 0
  const value = Number.parseFloat(text)
  if (text.endsWith("turn")) return value * 360
  if (text.endsWith("grad")) return value * 0.9
  if (text.endsWith("rad")) return (value * 180) / Math.PI
  return value
}

const linear = (channel: number) => {
  const unit = channel / 255
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

function fromRgb(r: number, g: number, b: number): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

function fromHsl(h: number, s: number, l: number): number {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))
  }
  return fromRgb(channel(0), channel(8), channel(4))
}

/** The luminance of a color given in Oklab, by way of linear sRGB. */
function fromOklab(lightness: number, a: number, b: number): number {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const clamp = (value: number) => Math.min(1, Math.max(0, value))
  return 0.2126 * clamp(red) + 0.7152 * clamp(green) + 0.0722 * clamp(blue)
}

/**
 * The relative luminance of a color, from 0 (black) to 1 (white), or null
 * for a notation this doesn't read, such as `color-mix()` or a variable.
 */
export function luminance(color: string | undefined): number | null {
  if (!color) return null
  const text = color.trim().toLowerCase()
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)
  if (hex) {
    let digits = hex[1] as string
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((ch) => ch + ch).join("")
    if (digits.length !== 6 && digits.length !== 8) return null
    const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(digits.slice(at, at + 2), 16)) as [number, number, number]
    return fromRgb(r, g, b)
  }
  const named = NAMED[text]
  if (named) return fromRgb(...named)
  const name = /^([a-z]+)\(/.exec(text)?.[1]
  if (!name || !text.endsWith(")")) return null
  const [first, second, third] = parts(text)
  let value: number
  if (name === "rgb" || name === "rgba") {
    value = fromRgb(amount(first, 255), amount(second, 255), amount(third, 255))
  } else if (name === "hsl" || name === "hsla") {
    value = fromHsl(((degrees(first) % 360) + 360) % 360, amount(second, 1), amount(third, 1))
  } else if (name === "oklch") {
    const chroma = amount(second, 0.4)
    const hue = (degrees(third) * Math.PI) / 180
    value = fromOklab(amount(first, 1), chroma * Math.cos(hue), chroma * Math.sin(hue))
  } else if (name === "oklab") {
    value = fromOklab(amount(first, 1), amount(second, 0.4), amount(third, 0.4))
  } else return null
  return Number.isFinite(value) ? value : null
}

/** Whether a color is dark enough to need light text on it. */
export function isDark(color: string | undefined): boolean {
  const value = luminance(color)
  return value !== null && value < 0.4
}
