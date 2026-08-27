/**
 * Seed Wall of Kindness from Sheetal's labelled Assets + Gemini titles.
 * Ground-truth gender/size come from the WhatsApp labels; Gemini fills
 * category/title/description/condition (overridable).
 *
 * Usage (from backend/):
 *   npx tsx scripts/seed-wall-kindness.ts
 */
import "dotenv/config"
import { createHash } from "crypto"
import { copyFile, mkdir, readFile, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import sharp from "sharp"
import { PrismaClient } from "@prisma/client"
import { suggestItemDetails } from "../server/lib/gemini.js"
import { removeBackgroundToWhite } from "../server/lib/bgRemoval.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND_ROOT = path.join(__dirname, "..")
const REPO_ROOT = path.join(BACKEND_ROOT, "..")
const SRC_DIR = path.join(REPO_ROOT, "frontend", "assets", ".aistudio", "Assets")
const OUT_PUBLIC = path.join(REPO_ROOT, "frontend", "public", "images", "wall-items")
const OUT_UPLOADS = path.join(BACKEND_ROOT, "uploads", "items")

type Gender = "men" | "women" | "unisex" | "kids"

/** One catalogue row — primary photo + optional back photo. */
type CatalogRow = {
  id: string
  files: string[] // jpeg stems in Assets, e.g. IMG_6311
  gender: Gender
  size: string
  note?: string
}

// Source of truth from Sheetal's WhatsApp labels (Aug 2026).
const CATALOG: CatalogRow[] = [
  { id: "6293", files: ["IMG_6293"], gender: "men", size: "Free size" },
  { id: "6299", files: ["IMG_6299"], gender: "men", size: "S" },
  { id: "6301", files: ["IMG_6301"], gender: "men", size: "32" },
  { id: "6303", files: ["IMG_6303"], gender: "men", size: "S" },
  { id: "6309", files: ["IMG_6309"], gender: "men", size: "S" },
  { id: "6310", files: ["IMG_6310"], gender: "men", size: "S" },
  { id: "6311", files: ["IMG_6311", "IMG_6312"], gender: "men", size: "M", note: "front+back" },
  { id: "6314", files: ["IMG_6314"], gender: "men", size: "M" },
  { id: "6316", files: ["IMG_6316"], gender: "kids", size: "Boys 17/18 yrs" },
  { id: "6317", files: ["IMG_6317", "IMG_6318"], gender: "kids", size: "Boys XXS 11/12 yrs", note: "front+back" },
  { id: "6320", files: ["IMG_6320"], gender: "kids", size: "Boys 10/12 yrs" },
  { id: "6321", files: ["IMG_6321"], gender: "kids", size: "Boys M 10/12 yrs" },
  { id: "6322", files: ["IMG_6322"], gender: "kids", size: "Boys 5/6 yrs" },
  { id: "6323", files: ["IMG_6323"], gender: "kids", size: "Boys 8/10 yrs" },
  { id: "6325", files: ["IMG_6325"], gender: "kids", size: "Boys 6/8 yrs" },
  { id: "6327", files: ["IMG_6327", "IMG_6328"], gender: "kids", size: "Boys 6/8 yrs", note: "interactive tee front+back" },
  { id: "6329", files: ["IMG_6329"], gender: "kids", size: "Boys 6/7 yrs" },
  { id: "6330", files: ["IMG_6330"], gender: "kids", size: "Boys 6/7 yrs" },
  { id: "6331", files: ["IMG_6331"], gender: "kids", size: "Boys 6 yrs" },
  { id: "6332", files: ["IMG_6332"], gender: "kids", size: "Boys 6 yrs" },
  { id: "6333", files: ["IMG_6333"], gender: "kids", size: "Boys 8/10 yrs" },
  { id: "6334", files: ["IMG_6334"], gender: "kids", size: "Boys 7/8 yrs" },
  { id: "6336", files: ["IMG_6336"], gender: "kids", size: "Boys 9 yrs" },
  { id: "6337", files: ["IMG_6337"], gender: "kids", size: "Boys 8 yrs" },
  { id: "6338", files: ["IMG_6338"], gender: "kids", size: "Boys 8/9 yrs" },
  { id: "6396", files: ["IMG_6396"], gender: "unisex", size: "2–4 yrs" },
  { id: "6397", files: ["IMG_6397"], gender: "unisex", size: "Free size" },
  { id: "6399", files: ["IMG_6399"], gender: "kids", size: "Boys 7–10 yrs" },
  { id: "6400", files: ["IMG_6400"], gender: "kids", size: "Boys 4/6 yrs" },
  { id: "6403", files: ["IMG_6403"], gender: "men", size: "M" },
  { id: "6404", files: ["IMG_6404"], gender: "kids", size: "Boys 6/7 yrs" },
  { id: "6405", files: ["IMG_6405"], gender: "kids", size: "Boys 12 yrs" },
]

const prisma = new PrismaClient()
const PUBLIC_ASSET_BASE = process.env.PUBLIC_ASSET_BASE || "https://reloved.digital"

function slugify(title: string, id: string) {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return `${base}-${id}`
}

async function findSource(stem: string): Promise<string | null> {
  for (const ext of [".jpeg", ".JPEG", ".jpg", ".JPG", ".png", ".PNG"]) {
    const p = path.join(SRC_DIR, `${stem}${ext}`)
    try {
      await readFile(p)
      return p
    } catch {
      /* try next */
    }
  }
  // Fallback: already-processed PNG in public wall-items
  const fallback = path.join(OUT_PUBLIC, `${stem}.png`)
  try {
    await readFile(fallback)
    return fallback
  } catch {
    return null
  }
}

/**
 * Prefer existing clean cutouts. For new JPEGs, run the same rembg → white
 * pipeline as donor/admin uploads (not a plain flatten — that keeps rug/floor).
 */
async function processToPng(srcPath: string, destStem: string, force = false): Promise<string> {
  const destName = `${destStem}.png`
  const destPublic = path.join(OUT_PUBLIC, destName)
  const destUpload = path.join(OUT_UPLOADS, destName)

  const isJpegSource = /\.jpe?g$/i.test(srcPath)

  // Reuse existing cutout only when we're not forcing a refresh of a raw jpeg
  if (!force && !isJpegSource) {
    try {
      await readFile(destPublic)
      await mkdir(OUT_UPLOADS, { recursive: true })
      await copyFile(destPublic, destUpload).catch(async () => {
        await sharp(destPublic).toFile(destUpload)
      })
      return destName
    } catch {
      /* process */
    }
  } else if (!force) {
    try {
      // Keep prior cutout if it already looks processed (smaller / exists) and
      // FORCE_WALL_CUTOUTS is not set — set FORCE_WALL_CUTOUTS=1 to rembg all.
      if (process.env.FORCE_WALL_CUTOUTS !== "1") {
        await readFile(destPublic)
        await mkdir(OUT_UPLOADS, { recursive: true })
        await copyFile(destPublic, destUpload).catch(async () => {
          await sharp(destPublic).toFile(destUpload)
        })
        return destName
      }
    } catch {
      /* process */
    }
  }

  await mkdir(OUT_PUBLIC, { recursive: true })
  await mkdir(OUT_UPLOADS, { recursive: true })

  const prepared = await sharp(await readFile(srcPath))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer()

  const cut = await removeBackgroundToWhite(prepared, "image/jpeg")
  const buf = await sharp(cut)
    .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await writeFile(destPublic, buf)
  await writeFile(destUpload, buf)
  return destName
}

function closetImageUrl(file: string) {
  // Prefer cPanel static host for public site; Lightsail also serves /uploads/items/
  return `${PUBLIC_ASSET_BASE}/images/wall-items/${file}`
}

async function main() {
  console.log(`Catalog rows: ${CATALOG.length}`)
  await mkdir(OUT_PUBLIC, { recursive: true })
  await mkdir(OUT_UPLOADS, { recursive: true })

  const submission = await prisma.donationSubmission.upsert({
    where: { reference: "CLOSET-AUG-2026" },
    create: {
      reference: "CLOSET-AUG-2026",
      donorFirstName: "Reloved",
      donorLastName: "Closet",
      phone: "0000000000",
      email: "hello@reloved.digital",
      locality: "Mumbai",
      status: "approved",
      recognitionPreference: "anonymous",
    },
    update: { status: "approved" },
  })

  const frontendExport: Array<{
    file: string
    title: string
    gender: string
    size: string
    description: string
    status: "available"
  }> = []

  for (const row of CATALOG) {
    const primaryStem = row.files[0]
    const src = await findSource(primaryStem)
    if (!src) {
      console.warn(`SKIP ${primaryStem}: no source file`)
      continue
    }

    console.log(`\n→ ${primaryStem} (${row.gender}, ${row.size})`)
    const destFiles: string[] = []
    for (const stem of row.files) {
      const s = await findSource(stem)
      if (!s) {
        console.warn(`  missing secondary ${stem}`)
        continue
      }
      const name = await processToPng(s, stem)
      destFiles.push(name)
      console.log(`  image ${name}`)
    }
    if (destFiles.length === 0) continue

    const imageBuf = await readFile(path.join(OUT_PUBLIC, destFiles[0]))
    const suggestion = await suggestItemDetails(imageBuf)

    // Ground-truth overrides from Sheetal's labels
    const gender = row.gender
    const size = row.size
    const category = suggestion.category === "Footwear" || suggestion.category === "Bags"
      ? suggestion.category
      : "Clothing"
    const title =
      suggestion.title && !/untitled|edit before|unavailable/i.test(suggestion.title)
        ? suggestion.title
        : `${gender === "kids" ? "Boys" : gender === "men" ? "Men's" : "Unisex"} item ${row.id}`
    const description =
      suggestion.description && !/unavailable in dev/i.test(suggestion.description)
        ? suggestion.description
        : `${title}. Size ${size}.`
    const condition = suggestion.condition || "Good"
    const slug = slugify(title, row.id)

    const existing = await prisma.item.findUnique({ where: { slug } })
    // Also find by prior closet slug patterns ending with -id
    const byId = existing
      ?? (await prisma.item.findFirst({
        where: { OR: [{ slug: { endsWith: `-${row.id}` } }, { slug: { contains: row.id } }] },
        include: { images: true },
      }))

    const imageCreates = destFiles.map((file, i) => ({
      storagePath: closetImageUrl(file),
      sortOrder: i,
    }))

    if (byId) {
      await prisma.itemImage.deleteMany({ where: { itemId: byId.id } })
      await prisma.item.update({
        where: { id: byId.id },
        data: {
          slug,
          title,
          category,
          description,
          condition,
          size,
          gender,
          quantity: 1,
          locality: "Mumbai",
          status: "approved",
          publicStatus: "available",
          publicVisibility: true,
          donorRecognition: "Anonymous",
          images: { create: imageCreates },
        },
      })
      console.log(`  updated ${slug}`)
    } else {
      await prisma.item.create({
        data: {
          submissionId: submission.id,
          slug,
          title,
          category,
          description,
          condition,
          size,
          gender,
          quantity: 1,
          locality: "Mumbai",
          status: "approved",
          publicStatus: "available",
          publicVisibility: true,
          donorRecognition: "Anonymous",
          images: { create: imageCreates },
        },
      })
      console.log(`  created ${slug}`)
    }

    frontendExport.push({
      file: destFiles[0],
      title,
      gender,
      size,
      description,
      status: "available",
    })
  }

  // Write a JSON snapshot the frontend can stay aligned with
  const outJson = path.join(BACKEND_ROOT, "scripts", "closet-catalog.generated.json")
  await writeFile(outJson, JSON.stringify(frontendExport, null, 2))
  console.log(`\nWrote ${outJson} (${frontendExport.length} items)`)
  console.log("DONE")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
