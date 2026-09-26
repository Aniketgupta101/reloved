/**
 * Wall product photos are white-studio cutouts with uneven padding.
 * T-shirts look tiny next to wide flannels when we only use object-contain.
 * These helpers normalize every tile to the same filled square for the Wall UI.
 */

const FILL_CACHE = new Map<string, string>()

/** Near-white / transparent = empty studio padding (not garment). */
function isEmptyPixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 12) return true
  return r >= 248 && g >= 248 && b >= 248
}

export function findGarmentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (isEmptyPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** CORS-friendly URL for pixel reads (GCS buckets usually omit ACAO). */
export function corsReadableImageUrl(src: string): string {
  const bare = src.replace(/^https?:\/\//i, "")
  const params = new URLSearchParams({
    url: bare,
    w: "900",
    h: "900",
    fit: "contain",
    cbg: "ffffff",
    output: "png",
  })
  return `https://wsrv.nl/?${params.toString()}`
}

/**
 * Display URL when canvas trim isn't ready yet — trim empty margins on the CDN,
 * then fit into a square so every Wall card starts closer to the same visual size.
 */
export function wallFillDisplayUrl(src: string): string {
  if (!src || src.startsWith("blob:") || src.startsWith("data:") || src.startsWith("/")) {
    return src
  }
  const bare = src.replace(/^https?:\/\//i, "")
  const params = new URLSearchParams({
    url: bare,
    w: "800",
    h: "800",
    fit: "contain",
    trim: "45",
    cbg: "ffffff",
    output: "webp",
    q: "88",
  })
  return `https://wsrv.nl/?${params.toString()}`
}

export function getCachedWallFill(src: string): string | undefined {
  return FILL_CACHE.get(src)
}

export function setCachedWallFill(src: string, objectUrl: string): void {
  const prev = FILL_CACHE.get(src)
  if (prev && prev.startsWith("blob:") && prev !== objectUrl) {
    URL.revokeObjectURL(prev)
  }
  FILL_CACHE.set(src, objectUrl)
}

/**
 * Analyze garment pixels, crop studio padding, redraw into a square that
 * fills ~92% of the frame so every Wall tile reads the same size.
 */
export async function buildWallFillObjectUrl(src: string): Promise<string> {
  const cached = FILL_CACHE.get(src)
  if (cached) return cached

  const probeUrl = /storage\.googleapis\.com/i.test(src) ? corsReadableImageUrl(src) : src

  const img = await loadHtmlImage(probeUrl)
  const maxSide = 900
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
  const sw = Math.max(1, Math.round(img.naturalWidth * scale))
  const sh = Math.max(1, Math.round(img.naturalHeight * scale))

  const scan = document.createElement("canvas")
  scan.width = sw
  scan.height = sh
  const sctx = scan.getContext("2d", { willReadFrequently: true })
  if (!sctx) throw new Error("Canvas unavailable")
  sctx.fillStyle = "#ffffff"
  sctx.fillRect(0, 0, sw, sh)
  sctx.drawImage(img, 0, 0, sw, sh)

  const { data } = sctx.getImageData(0, 0, sw, sh)
  const bounds = findGarmentBounds(data, sw, sh)
  if (!bounds || bounds.w < 8 || bounds.h < 8) {
    const fallback = wallFillDisplayUrl(src)
    setCachedWallFill(src, fallback)
    return fallback
  }

  const pad = Math.round(Math.max(bounds.w, bounds.h) * 0.04)
  const cropX = Math.max(0, bounds.x - pad)
  const cropY = Math.max(0, bounds.y - pad)
  const cropW = Math.min(sw - cropX, bounds.w + pad * 2)
  const cropH = Math.min(sh - cropY, bounds.h + pad * 2)

  const outSize = 800
  const out = document.createElement("canvas")
  out.width = outSize
  out.height = outSize
  const octx = out.getContext("2d")
  if (!octx) throw new Error("Canvas unavailable")
  octx.fillStyle = "#ffffff"
  octx.fillRect(0, 0, outSize, outSize)

  // Fill most of the square (same visual weight for tees and wide shirts).
  const inset = outSize * 0.04
  const box = outSize - inset * 2
  const fit = Math.min(box / cropW, box / cropH)
  const dw = cropW * fit
  const dh = cropH * fit
  const dx = (outSize - dw) / 2
  const dy = (outSize - dh) / 2
  octx.drawImage(scan, cropX, cropY, cropW, cropH, dx, dy, dw, dh)

  const objectUrl = await new Promise<string>((resolve, reject) => {
    out.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode filled image"))
          return
        }
        resolve(URL.createObjectURL(blob))
      },
      "image/webp",
      0.9,
    )
  })

  setCachedWallFill(src, objectUrl)
  return objectUrl
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.decoding = "async"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Image failed to load"))
    img.src = url
  })
}
