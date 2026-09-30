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

function lum(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Near-white / transparent = empty studio padding (not garment).
 * Keep this STRICT — light grey fabric and white tees must NOT count as empty.
 * 248 catches common near-white JPEG studio mats without eating cream fabric. */
function isNearWhiteOrTransparent(r: number, g: number, b: number, a: number): boolean {
  if (a < 12) return true
  return r >= 248 && g >= 248 && b >= 248
}

/** Near-black pixel (letterbox bars baked into some AI exports). */
function isNearBlack(r: number, g: number, b: number, a: number): boolean {
  if (a < 12) return true
  return lum(r, g, b) <= 28 && Math.max(r, g, b) - Math.min(r, g, b) <= 18
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
  const agreeing = samples.filter((c) => colorDist(c, avg) <= 28).length
  if (agreeing < samples.length * 0.7) return null

  // Near-neutral mats only (grey / off-white / soft charcoal boards — not coloured backdrops).
  const max = Math.max(avg.r, avg.g, avg.b)
  const min = Math.min(avg.r, avg.g, avg.b)
  if (max - min > 28) return null
  // Allow darker mats (black letterbox boards) AND mid greys. Skip only pure white.
  if (max >= 248 && min >= 248) return null
  return avg
}

/**
 * Crop uniform letterbox / pillarbox bands (black bars or flat grey mats)
 * that span nearly the full width/height at the edges.
 */
function findContentBoundsAfterLetterbox(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mat: Rgba | null,
): { x: number; y: number; w: number; h: number } {
  const isBandPixel = (r: number, g: number, b: number, a: number) => {
    if (isNearWhiteOrTransparent(r, g, b, a)) return true
    if (isNearBlack(r, g, b, a)) return true
    if (mat && colorDist({ r, g, b }, mat) <= 30) return true
    return false
  }

  const rowIsBand = (y: number) => {
    let band = 0
    const step = Math.max(1, Math.floor(width / 80))
    let samples = 0
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      samples++
      if (isBandPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) band++
    }
    return samples > 0 && band / samples >= 0.92
  }

  const colIsBand = (x: number) => {
    let band = 0
    const step = Math.max(1, Math.floor(height / 80))
    let samples = 0
    for (let y = 0; y < height; y += step) {
      const i = (y * width + x) * 4
      samples++
      if (isBandPixel(data[i], data[i + 1], data[i + 2], data[i + 3])) band++
    }
    return samples > 0 && band / samples >= 0.92
  }

  let top = 0
  let bottom = height - 1
  let left = 0
  let right = width - 1
  // Thick AI letterboxes can eat ~40% per side on portrait exports.
  const maxBandY = Math.floor(height * 0.42)
  const maxBandX = Math.floor(width * 0.42)

  while (top < bottom && top < maxBandY && rowIsBand(top)) top++
  while (bottom > top && height - 1 - bottom < maxBandY && rowIsBand(bottom)) bottom--
  while (left < right && left < maxBandX && colIsBand(left)) left++
  while (right > left && width - 1 - right < maxBandX && colIsBand(right)) right--

  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
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
    // Dark mats: only treat as empty when very close (don't eat black tees).
    const threshold = lum(mat.r, mat.g, mat.b) < 50 ? 10 : 32
    return colorDist({ r, g, b }, mat) <= threshold
  }
}

export function findGarmentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } | null {
  const mat = detectMatColor(data, width, height)
  const letter = findContentBoundsAfterLetterbox(data, width, height, mat)

  const isEmpty = makeEmptyPixelTest(data, width, height)
  let minX = letter.x + letter.w
  let minY = letter.y + letter.h
  let maxX = letter.x - 1
  let maxY = letter.y - 1

  const xEnd = letter.x + letter.w
  const yEnd = letter.y + letter.h
  for (let y = letter.y; y < yEnd; y++) {
    for (let x = letter.x; x < xEnd; x++) {
      const i = (y * width + x) * 4
      if (isEmpty(data[i], data[i + 1], data[i + 2], data[i + 3])) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }

  if (maxX < minX || maxY < minY) {
    // Fall back to letterbox crop alone (e.g. black tee on black board).
    if (letter.w >= 8 && letter.h >= 8 && (letter.x > 0 || letter.y > 0 || letter.w < width || letter.h < height)) {
      return letter
    }
    return null
  }
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
    cbg: "ede8df",
    output: "png",
  })
  return `https://wsrv.nl/?${params.toString()}`
}

/**
 * Display URL when canvas trim isn't ready yet / fails.
 * Square contain on soft paper so white tees stay visible and tall AI
 * letterboxes don't render as a thin portrait strip.
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
    // Soft paper — not pure white (white garments vanish on #fff).
    cbg: "ede8df",
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

/** Warm in-memory fill cache from a known display URL (e.g. sessionStorage). */
export function warmWallFillCache(src: string, displayUrl: string): void {
  if (!src || !displayUrl) return
  if (!FILL_CACHE.has(src)) FILL_CACHE.set(src, displayUrl)
}

