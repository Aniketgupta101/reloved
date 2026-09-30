/**
 * Download Wall AI images for visual match vs local batch files.
 *   node scripts/_tmp-download-ai-for-match.js
 */
const fs = require("fs")
const path = require("path")

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

const PAIRS = [
  ["01_bluegrey_striped_boss_polo.jpg", "PoyV81nJy5aNZ2QiCwGx"],
  ["02_red_boss_polo.jpg", "4Hjl5nnpbR9HC8Li0eK7"],
  ["03_navy_boss_polo_striped_collar.jpg", "KJcfJcMX3TRlH1s7CEre"],
  ["04_olive_scotchsoda_polo.jpg", "t2vfDpQe0Uv9NU8ZQz1T"],
  ["05_sage_giordano_polo.jpg", "gJitUUH27Wt64yEC95eI"],
  ["06_white_giordano_polo.jpg", "TXcaUOk7mjjLofvKbv3N"],
  ["07_navy_blauwrecords_print_polo.jpg", "ccCjlhUVieHKhss9aI9y"],
  ["08_navy_boss_polo_green_tipping.jpg", "kagjDQsHq9vLiD0u9383"],
  ["09_white_boss_polo_contrast_collar.jpg", "Oi9wvFM0rFMKjHgpRBCD"],
  ["10_canali_floral_print_shirt.jpg", "92sdOO2cUPJKTyFOIOdm"],
  ["11_canali_arrow_print_shirt.jpg", "DRKWg0nqG8qzK7ejrWx6"],
  ["12_brooksbrothers_houndstooth_shirt.jpg", "3fcwanlmbeqJBBcYr2l3"],
  ["13_canali_crosshatch_shirt.jpg", "DPcqaQXVhGmfVBzCqlXG"],
  ["14_canali_blackedition_stripe_shirt_TAGONLY.jpg", "lo90olbuGwQrrl1LZOS8"],
  ["15_canali_geometric_stripe_shirt.jpg", "eyu6IDa7BNDBhP8v2Za9"],
  ["16_boss_chambray_polkadot_shirt.jpg", "1WxRhkw7r89jYaOHUPl7"],
  ["17_hugo_wavydot_shirt.jpg", "dLeS4yIgyB80rbN4J548"],
  ["01_black_dress_pants.jpg", "o0AYZDBVu3jmSZsg9pNN"],
  ["02_brooksbrothers_khaki_chino.jpg", "XvTa34rtnGtpg7ZZcdn0"],
  ["03_boss_charcoal_brown_dress_pants.jpg", "NfcSsCGm9oQAAt2gXtEe"],
  ["04_armani_jeans.jpg", "Qe8362YSdagiqOKXzjpM"],
  ["06_navy_corduroy_pants.jpg", "ns4idqkgrEGFpHkCcucD"],
  ["07_scotchsoda_stuart_mustard_chino.jpg", "rxn7nIAxe2nkj6X1QL1z"],
  ["08_brooksbrothers_soho_greyolive_chino.jpg", "wfMGEeSQmGFOs6xAIUkM"],
  ["09_scotchsoda_thedrop_jeans.jpg", "FErJog33azYI7uFs8se1"],
  ["10_scotchsoda_mott_blue_chino.jpg", "DOBjbBZYgFTd9DTfLE9V"],
  ["11_scotchsoda_mott_green_chino.jpg", "uKIP6YrOqqgVCUXw7HQS"],
]

function toPublicUrl(storagePath) {
  const p = String(storagePath || "")
  if (p.startsWith("http")) return p
  const bucket = process.env.FIREBASE_STORAGE_BUCKET || "reloved-digital.firebasestorage.app"
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(p)}?alt=media`
}

async function main() {
  const api = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )
  const login = await (
    await fetch(`${api}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      }),
    })
  ).json()
  const items = (
    await (
      await fetch(`${api}/api/admin/items`, {
        headers: { Authorization: `Bearer ${login.token}` },
      })
    ).json()
  ).items
  const byId = new Map(items.map((i) => [i.id, i]))

  const outDir = path.join(__dirname, "_match-preview")
  fs.mkdirSync(outDir, { recursive: true })
  const manifest = []

  for (const [file, id] of PAIRS) {
    const item = byId.get(id)
    if (!item) continue
    const img = (item.images || [])[0]
    const url = toPublicUrl(img?.storagePath)
    const safe = `${file.replace(/\.[^.]+$/, "")}__AI__${id}.jpg`
    const dest = path.join(outDir, safe)
    try {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
      fs.writeFileSync(dest, buf)
      manifest.push({
        file,
        id,
        title: item.title,
        aiPath: dest,
        localTshirt: path.join("c:\\Users\\PC 3\\Downloads\\main_tshirts_images", file),
        localPants: path.join("c:\\Users\\PC 3\\Downloads\\main_pants_images", file),
      })
      console.log(`saved ${safe} · ${item.title}`)
    } catch (e) {
      console.error("fail", file, e.message)
    }
  }
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2))
  console.log("done", manifest.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
