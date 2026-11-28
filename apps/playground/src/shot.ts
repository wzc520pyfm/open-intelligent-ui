/** A screenshot the reader attached. It is sent to their model and then dropped. */
export interface Shot {
  mediaType: string
  /** Base64, without the data: prefix. */
  data: string
  /** A data URL for the chip next to the composer. */
  preview: string
}

export type ShotResult =
  | { ok: true; shot: Shot }
  | { ok: false; reason: "type" | "size" | "read" }

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"])
const MAX_EDGE = 1280
const MAX_BYTES = 1_200_000

/**
 * Shrinks a screenshot so a vision request stays small. The original is not
 * kept. A file that is not an image is refused before it is read.
 */
export async function shotFromBlob(blob: Blob): Promise<ShotResult> {
  const mediaType = blob.type === "image/jpg" ? "image/jpeg" : blob.type
  if (!ALLOWED.has(mediaType)) return { ok: false, reason: "type" }
  if (blob.size > MAX_BYTES) return { ok: false, reason: "size" }
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
  if (!hasImageHeader(header, mediaType)) return { ok: false, reason: "read" }
  if (typeof createImageBitmap !== "function") return originalShot(blob, mediaType)
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    if (await imageDecodes(blob)) return originalShot(blob, mediaType)
    return { ok: false, reason: "read" }
  }
  try {
    const shot = await shrink(bitmap)
    if (shot.data.length > MAX_BYTES * 1.4) return { ok: false, reason: "size" }
    return { ok: true, shot }
  } catch {
    return originalShot(blob, mediaType)
  } finally {
    bitmap.close()
  }
}

function hasImageHeader(bytes: Uint8Array, mediaType: string): boolean {
  const at = (...values: number[]) => values.every((value, index) => bytes[index] === value)
  if (mediaType === "image/png") return at(0x89, 0x50, 0x4e, 0x47)
  if (mediaType === "image/jpeg") return at(0xff, 0xd8, 0xff)
  if (mediaType === "image/gif") return at(0x47, 0x49, 0x46, 0x38)
  if (mediaType === "image/webp") return at(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return false
}

async function originalShot(blob: Blob, mediaType: string): Promise<ShotResult> {
  try {
    return { ok: true, shot: await shotFromDataUrl(blob, mediaType) }
  } catch {
    return { ok: false, reason: "read" }
  }
}

function imageDecodes(blob: Blob): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
      resolve(true)
      return
    }
    const url = URL.createObjectURL(blob)
    const image = new Image()
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(ok)
    }
    const timer = window.setTimeout(() => finish(false), 1000)
    image.onload = () => finish(image.naturalWidth > 0)
    image.onerror = () => finish(false)
    image.src = url
  })
}

async function shrink(bitmap: ImageBitmap): Promise<Shot> {
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("canvas")
  context.drawImage(bitmap, 0, 0, width, height)
  const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
  if (!encoded) throw new Error("encode")
  return shotFromDataUrl(encoded, "image/jpeg")
}

function shotFromDataUrl(blob: Blob, fallbackType: string): Promise<Shot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("read"))
    reader.onload = () => {
      const preview = typeof reader.result === "string" ? reader.result : ""
      const match = /^data:([^;]+);base64,(.+)$/.exec(preview)
      if (!match?.[1] || !match[2]) {
        reject(new Error("read"))
        return
      }
      resolve({ mediaType: match[1] || fallbackType, data: match[2], preview })
    }
    reader.readAsDataURL(blob)
  })
}
