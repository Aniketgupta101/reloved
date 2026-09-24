/**
 * Split Waseem's multi-item Give cards (WSM-SHIRTS-*, WSM-PANTS-*) into
 * one donationSubmission per wall item so Admin / Track treat them as
 * individual Gives — not one bulk bag.
 *
 * Dry-run (default):
 *   node scripts/split-waseem-bulk-submissions.js
 *
 * Apply:
 *   node scripts/split-waseem-bulk-submissions.js --apply
 */
const fs = require("fs")
const path = require("path")
const https = require("https")
const crypto = require("crypto")

const APPLY = process.argv.includes("--apply")
const PROJECT = "reloved-digital"
const TARGET_REFS = ["WSM-PANTS-K6V103", "WSM-SHIRTS-34KOTR"]

const cfg = JSON.parse(
  fs.readFileSync(path.join(process.env.USERPROFILE, ".config/configstore/firebase-tools.json"), "utf8")
)
const access = cfg.tokens.access_token

function request(method, fullPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const req = https.request(
      {
        hostname: "firestore.googleapis.com",
        path: fullPath,
        method,
        headers: {
          Authorization: "Bearer " + access,
          ...(data
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
            : {}),
        },
      },
      (res) => {
        let b = ""
        res.on("data", (d) => (b += d))
        res.on("end", () => {
          let parsed = null
          try {
            parsed = b ? JSON.parse(b) : null
          } catch {
            parsed = b
          }
          resolve({ status: res.statusCode, body: parsed })
        })
      }
    )
    req.on("error", reject)
    if (data) req.write(data)
    req.end()
  })
}

function sv(f) {
  return f && f.stringValue != null ? f.stringValue : null
}

function shortToken() {
  return crypto.randomBytes(3).toString("hex").toUpperCase()
}

function slugRef(prefix, title) {
  const slug = String(title || "ITEM")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24)
  return `${prefix}-${slug || "ITEM"}-${shortToken()}`
}

async function listAll(collection) {
  const docs = []
  let page = ""
  do {
    const url =
      `/v1/projects/${PROJECT}/databases/(default)/documents/${collection}?pageSize=300` +
      (page ? `&pageToken=${encodeURIComponent(page)}` : "")
    const list = await request("GET", url)
    if (list.status !== 200) throw new Error(JSON.stringify(list.body).slice(0, 400))
    docs.push(...(list.body.documents || []))
    page = list.body.nextPageToken || ""
  } while (page)
  return docs
}

function cloneFields(fields) {
  // Deep-ish clone of Firestore REST field map (JSON-safe).
  return JSON.parse(JSON.stringify(fields || {}))
}

;(async () => {
  const [subs, items] = await Promise.all([listAll("donationSubmissions"), listAll("items")])

  const targets = subs.filter((doc) => {
    const ref = sv((doc.fields || {}).reference)
    return TARGET_REFS.includes(ref) || (ref && /^WSM-(PANTS|SHIRTS)-/i.test(ref))
  })

  const plan = []

  for (const sub of targets) {
    const sid = sub.name.split("/").pop()
    const fields = sub.fields || {}
    const reference = sv(fields.reference)
    const linked = items.filter((it) => sv((it.fields || {}).submissionId) === sid)
    if (linked.length <= 1) {
      plan.push({ reference, sid, action: "skip", reason: `only ${linked.length} item(s)`, items: linked.map((i) => sv(i.fields.title)) })
      continue
    }

    const prefix = /pants/i.test(reference || "") ? "WSM-PANT" : /shirt/i.test(reference || "") ? "WSM-SHIRT" : "WSM-ITEM"

    // Keep the first item on the original submission (rename reference to that piece).
    // Move the rest onto fresh one-item submissions.
    const [keep, ...move] = linked
    const keepTitle = sv(keep.fields.title)
    const keepRef = slugRef(prefix, keepTitle)

    plan.push({
      reference,
      sid,
      action: APPLY ? "split" : "would_split",
      keep: { itemId: keep.name.split("/").pop(), title: keepTitle, newReference: keepRef },
      move: move.map((it) => ({
        itemId: it.name.split("/").pop(),
        title: sv(it.fields.title),
        newReference: slugRef(prefix, sv(it.fields.title)),
      })),
    })

    if (!APPLY) continue

    // Rename original submission to the kept item's reference.
    await request(
      "PATCH",
      "/v1/" +
        sub.name +
        "?updateMask.fieldPaths=reference&updateMask.fieldPaths=updatedAt",
      {
        fields: {
          reference: { stringValue: keepRef },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }
    )

    for (const it of move) {
      const title = sv(it.fields.title)
      const newRef = slugRef(prefix, title)
      const newFields = cloneFields(fields)
      newFields.reference = { stringValue: newRef }
      newFields.updatedAt = { timestampValue: new Date().toISOString() }
      newFields.createdAt = { timestampValue: new Date().toISOString() }
      newFields.submittedAt = fields.submittedAt || { timestampValue: new Date().toISOString() }
      // Mark provenance for ops.
      newFields.splitFromReference = { stringValue: reference }
      newFields.splitFromSubmissionId = { stringValue: sid }

      const created = await request(
        "POST",
        `/v1/projects/${PROJECT}/databases/(default)/documents/donationSubmissions`,
        { fields: newFields }
      )
      if (created.status !== 200) {
        throw new Error(`create submission failed for ${title}: ${JSON.stringify(created.body).slice(0, 400)}`)
      }
      const newSid = created.body.name.split("/").pop()

      const patchItem = await request(
        "PATCH",
        "/v1/" +
          it.name +
          "?updateMask.fieldPaths=submissionId&updateMask.fieldPaths=updatedAt",
        {
          fields: {
            submissionId: { stringValue: newSid },
            updatedAt: { timestampValue: new Date().toISOString() },
          },
        }
      )
      if (patchItem.status !== 200) {
        throw new Error(`repoint item failed for ${title}: ${JSON.stringify(patchItem.body).slice(0, 400)}`)
      }
    }
  }

  console.log(JSON.stringify({ apply: APPLY, plan }, null, 2))
  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to split.")
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
