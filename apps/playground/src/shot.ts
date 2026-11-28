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
  try {
    const shot = await shrink(blob)
    if (shot.data.length > MAX_BYTES * 1.4) return { ok: false, reason: "size" }
    return { ok: true, shot }
  } catch {
    if (blob.size > MAX_BYTES) return { ok: false, reason: "size" }
    try {
      return { ok: true, shot: await shotFromDataUrl(blob, mediaType) }
    } catch {
      return { ok: false, reason: "read" }
    }
  }
}

async function shrink(blob: Blob): Promise<Shot> {
  const bitmap = await createImageBitmap(blob)
  try {
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
  } finally {
    bitmap.close()
  }
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
