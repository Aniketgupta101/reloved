/**
 * Rename wall assets to proper product filenames (no IMG_####) and
 * strip numeric suffixes from item slugs / titles.
 *
 * Usage (from backend/): npx tsx scripts/rename-wall-assets.ts
 */
import "dotenv/config"
import { copyFile, mkdir, readFile, rename, writeFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, "../..")
const WALL = path.join(ROOT, "frontend/public/images/wall-items")
const UPLOADS = path.join(ROOT, "backend/uploads/items")
const ASSET_BASE = process.env.PUBLIC_ASSET_BASE || "https://3-110-214-193.sslip.io"

type Row = {
  stem: string // IMG_6293
  file: string // descriptive.png
  title: string
  /** optional second image (back) */
  backStem?: string
  backFile?: string
}

function toSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/** Canonical catalogue — proper names, no camera roll IDs. */
const CATALOG: Row[] = [
  { stem: "IMG_6293", file: "zanella-white-linen-embroidered-tunic.png", title: "Zanella White Linen Embroidered Tunic Top" },
  { stem: "IMG_6299", file: "black-cargo-jogger-pants.png", title: "Black Cargo Jogger Pants" },
  { stem: "IMG_6301", file: "hm-grey-chino-shorts.png", title: "H&M Grey Button-Fly Chino Shorts" },
  { stem: "IMG_6303", file: "distressed-grey-graphic-vneck-tee.png", title: "Distressed Grey Graphic V-Neck Tee" },
  { stem: "IMG_6309", file: "black-long-sleeve-crewneck-tee.png", title: "Black Long-Sleeve Crewneck Tee" },
  { stem: "IMG_6310", file: "abercrombie-green-af-ny-92-tee.png", title: "Abercrombie & Fitch Green AF NY 92 Tee" },
  {
    stem: "IMG_6311",
    file: "marvel-hulk-comic-battles-tee.png",
    title: "Marvel Hulk Comic Battles Graphic Tee",
    backStem: "IMG_6312",
    backFile: "marvel-hulk-comic-battles-tee-back.png",
  },
  { stem: "IMG_6314", file: "hm-grey-henley-long-sleeve.png", title: "H&M Grey Henley Long Sleeve" },
  { stem: "IMG_6316", file: "abercrombie-kids-black-moose-tee.png", title: "Abercrombie Kids Black Moose Tee" },
  {
    stem: "IMG_6317",
    file: "hunter-x-hunter-hisoka-tee.png",
    title: "Hunter x Hunter Hisoka Graphic Tee",
    backStem: "IMG_6318",
    backFile: "hunter-x-hunter-hisoka-tee-back.png",
  },
  { stem: "IMG_6320", file: "surfs-on-graphic-tee.png", title: "Surf's On Graphic Tee" },
  { stem: "IMG_6321", file: "dark-grey-zip-pocket-joggers.png", title: "Dark Grey Zip-Pocket Joggers" },
  { stem: "IMG_6322", file: "true-religion-grey-navy-block-tee.png", title: "True Religion Grey & Navy Block Tee" },
  { stem: "IMG_6323", file: "orca-print-navy-kids-tee.png", title: "Orca Print Navy Kids Tee" },
  { stem: "IMG_6325", file: "shark-water-kids-tee.png", title: "Shark Water Kids Tee" },
  {
    stem: "IMG_6327",
    file: "batman-interactive-sequin-tee.png",
    title: "Batman Interactive Sequin Tee",
    backStem: "IMG_6328",
    backFile: "batman-interactive-sequin-tee-back.png",
  },
  { stem: "IMG_6329", file: "polo-ralph-lauren-kids-navy-logo-tee.png", title: "Polo Ralph Lauren Kids Navy Logo Tee" },
  { stem: "IMG_6330", file: "kids-navy-crew-tee.png", title: "Kids Navy Crew Tee" },
  { stem: "IMG_6331", file: "kids-soft-cotton-tee.png", title: "Kids Soft Cotton Tee" },
  { stem: "IMG_6332", file: "kids-black-skeleton-dance-tee.png", title: "Kids Black Skeleton Dance Tee" },
  { stem: "IMG_6333", file: "converse-camo-chuck-taylor-tee.png", title: "Converse Camo Chuck Taylor Tee" },
  { stem: "IMG_6334", file: "abstract-grunge-print-kids-tee.png", title: "Abstract Grunge Print Kids Tee" },
  { stem: "IMG_6336", file: "kids-everyday-crew-tee.png", title: "Kids Everyday Crew Tee" },
  { stem: "IMG_6337", file: "kids-classic-crew-tee.png", title: "Kids Classic Crew Tee" },
  { stem: "IMG_6338", file: "kids-character-pajama-set.png", title: "Kids Character Pajama Set" },
  { stem: "IMG_6396", file: "spirit-halloween-baby-spider-costume.png", title: "Spirit Halloween Baby Spider Belly Costume" },
  { stem: "IMG_6397", file: "lego-marvel-comics-baseball-cap.png", title: "LEGO Marvel Comics Baseball Cap" },
  { stem: "IMG_6399", file: "thor-avengers-superhero-costume.png", title: "Thor Avengers Superhero Costume with Cape" },
  { stem: "IMG_6400", file: "teen-titans-robin-costume.png", title: "Teen Titans Go! Robin Costume" },
  { stem: "IMG_6403", file: "zara-lemon-ice-lolly-graphic-tee.png", title: "Zara Lemon Ice Lolly Graphic Tee" },
  { stem: "IMG_6404", file: "dont-tell-my-mom-graphic-tee.png", title: "Don't Tell My Mom Graphic Tee" },
  { stem: "IMG_6405", file: "polo-ralph-lauren-bear-crest-tee.png", title: "Polo Ralph Lauren Bear Crest Tee" },
]

