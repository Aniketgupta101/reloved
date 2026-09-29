const fs = require("fs")
const path = require("path")
const envPath = path.join(__dirname, "../.env.reloved-digital")
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue
  const i = line.indexOf("=")
  if (i < 0) continue
  let v = line.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  process.env[line.slice(0, i).trim()] = v
}

async function main() {
  const key = process.env.MSG91_AUTH_KEY
  const tid = "6ab92b19c18ed5f2080e4d02"

  const ver = await fetch("https://control.msg91.com/api/v5/sms/getTemplateVersions", {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: tid }),
  })
  console.log("versions", ver.status, await ver.text())

  // Try get all templates endpoints used elsewhere in repo
  for (const [label, url, body] of [
    ["addTemplate probe via versions empty means missing", null, null],
  ]) {
    console.log(label)
  }

  // Force-send with flag to see MSG91 real error email path — instead query reports
  const force = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({
      template_id: tid,
      short_url: "0",
      recipients: [{ mobiles: "917304382922", name: "Umesh", item: "Animal Print Bodycon Dress" }],
    }),
  })
  console.log("force flow", force.status, await force.text())

  // Check delivered template for comparison (known live)
  const live = "6ab39ea41235cf02ba092fd5"
  const liveVer = await fetch("https://control.msg91.com/api/v5/sms/getTemplateVersions", {
    method: "POST",
    headers: { authkey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: live }),
  })
  console.log("live delivered versions", liveVer.status, await liveVer.text())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
