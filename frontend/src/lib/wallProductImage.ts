/**
 * Wall product photos are white-studio cutouts with uneven padding.
 * T-shirts look tiny next to wide flannels when we only use object-contain.
 * These helpers normalize every tile to the same filled square for the Wall UI.
 */

const FILL_CACHE = new Map<string, string>()

type Rgba = { r: number; g: number; b: number }

function colorDist(a: Rgba, b: Rgba): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
}

/** Near-white / light-grey / transparent = empty studio padding (not garment). */
function isNearWhiteOrTransparent(r: number, g: number, b: number, a: number): boolean {
  if (a < 12) return true
  // Pure white studio
  if (r >= 248 && g >= 248 && b >= 248) return true
  // Soft grey paper / failed cutout mats that still read as "background"
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max >= 200 && min >= 185 && max - min <= 18
}

/**
 * Sample corners + edge midpoints. When they agree on a flat mat colour
 * (common Gemini/remove.bg grey studios), treat that colour as empty padding
 * so the garment zooms onto pure white.
 */
function detectMatColor(data: Uint8ClampedArray, width: number, height: number): Rgba | null {
  const samples: Rgba[] = []
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4
    if (data[i + 3] < 12) return
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] })
  }
  const mx = Math.max(0, width - 1)
  const my = Math.max(0, height - 1)
  const cx = Math.floor(width / 2)
  const cy = Math.floor(height / 2)
  for (const [x, y] of [
    [0, 0],
    [mx, 0],
    [0, my],
    [mx, my],
    [cx, 0],
    [cx, my],
    [0, cy],
    [mx, cy],
    [Math.min(4, mx), Math.min(4, my)],
    [Math.max(0, mx - 4), Math.min(4, my)],
    [Math.min(4, mx), Math.max(0, my - 4)],
    [Math.max(0, mx - 4), Math.max(0, my - 4)],
  ] as const) {
    push(x, y)
  }
  if (samples.length < 4) return null

  const avg: Rgba = {
    r: Math.round(samples.reduce((s, c) => s + c.r, 0) / samples.length),
    g: Math.round(samples.reduce((s, c) => s + c.g, 0) / samples.length),
    b: Math.round(samples.reduce((s, c) => s + c.b, 0) / samples.length),
  }
  // Edges must agree — otherwise this isn't a flat studio mat.
  const agreeing = samples.filter((c) => colorDist(c, avg) <= 22).length
  if (agreeing < samples.length * 0.75) return null

  // Only treat near-neutral light/mid greys as mats (not coloured backdrops).
  const max = Math.max(avg.r, avg.g, avg.b)
  const min = Math.min(avg.r, avg.g, avg.b)
  if (max - min > 22) return null
  if (max < 140) return null // too dark to be a studio fill
  // Pure white already handled; mid/light grey mats are the bug we fix.
  if (max >= 248 && min >= 248) return null
  return avg
}

function makeEmptyPixelTest(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): (r: number, g: number, b: number, a: number) => boolean {
  const mat = detectMatColor(data, width, height)
  return (r, g, b, a) => {
    if (isNearWhiteOrTransparent(r, g, b, a)) return true
    if (!mat) return false
    return colorDist({ r, g, b }, mat) <= 28
  }
}

export function findGarmentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const isEmpty = makeEmptyPixelTest(data, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (isEmpty(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

function needsCorsProxy(src: string): boolean {
  if (!/^https?:\/\//i.test(src)) return false
  // Same-origin relative already excluded; remote storage / CDN usually omit ACAO.
  return true
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
    // Higher trim tolerance so light-grey studio mats collapse before first paint.
    trim: "55",
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
 * fills ~92% of the frame so every Wall tile reads the same size on pure white.
 */
export async function buildWallFillObjectUrl(src: string): Promise<string> {
  const cached = FILL_CACHE.get(src)
  if (cached) return cached

  const probeUrl = needsCorsProxy(src) ? corsReadableImageUrl(src) : src

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

  // Draw crop onto white, then force leftover studio-mat pixels to #fff
  // (Gemini/remove.bg often leave a mid-grey board instead of pure white).
  octx.drawImage(scan, cropX, cropY, cropW, cropH, dx, dy, dw, dh)
  const mat = detectMatColor(data, sw, sh)
  if (mat) {
    const outData = octx.getImageData(0, 0, outSize, outSize)
    const px = outData.data
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 12) {
        px[i] = 255
        px[i + 1] = 255
        px[i + 2] = 255
        px[i + 3] = 255
        continue
      }
      if (isNearWhiteOrTransparent(px[i], px[i + 1], px[i + 2], px[i + 3])) {
        px[i] = 255
        px[i + 1] = 255
        px[i + 2] = 255
        px[i + 3] = 255
        continue
      }
      // Tight match only — avoid eating light-grey fabric with texture.
      if (colorDist({ r: px[i], g: px[i + 1], b: px[i + 2] }, mat) <= 16) {
        px[i] = 255
        px[i + 1] = 255
        px[i + 2] = 255
        px[i + 3] = 255
      }
    }
    octx.putImageData(outData, 0, 0)
  }

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