async function moveAsset(fromStem: string, toFile: string) {
  const fromName = `${fromStem}.png`
  const srcPublic = path.join(WALL, fromName)
  const destPublic = path.join(WALL, toFile)
  const srcUpload = path.join(UPLOADS, fromName)
  const destUpload = path.join(UPLOADS, toFile)

  await mkdir(WALL, { recursive: true })
  await mkdir(UPLOADS, { recursive: true })

  try {
    await readFile(srcPublic)
    await copyFile(srcPublic, destPublic)
    console.log(`  file ${fromName} → ${toFile}`)
  } catch {
    try {
      await readFile(destPublic)
      console.log(`  file ${toFile} already present`)
    } catch {
      console.warn(`  MISSING ${fromName}`)
      return false
    }
  }

  try {
    await readFile(srcUpload)
    await copyFile(srcUpload, destUpload)
  } catch {
    try {
      await copyFile(destPublic, destUpload)
    } catch {
      /* ignore */
    }
  }
  return true
}

async function main() {
  const usedSlugs = new Set<string>()
  const frontendExport: Array<{
    file: string
    title: string
    gender: string
    size: string
    description: string
    status: string
  }> = []

  for (const row of CATALOG) {
    console.log(`\n→ ${row.stem} → ${row.file}`)
    const ok = await moveAsset(row.stem, row.file)
    if (!ok) continue
    if (row.backStem && row.backFile) {
      await moveAsset(row.backStem, row.backFile)
    }

    const item = await prisma.item.findFirst({
      where: {
        images: { some: { storagePath: { contains: row.stem } } },
      },
      include: { images: { orderBy: { sortOrder: "asc" } } },
    })
    if (!item) {
      console.warn(`  no DB item for ${row.stem}`)
      continue
    }

    let slug = toSlug(row.title)
    if (usedSlugs.has(slug)) {
      // rare collision — differentiate by size keyword, still no camera id
      slug = `${slug}-${toSlug(item.size || "item")}`
    }
    // ensure unique in DB
    let finalSlug = slug
    let n = 2
    while (true) {
      const clash = await prisma.item.findFirst({
        where: { slug: finalSlug, NOT: { id: item.id } },
      })
      if (!clash) break
      finalSlug = `${slug}-${n++}`
    }
    usedSlugs.add(finalSlug)

    const primaryUrl = `${ASSET_BASE}/images/wall-items/${row.file}?v=named1`
    await prisma.itemImage.updateMany({
      where: { itemId: item.id, storagePath: { contains: row.stem } },
      data: { storagePath: primaryUrl, sortOrder: 0 },
    })
    if (row.backStem && row.backFile) {
      const backUrl = `${ASSET_BASE}/images/wall-items/${row.backFile}?v=named1`
      const backImg = item.images.find((im) => im.storagePath.includes(row.backStem!))
      if (backImg) {
        await prisma.itemImage.update({
          where: { id: backImg.id },
          data: { storagePath: backUrl, sortOrder: 1 },
        })
      } else {
        await prisma.itemImage.create({
          data: {
            itemId: item.id,
            storagePath: backUrl,
            sortOrder: 1,
            imageType: "product",
          },
        })
      }
    }

    await prisma.item.update({
      where: { id: item.id },
      data: {
        title: row.title,
        slug: finalSlug,
        description:
          item.description && !/boys item|men's item|boys tee \d/i.test(item.description)
            ? item.description
            : `${row.title}. Size ${item.size || ""}.`.trim(),
      },
    })
    console.log(`  slug ${item.slug} → ${finalSlug}`)

    frontendExport.push({
      file: row.file,
      title: row.title,
      gender: item.gender || "unisex",
      size: item.size || "",
      description:
        item.description && !/boys item|men's item|boys tee \d/i.test(item.description)
          ? item.description
          : `${row.title}. Size ${item.size || ""}.`.trim(),
      status: item.publicStatus || "available",
    })
  }

  const outJson = path.join(__dirname, "wall-catalog-named.json")
  await writeFile(outJson, JSON.stringify(frontendExport, null, 2))
  console.log(`\nWrote ${outJson} (${frontendExport.length} items)`)
  await prisma.$disconnect()
}

main().catch(async (e) => {
  console.error(e)
  await prisma.$disconnect()
  process.exit(1)
})
