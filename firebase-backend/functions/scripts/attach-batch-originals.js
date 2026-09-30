/**
 * Attach local batch originals to Wall items (AI stays front; BG-removed original = 2nd).
 *
 * Folders:
 *   main_tshirts_images  → jj shirts/polos (+ White Giordano)
 *   main_pants_images    → Waseem pants/chinos
 *   Reloved Images       → HEIC batch (converted) matched later if --heic
 *
 *   node scripts/attach-batch-originals.js [--dry-run] [--only=tshirts|pants|heic]
 */
const fs = require("fs")
const path = require("path")
const convert = require("heic-convert")

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = val
  }
}

loadEnv(path.join(__dirname, "../.env.reloved-digital"))

function argFlag(name) {
  return process.argv.includes(name)
}
function argString(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  return hit.slice(name.length + 1) || fallback
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function scoreTitle(fileStem, title) {
  const f = norm(fileStem)
  const t = norm(title)
  if (!f || !t) return 0
  let score = 0
  const tokens = f.split(" ").filter((w) => w.length > 2)
  for (const tok of tokens) {
    if (t.includes(tok)) score += tok.length >= 5 ? 3 : 1
  }
  // brand boosts
  for (const brand of [
    "boss",
    "hugo",
    "canali",
    "brooks",
    "brothers",
    "scotch",
    "soda",
    "giordano",
    "armani",
    "paul",
    "smith",
    "scalpers",
  ]) {
    if (f.includes(brand) && t.includes(brand)) score += 4
  }
  return score
}

/** Explicit overrides where filename → wall title is unambiguous. */
const EXPLICIT = [
  // pants / Waseem
  { fileIncludes: "black_dress_pants", titleIncludes: ["black dress pants"] },
  { fileIncludes: "brooksbrothers_khaki", titleIncludes: ["brooks brothers khaki"] },
  { fileIncludes: "boss_charcoal_brown", titleIncludes: ["boss charcoal brown"] },
  { fileIncludes: "armani_jeans", titleIncludes: ["armani jeans"] },
  { fileIncludes: "navy_corduroy", titleIncludes: ["navy corduroy"] },
  { fileIncludes: "stuart_mustard", titleIncludes: ["stuart mustard"] },
  { fileIncludes: "soho_greyolive", titleIncludes: ["soho greyolive", "soho grey"] },
  { fileIncludes: "thedrop_jeans", titleIncludes: ["thedrop"] },
  { fileIncludes: "mott_blue", titleIncludes: ["mott blue"] },
  { fileIncludes: "mott_green", titleIncludes: ["mott green"] },
  // tshirts / jj
  { fileIncludes: "bluegrey_striped_boss_polo", titleIncludes: ["boss striped polo"] },
  { fileIncludes: "02_red_boss_polo", titleIncludes: ["boss red polo"] },
  { fileIncludes: "red_boss_polo", titleIncludes: ["boss red polo"] },
  { fileIncludes: "navy_boss_polo_striped_collar", titleIncludes: ["boss men's navy", "navy polo"] },
  { fileIncludes: "olive_scotchsoda_polo", titleIncludes: ["scotch & soda green polo", "green polo"] },
  { fileIncludes: "sage_giordano_polo", titleIncludes: ["giordano polo"] },
  { fileIncludes: "white_giordano_polo", titleIncludes: ["white giordano"] },
  { fileIncludes: "white_boss_polo", titleIncludes: ["boss white polo"] },
  { fileIncludes: "canali_floral", titleIncludes: ["canali men's patterned"] },
  { fileIncludes: "canali_arrow", titleIncludes: ["canali blue speckled"] },
  { fileIncludes: "brooksbrothers_houndstooth", titleIncludes: ["brooks brothers light blue"] },
  { fileIncludes: "canali_blackedition_stripe", titleIncludes: ["canali striped"] },
  { fileIncludes: "canali_geometric_stripe", titleIncludes: ["canali long-sleeve shirt", "canali long sleeve"] },
  { fileIncludes: "canali_crosshatch", titleIncludes: ["canali long-sleeve", "canali long sleeve"] },
  { fileIncludes: "boss_chambray_polkadot", titleIncludes: ["boss pink"] },
  { fileIncludes: "hugo_wavydot", titleIncludes: ["hugo yellow"] },
  { fileIncludes: "navy_boss_polo_green_tipping", titleIncludes: ["boss black polo", "boss men's navy"] },
  { fileIncludes: "navy_blauwrecords", titleIncludes: ["scotch & soda patterned polo"] },
  // Only one navy bottoms item on Wall today (corduroy). Do not steal it for navy_dress_pants.
  { fileIncludes: "navy_corduroy", titleIncludes: ["navy corduroy"] },
]

function matchFileToItem(filePath, items, usedIds) {
  const base = path.basename(filePath)
  const stem = base.replace(/\.[^.]+$/, "")
  const key = stem.toLowerCase()

  for (const rule of EXPLICIT) {
    if (!key.includes(rule.fileIncludes)) continue
    const candidates = items.filter((it) => {
      if (usedIds.has(it.id)) return false
      const t = norm(it.title)
      return rule.titleIncludes.some((frag) => t.includes(norm(frag)))
    })
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) {
      candidates.sort((a, b) => scoreTitle(stem, b.title) - scoreTitle(stem, a.title))
      return candidates[0]
    }
  }

  let best = null
  let bestScore = 0
  for (const it of items) {
    if (usedIds.has(it.id)) continue
    const s = scoreTitle(stem, it.title)
    if (s > bestScore) {
      bestScore = s
      best = it
    }
  }
  if (bestScore >= 8) return best
  return null
}

