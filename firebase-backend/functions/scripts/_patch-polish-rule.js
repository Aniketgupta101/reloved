const fs = require("fs")
const path = require("path")

const target = path.join(__dirname, "../src/lib/photoAnalyze.ts")
const src = fs.readFileSync(target, "utf8")
const marker = "export type ItemImageForPolish = {"
const idx = src.indexOf(marker)
if (idx < 0) throw new Error("marker not found")
const head = src.slice(0, idx)

const next = `export type ItemImageForPolish = {
  storagePath: string
  imageType: string
  sortOrder: number
  bgRemoved?: boolean
}

export type PolishItemImagesResult = {
  images: ItemImageForPolish[]
  allReady: boolean
  /** True when no donor-uploaded original could be identified for this item. */
  missingOriginal: boolean
  originalCount: number
}

function dedupeByPath(images: ItemImageForPolish[]): ItemImageForPolish[] {
  const seen = new Set<string>()
  const out: ItemImageForPolish[] = []
  for (const img of images) {
    const key = String(img.storagePath || "").trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(img)
  }
  return out
}

/** Donor upload (not AI). Typed original, or untyped room photo (bgRemoved false). */
function isDonorOriginal(img: ItemImageForPolish): boolean {
  if (!img.storagePath) return false
  if (img.imageType === "modelled") return false
  if (img.imageType === "original") return true
  if (img.bgRemoved !== true) return true
  return false
}

function isAiModelled(img: ItemImageForPolish): boolean {
  if (!img.storagePath) return false
  return img.imageType === "modelled"
}

/**
 * FINAL GALLERY RULE (strict):
 *   1 AI-generated (modelled) image  +  ALL donor-uploaded originals
 *   Order: AI → original1 → original2 → …
 *
 * - Reuses an existing modelled image when present (does not mint extra AI shots).
 * - BG-removes each donor original in place (product unchanged).
 * - Never invents originals from AI, never mixes other items' paths.
 */
export async function polishItemImages(
  images: ItemImageForPolish[],
  opts?: { force?: boolean },
): Promise<PolishItemImagesResult> {
  const envSkipBg = process.env.RELOVED_PHOTO_BG_REMOVE !== "1"
  if (envSkipBg) {
    return {
      images,
      allReady: true,
      missingOriginal: false,
      originalCount: images.filter(isDonorOriginal).length,
    }
  }

  const force = Boolean(opts?.force)
  const input = dedupeByPath(images)

  const existingAi =
    input.find((img) => isAiModelled(img) && img.bgRemoved === true) ||
    input.find((img) => isAiModelled(img)) ||
    null

  // Strict originals only — never treat other polished product rows as uploads.
  const donorOriginals = dedupeByPath(input.filter(isDonorOriginal)).sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )
  const missingOriginal = donorOriginals.length === 0

  // Fast path: already correct shape (1 modelled + N bg-removed originals).
  if (!force) {
    const originalsReady = donorOriginals.filter((img) => img.bgRemoved === true)
    const stray = input.filter(
      (img) =>
        img.storagePath &&
        img.storagePath !== existingAi?.storagePath &&
        !isDonorOriginal(img) &&
        img.imageType !== "modelled",
    )
    if (
      existingAi &&
      donorOriginals.length > 0 &&
      originalsReady.length === donorOriginals.length &&
      stray.length === 0
    ) {
      return {
        images: [
          { ...existingAi, imageType: "modelled", sortOrder: 0, bgRemoved: true },
          ...originalsReady.map((img, i) => ({
            ...img,
            imageType: "original",
            sortOrder: i + 1,
            bgRemoved: true,
          })),
        ],
        allReady: true,
        missingOriginal: false,
        originalCount: originalsReady.length,
      }
    }
  }

  const out: ItemImageForPolish[] = []

  // 1) Exactly one AI image — reuse existing when present.
  if (existingAi?.storagePath) {
    out.push({
      storagePath: existingAi.storagePath,
      imageType: "modelled",
      sortOrder: 0,
      bgRemoved: true,
    })
  } else if (donorOriginals[0]?.storagePath) {
    const src = await fetchImageBuffer(donorOriginals[0].storagePath)
    if (src?.buffer?.length) {
      try {
        const processed = await processPhoto(src.buffer, src.mimeType, {
          skipBg: false,
          required: false,
        })
        if (processed.bgRemoved) {
          const saved = await uploadImage(processed.buffer, "donations", processed.mimeType)
          out.push({
            storagePath: saved.url,
            imageType: "modelled",
            sortOrder: 0,
            bgRemoved: true,
          })
        }
      } catch (err) {
        console.error("polishItemImages AI modelled failed:", donorOriginals[0].storagePath, err)
      }
    }
  } else {
    // Legacy: only polished product rows — keep a single hero labelled modelled.
    const legacyHero = input.find((img) => img.bgRemoved === true && img.storagePath)
    if (legacyHero) {
      out.push({
        storagePath: legacyHero.storagePath,
        imageType: "modelled",
        sortOrder: 0,
        bgRemoved: true,
      })
    }
  }

  // 2) Every donor original, BG-removed, product unchanged.
  let order = out.length
  for (const donor of donorOriginals) {
    if (out.some((img) => img.storagePath === donor.storagePath && img.imageType === "modelled")) {
      continue
    }
    if (!force && donor.bgRemoved === true && donor.imageType === "original") {
      out.push({
        storagePath: donor.storagePath,
        imageType: "original",
        sortOrder: order++,
        bgRemoved: true,
      })
      continue
    }
    const fetched = await fetchImageBuffer(donor.storagePath)
    if (!fetched?.buffer?.length) {
      out.push({
        storagePath: donor.storagePath,
        imageType: "original",
        sortOrder: order++,
        bgRemoved: Boolean(donor.bgRemoved),
      })
      continue
    }
    try {
      const flat = await flatProductCutout(fetched.buffer, fetched.mimeType)
      if (flat) {
        const saved = await uploadImage(flat.buffer, "donations", flat.mimeType)
        out.push({
          storagePath: saved.url,
          imageType: "original",
          sortOrder: order++,
          bgRemoved: true,
        })
      } else {
        out.push({
          storagePath: donor.storagePath,
          imageType: "original",
          sortOrder: order++,
          bgRemoved: false,
        })
      }
    } catch (err) {
      console.error("polishItemImages original cutout failed:", donor.storagePath, err)
      out.push({
        storagePath: donor.storagePath,
        imageType: "original",
        sortOrder: order++,
        bgRemoved: false,
      })
    }
  }

  out.forEach((img, i) => {
    img.sortOrder = i
  })

  return {
    images: out,
    allReady: out.some((img) => img.imageType === "modelled"),
    missingOriginal,
    originalCount: out.filter((img) => img.imageType === "original").length,
  }
}
`

fs.writeFileSync(target, head + next)
console.log("ok", target, "len", head.length + next.length)
