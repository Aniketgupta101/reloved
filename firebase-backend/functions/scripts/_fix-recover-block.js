const fs = require("fs")
const p = "src/routes/admin.ts"
let s = fs.readFileSync(p, "utf8")
const start = s.indexOf("/**\r\n * Recover missing donor originals for Wall items")
const end = s.indexOf("/**\r\n * Repair: any donationSubmission marked withdrawn")
if (start < 0 || end < 0) {
  console.error("markers", start, end)
  process.exit(1)
}
const replacement = fs.readFileSync("scripts/_recover-replacement.ts.txt", "utf8").replace(/\n/g, "\r\n")
fs.writeFileSync(p, s.slice(0, start) + replacement + s.slice(end))
console.log("ok", { start, end })