/**
 * Soft paper plate — white/cream garments stay visible (pure #fff eats them).
 * Dark garments still read cleanly on this tone.
 */
export const PRODUCT_PLATE = "#EDE8DF"
const PRODUCT_PLATE_RGB: Rgba = { r: 237, g: 232, b: 223 }

/**
 * True when the letterboxed frame is mostly light studio + light fabric
 * (white/cream tees). Bounds detection would only keep logos/tags.
 */
function isLightGarmentRegion(
  data: Uint8ClampedArray,
  width: number,
  region: { x: number; y: number; w: number; h: number },
): boolean {
  const x0 = region.x + Math.floor(region.w * 0.15)
  const x1 = region.x + Math.floor(region.w * 0.85)
  const y0 = region.y + Math.floor(region.h * 0.15)
  const y1 = region.y + Math.floor(region.h * 0.85)
  let light = 0
  let mid = 0
  let dark = 0
  let total = 0
  const step = 2
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4
      total++
      if (data[i + 3] < 12) {
        light++
        continue
      }
      const L = lum(data[i], data[i + 1], data[i + 2])
      if (L >= 200) light++
      else if (L >= 80) mid++
      else dark++
    }
  }
  if (total === 0) return false
  // White tee: lots of light pixels, almost no mid-tone fabric body.
  return light / total >= 0.55 && mid / total < 0.22
}

/**
 * Analyze garment pixels, crop studio padding / letterbox bars, redraw into a
 * square that fills ~94% of a soft paper plate so every Wall tile reads the
 * same size — including white tees (never bleach fabric to pure white).
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
  sctx.fillStyle = PRODUCT_PLATE
  sctx.fillRect(0, 0, sw, sh)
  sctx.drawImage(img, 0, 0, sw, sh)

  const { data } = sctx.getImageData(0, 0, sw, sh)
  const mat = detectMatColor(data, sw, sh)
  const letter = findContentBoundsAfterLetterbox(data, sw, sh, mat)
  const letterArea = Math.max(1, letter.w * letter.h)

  const lightGarment = isLightGarmentRegion(data, sw, letter)
  let bounds = findGarmentBounds(data, sw, sh)

  // White/cream tees: bounds collapse to logo/tag — keep the letterboxed frame.
  // Dark tees: tight-crop. Tiny crops always fall back to letter (never raw + bars).
  if (lightGarment || !bounds || bounds.w < 8 || bounds.h < 8) {
    bounds = letter
  } else if (bounds.w * bounds.h < letterArea * 0.18) {
    bounds = letter
  }

  if (!bounds || bounds.w < 8 || bounds.h < 8) {
    const fallback = wallFillDisplayUrl(src)
    setCachedWallFill(src, fallback)
    return fallback
  }

  const pad = Math.round(Math.max(bounds.w, bounds.h) * (lightGarment ? 0.02 : 0.04))
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
  octx.fillStyle = PRODUCT_PLATE
  octx.fillRect(0, 0, outSize, outSize)

  // Fill most of the square (same visual weight for tees and wide shirts).
  const inset = outSize * 0.03
  const box = outSize - inset * 2
  const fit = Math.min(box / cropW, box / cropH)
  const dw = cropW * fit
  const dh = cropH * fit
  const dx = (outSize - dw) / 2
  const dy = (outSize - dh) / 2

  octx.drawImage(scan, cropX, cropY, cropW, cropH, dx, dy, dw, dh)

  // Only bleach leftover studio padding for DARK garments. Whitening near-white
  // pixels destroys white/cream fabric (Fred Perry logo-only look).
  if (!lightGarment) {
    const outData = octx.getImageData(0, 0, outSize, outSize)
    const px = outData.data
    const matIsDark = Boolean(mat && lum(mat.r, mat.g, mat.b) < 60)
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i]
      const g = px[i + 1]
      const b = px[i + 2]
      const a = px[i + 3]
      if (a < 12) {
        px[i] = PRODUCT_PLATE_RGB.r
        px[i + 1] = PRODUCT_PLATE_RGB.g
        px[i + 2] = PRODUCT_PLATE_RGB.b
        px[i + 3] = 255
        continue
      }
      // Pure studio white only — not off-white fabric (240–247).
      if (r >= 252 && g >= 252 && b >= 252) {
        px[i] = PRODUCT_PLATE_RGB.r
        px[i + 1] = PRODUCT_PLATE_RGB.g
        px[i + 2] = PRODUCT_PLATE_RGB.b
        continue
      }
      if (!mat || matIsDark) continue
      const matLum = lum(mat.r, mat.g, mat.b)
      if (matLum > 210) continue
      if (colorDist({ r, g, b }, mat) <= 16) {
        px[i] = PRODUCT_PLATE_RGB.r
        px[i + 1] = PRODUCT_PLATE_RGB.g
        px[i + 2] = PRODUCT_PLATE_RGB.b
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
