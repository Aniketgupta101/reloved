import { chromium } from "playwright"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const htmlDir = path.resolve(__dirname, "../../Docs/sheetal-email-ss/html")
const shotDir = path.resolve(__dirname, "../../Docs/sheetal-email-ss/screenshots")
fs.mkdirSync(shotDir, { recursive: true })

const files = fs.readdirSync(htmlDir).filter((f) => f.endsWith(".html")).sort()

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 780, height: 1100 }, deviceScaleFactor: 2 })

const shotPaths = []
for (const file of files) {
  const abs = path.join(htmlDir, file)
  await page.goto("file:///" + abs.replace(/\\/g, "/"), { waitUntil: "networkidle" })
  await page.waitForTimeout(300)
  const out = path.join(shotDir, file.replace(/\.html$/, ".png"))
  await page.screenshot({ path: out, fullPage: true })
  shotPaths.push(out)
  console.log("SHOT", out)
}

// Overview collage page
const cards = files
  .map((f, i) => {
    const html = fs.readFileSync(path.join(htmlDir, f), "utf8")
    const subj = (html.match(/class="subj">([^<]+)</) || [, f])[1]
    const png = f.replace(/\.html$/, ".png")
    return `<div class="card"><div class="num">${i + 1}/14</div><div class="s">${subj}</div><img src="${png}"/></div>`
  })
  .join("\n")

const overviewHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{margin:0;padding:24px;background:#111;color:#fff;font-family:Arial,sans-serif}
h1{font-size:22px;margin:0 0 6px}
p{margin:0 0 20px;color:#aaa;font-size:13px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.card{background:#1c1c1c;border:1px solid #333;border-radius:10px;overflow:hidden}
.num{padding:8px 10px 0;font-size:11px;color:#EC2F9B;font-weight:700}
.s{padding:4px 10px 8px;font-size:12px;line-height:1.3}
img{width:100%;display:block;background:#fff}
</style></head><body>
<h1>Emails received by sheetalahuja99@gmail.com</h1>
<p>RE-LOVED user-flow test · 24 Sep 2026 · 14 templates (giver + claimer)</p>
<div class="grid">${cards}</div>
</body></html>`

const overviewPath = path.join(shotDir, "00-overview.html")
fs.writeFileSync(overviewPath, overviewHtml)
await page.setViewportSize({ width: 1400, height: 900 })
await page.goto("file:///" + overviewPath.replace(/\\/g, "/"), { waitUntil: "networkidle" })
await page.waitForTimeout(500)
const overviewPng = path.join(shotDir, "00-overview-all-mails.png")
await page.screenshot({ path: overviewPng, fullPage: true })
console.log("OVERVIEW", overviewPng)

await browser.close()
console.log("DONE", shotPaths.length)