async function readAsJpeg(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const buf = fs.readFileSync(filePath)
  if (ext === ".heic" || ext === ".heif") {
    const out = await convert({ buffer: buf, format: "JPEG", quality: 0.9 })
    return { buffer: Buffer.from(out), mime: "image/jpeg", name: path.basename(filePath).replace(/\.heic$/i, ".jpg") }
  }
  if (ext === ".png") return { buffer: buf, mime: "image/png", name: path.basename(filePath) }
  return { buffer: buf, mime: "image/jpeg", name: path.basename(filePath) }
}

async function main() {
  const dryRun = argFlag("--dry-run")
  const only = argString("--only", "tshirts,pants")
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )

  const folders = []
  if (only.includes("tshirts")) {
    folders.push({
      dir: "c:\\Users\\PC 3\\Downloads\\main_tshirts_images",
      label: "tshirts",
    })
  }
  if (only.includes("pants")) {
    folders.push({
      dir: "c:\\Users\\PC 3\\Downloads\\main_pants_images",
      label: "pants",
    })
  }
  if (only.includes("heic")) {
    folders.push({
      dir: "c:\\Users\\PC 3\\Downloads\\Reloved Images-20260930T114841Z-1-001\\Reloved Images",
      label: "heic",
    })
  }

  const loginRes = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  })
  const loginBody = await loginRes.json()
  if (!loginRes.ok || !loginBody.token) throw new Error("login failed")
  const token = loginBody.token

  const items = (
    await (
      await fetch(`${apiBase}/api/admin/items`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json()
  ).items.filter((i) => i.publicVisibility === true)

  const used = new Set()
  const jobs = []

  for (const folder of folders) {
    if (!fs.existsSync(folder.dir)) {
      console.warn("missing folder", folder.dir)
      continue
    }
    const files = fs
      .readdirSync(folder.dir)
      .filter((f) => /\.(jpe?g|png|heic|heif)$/i.test(f))
      .map((f) => path.join(folder.dir, f))
      .sort()

    for (const file of files) {
      const item = matchFileToItem(file, items, used)
      if (!item) {
        console.log(`? no match · ${path.basename(file)}`)
        continue
      }
      used.add(item.id)
      jobs.push({ file, item, folder: folder.label })
      console.log(`✓ ${path.basename(file)} → ${item.id} · ${item.title}`)
    }
  }

  console.log(JSON.stringify({ dryRun, matched: jobs.length, unmatchedNote: "see ? lines" }, null, 2))
  if (dryRun) return

  let ok = 0
  let fail = 0
  for (const job of jobs) {
    console.log(`\n→ attach ${path.basename(job.file)} → ${job.item.title}`)
    const started = Date.now()
    try {
      const photo = await readAsJpeg(job.file)
      const form = new FormData()
      form.append("photo", new Blob([photo.buffer], { type: photo.mime }), photo.name)
      const res = await fetch(`${apiBase}/api/admin/items/${job.item.id}/attach-original`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      const secs = Math.round((Date.now() - started) / 1000)
      if (!res.ok) {
        fail++
        console.error(`  FAIL ${res.status} ${secs}s`, JSON.stringify(body).slice(0, 240))
        continue
      }
      ok++
      const types = (body.images || []).map((img) => `${img.imageType}:${img.bgRemoved}`).join(", ")
      console.log(`  ok ${secs}s images=${body.imageCount} [${types}]`)
    } catch (err) {
      fail++
      console.error("  ERROR", err?.message || err)
    }
  }

  console.log("\n==== SUMMARY ====")
  console.log({ ok, fail, matched: jobs.length })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
