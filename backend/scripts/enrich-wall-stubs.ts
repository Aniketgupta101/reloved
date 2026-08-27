/**
 * Re-run Gemini on Wall items whose titles look like rate-limit stubs.
 * Keeps gender/size from DB (Sheetal labels). Usage from backend/:
 *   npx tsx scripts/enrich-wall-stubs.ts
 */
import "dotenv/config"
import { readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { PrismaClient } from "@prisma/client"
import { suggestItemDetails } from "../server/lib/gemini.js"

const prisma = new PrismaClient()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WALL = path.join(__dirname, "../../frontend/public/images/wall-items")
const DELAY_MS = Number(process.env.GEMINI_ENRICH_DELAY_MS || 8000)

function slugify(title: string, suffix: string) {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
  return suffix ? `${base}-${suffix}` : base
}

function isStubTitle(title: string) {
  return /^(Boys|Men's|Kids|Unisex) (tee|item|heather)/i.test(title)
    || /^Boys tee /i.test(title)
    || /^Men's heather grey Henley$/i.test(title)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const items = await prisma.item.findMany({
    where: { publicVisibility: true, publicStatus: "available" },
    include: { images: { orderBy: { sortOrder: "asc" } } },
    orderBy: { createdAt: "asc" },
  })

  const stubs = items.filter((i) => isStubTitle(i.title))
  console.log(`Available: ${items.length}; stubs to enrich: ${stubs.length}`)

  for (const item of stubs) {
    const file = (item.images[0]?.storagePath || "").split("/").pop()
    if (!file) {
      console.warn(`skip ${item.slug}: no image`)
      continue
    }
    const local = path.join(WALL, file)
    let buf: Buffer
    try {
      buf = await readFile(local)
    } catch {
      console.warn(`skip ${file}: missing on disk`)
      continue
    }

    console.log(`\n→ enrich ${file} was: ${item.title}`)
    const suggestion = await suggestItemDetails(buf)
    if (!suggestion.title || /untitled|unavailable|edit before/i.test(suggestion.title)) {
      console.warn(`  Gemini stub/fail — leaving as-is`)
      await sleep(DELAY_MS)
      continue
    }

    const title = suggestion.title
    const description = suggestion.description || `${title}. Size ${item.size || ""}.`
    const category =
      suggestion.category === "Footwear" || suggestion.category === "Bags"
        ? suggestion.category
        : "Clothing"
    const idSuffix = file.match(/(\d+)/)?.[1] || item.slug.slice(-4)
    const newSlug = slugify(title, idSuffix)

    const clash = await prisma.item.findFirst({
      where: { slug: newSlug, NOT: { id: item.id } },
    })
    const slug = clash ? `${newSlug}-${item.id.slice(0, 6)}` : newSlug

    await prisma.item.update({
      where: { id: item.id },
      data: {
        title,
        description,
        category,
        brand: suggestion.brand,
        condition: suggestion.condition || item.condition,
        slug,
      },
    })
    console.log(`  → ${title} [${category}] slug=${slug}`)
    await sleep(DELAY_MS)
  }

  console.log("\nDone.")
  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
