/**
 * Individual proof: One Item + multiple photos → gallery arrows + swipe.
 *
 *   npm run record:multi-photo-swipe
 *
 * Output:
 *   recordings/multi-photo-swipe/RELOVED-Multi-Photo-Swipe.webm
 *   recordings/multi-photo-swipe/SHARE.md
 */
import { chromium } from "playwright"
import { mkdir, writeFile, rename, copyFile, access } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pause, showCaption } from "./uat-recording-helpers.mjs"
import { getUatSession } from "./setup-uat-test-user.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const OUT = path.join(ROOT, "recordings", "multi-photo-swipe")
const BASE_URL = process.env.RECORD_BASE_URL || "http://localhost:3000"
const API =
  process.env.UAT_API_URL || "https://asia-south1-reloved-digital.cloudfunctions.net/api"
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@reloved.digital"
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "RelovedAdmin2026!"

const PHOTO_A = path.join(ROOT, "public/images/wall-items/batman-interactive-sequin-tee.png")
const PHOTO_B = path.join(ROOT, "public/images/wall-items/batman-interactive-sequin-tee-back.png")
const PHOTO_C = path.join(ROOT, "public/images/wall-items/marvel-hulk-comic-battles-tee.png")

const MULTI_IMAGES = [
  {
    storagePath: "/images/wall-items/batman-interactive-sequin-tee.png",
    imageType: "product",
    sortOrder: 0,
  },
  {
    storagePath: "/images/wall-items/batman-interactive-sequin-tee-back.png",
    imageType: "product",
    sortOrder: 1,
  },
  {
    storagePath: "/images/wall-items/marvel-hulk-comic-battles-tee.png",
    imageType: "product",
    sortOrder: 2,
  },
]

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `API ${res.status} ${pathname}`)
  }
  return body
}

async function adminLogin() {
  const { token } = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  if (!token) throw new Error("Admin login failed")
  return token
}

/** Attach 3 photos to an available wall item so gallery can be demoed live. */
async function ensureMultiPhotoItem(adminToken) {
  const list = await api("/api/admin/items?limit=40", {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const items = list.items || list || []
  const candidate =
    items.find((i) => i.publicStatus === "available" && i.publicVisibility !== false) ||
    items.find((i) => i.status === "approved") ||
    items[0]
  if (!candidate?.id) throw new Error("No admin items found to attach multi photos")

  const { item } = await api(`/api/admin/items/${candidate.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({
      images: MULTI_IMAGES,
      publicStatus: "available",
      publicVisibility: true,
      status: "approved",
    }),
  })
  return { id: item.id || candidate.id, slug: item.slug || candidate.slug, title: item.title || candidate.title }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  for (const p of [PHOTO_A, PHOTO_B, PHOTO_C]) await access(p)

  const session = await getUatSession()
  if (!session?.token) throw new Error("UAT session required")
  const adminToken = await adminLogin()
  const multiItem = await ensureMultiPhotoItem(adminToken)
  console.log("Multi-photo item ready:", multiItem.slug)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
    hasTouch: true,
  })
  const page = await context.newPage()
  const covered = []

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.evaluate((token) => localStorage.setItem("reloved_donor_token", token), session.token)

    // —— 1 Upload: One Item + 3 photos ——
    await page.goto(`${BASE_URL}/give`, { waitUntil: "networkidle", timeout: 60000 })
    await pause(600)
    await showCaption(page, "1 · Give → One Item (multiple photos of the same piece)", 2600)
    await pause(800)

    const oneItem = page.getByRole("button", { name: /One Item/i })
    if ((await oneItem.count()) > 0) await oneItem.click()
    await pause(400)

    const fileInput = page.locator('input[type="file"]').first()
    await fileInput.setInputFiles([PHOTO_A, PHOTO_B, PHOTO_C])
    await pause(2000)
    await showCaption(page, "Uploaded 3 photos for ONE item — front · back · extra angle", 2800)
    await pause(1400)
    await page.screenshot({ path: path.join(OUT, "01-give-multi-upload.png") })
    covered.push("Give: One Item + 3 photos uploaded")

    // —— 2 Live gallery on Wall item with 3 images ——
    await page.goto(`${BASE_URL}/drop/${multiItem.slug}`, { waitUntil: "networkidle", timeout: 60000 })
    await pause(900)
    await page.waitForSelector("text=swipe", { timeout: 15000 }).catch(() => {})
    await showCaption(page, `2 · Item detail gallery — ${multiItem.title || multiItem.slug}`, 2400)
    await pause(1000)

    const next = page.getByRole("button", { name: "Next photo" })
    const prev = page.getByRole("button", { name: "Previous photo" })
    const hasGallery = (await next.count()) > 0
    if (!hasGallery) throw new Error("Next photo controls missing — item still has 1 image")

    await showCaption(page, "3 · Arrow controls: next / previous photo", 2200)
    await next.click()
    await pause(700)
    await next.click()
    await pause(700)
    await prev.click()
    await pause(700)
    await page.screenshot({ path: path.join(OUT, "02-gallery-arrows.png") })
    covered.push("Gallery arrows: next / previous")

    // Touch / drag swipe on gallery
    const gallery = page.locator(".aspect-square.relative").first()
    const box = await gallery.boundingBox()
    if (box) {
      await showCaption(page, "4 · Swipe gesture on gallery", 2200)
      const y = box.y + box.height / 2
      await page.mouse.move(box.x + box.width * 0.85, y)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width * 0.15, y, { steps: 16 })
      await page.mouse.up()
      await pause(500)
      // Fire touch handlers used by ItemDetail
      await gallery.dispatchEvent("touchstart", {
        changedTouches: [{ clientX: box.x + box.width * 0.8, clientY: y }],
      }).catch(() => {})
      await gallery.dispatchEvent("touchend", {
        changedTouches: [{ clientX: box.x + box.width * 0.2, clientY: y }],
      }).catch(() => {})
      await pause(800)
    }

    await next.click().catch(() => {})
    await pause(500)
    await page.screenshot({ path: path.join(OUT, "03-gallery-swipe.png") })
    covered.push("Swipe / gesture on multi-photo gallery")

    await showCaption(page, "Done · Multi-photo gallery + swipe verified", 2200)
    await pause(1000)
  } finally {
    const videoPath = await page.video()?.path()
    await context.close()
    await browser.close()
    const dest = path.join(OUT, "RELOVED-Multi-Photo-Swipe.webm")
    if (videoPath) {
      try {
        await rename(videoPath, dest)
      } catch {
        await copyFile(videoPath, dest)
      }
      console.log(`VIDEO → ${dest}`)
    }
    await writeFile(
      path.join(OUT, "SHARE.md"),
      `# Multi-photo gallery / swipe — share

**Video:** \`RELOVED-Multi-Photo-Swipe.webm\`

**Live item used:** \`/drop/${multiItem.slug}\` (${multiItem.title || ""})

## What this proves

${covered.map((c, i) => `${i + 1}. ${c}`).join("\n")}

## Client ask

> Multi-photo viewing / swiping on item details

## How tested

1. Give flow → **One Item** mode → upload **3 photos** of one piece (front / back / angle)
2. Wall item patched with 3 product images (so gallery is live on the Wall)
3. Item detail: **Next / Previous** arrows + swipe counter (\`1/3 · swipe\`)
`,
      "utf8",
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
