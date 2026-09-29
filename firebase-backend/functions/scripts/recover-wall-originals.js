/**
 * Recover donor originals for Wall items that only have AI/modelled images.
 * Sources (in order):
 *   1) item.donorOriginalPaths
 *   2) donationSubmissions.{donorOriginalPaths,photoStoragePaths+flags}
 *   3) Storage siblings: if modelled is donations/X, look for nearby original uploads
 *      referenced nowhere else but listed in submission photos arrays
 *
 * Then force-polish so gallery = 1 AI + BG-removed originals.
 *
 * Usage:
 *   node scripts/recover-wall-originals.js [--limit=50] [--dry-run] [--polish]
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

function argFlag(name) {
  return process.argv.includes(name)
}
function argValue(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

function uniq(arr) {
  return [...new Set(arr.map((s) => String(s || "").trim()).filter(Boolean))]
}

function pathsFromSubmission(sub) {
  if (!sub) return []
  if (Array.isArray(sub.donorOriginalPaths) && sub.donorOriginalPaths.length) {
    return uniq(sub.donorOriginalPaths)
  }
  const pathList = Array.isArray(sub.photoStoragePaths)
    ? sub.photoStoragePaths.map((p) => String(p || "").trim()).filter(Boolean)
    : []
  const flagList = Array.isArray(sub.photoBgRemoved)
    ? sub.photoBgRemoved.map((f) => Boolean(f))
    : []
  if (!pathList.length) {
    // Legacy fields
    for (const key of ["photos", "imagePaths", "originalPhotoPaths"]) {
      const raw = sub[key]
      if (Array.isArray(raw)) {
        return uniq(raw.map((p) => String(p || "").trim()))
      }
    }
    return []
  }
  if (!flagList.length) {
    // No flags: treat all as candidates except obvious AI-only if we can't tell
    return uniq(pathList)
  }
  const out = []
  for (let i = 0; i < pathList.length; i++) {
    if (flagList[i] === true) continue
    out.push(pathList[i])
  }
  return uniq(out)
}

async function main() {
  const admin = require("firebase-admin")
  const projectId =
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID ||
    "reloved-digital"
  process.env.GCLOUD_PROJECT = projectId
  process.env.GOOGLE_CLOUD_PROJECT = projectId
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
      storageBucket:
        process.env.STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET ||
        "reloved-digital-uploads",
    })
  }
  const db = admin.firestore()
  const dryRun = argFlag("--dry-run")
  const doPolish = argFlag("--polish")
  const limit = argValue("--limit", 500)
  const apiBase = (process.env.PUBLIC_API_URL || "https://api-wsyflslyaq-el.a.run.app").replace(
    /\/$/,
    "",
  )

  const snap = await db.collection("items").get()
  const wall = []
  for (const doc of snap.docs) {
    const d = doc.data() || {}
    if (d.publicVisibility !== true) continue
    const st = String(d.publicStatus || "")
    if (!["available", "being_matched", "claimed"].includes(st)) continue
    wall.push({ id: doc.id, ...d })
  }

  const missing = []
  const hasOrig = []
  for (const item of wall) {
    const imgs = Array.isArray(item.images) ? item.images : []
    const typed = imgs.some((img) => img && img.imageType === "original" && img.storagePath)
    const donor =
      Array.isArray(item.donorOriginalPaths) && item.donorOriginalPaths.some((p) => String(p || "").trim())
    if (typed || donor) hasOrig.push(item.id)
    else missing.push(item)
  }

  console.log(
    JSON.stringify(
      {
        wall: wall.length,
        hasOriginalRef: hasOrig.length,
        missingOriginalRef: missing.length,
        dryRun,
        doPolish,
        limit,
      },
      null,
      2,
    ),
  )

  const targets = missing.slice(0, limit)
  const recovered = []
  const unrecovered = []

  for (const item of targets) {
    let paths = []
    if (Array.isArray(item.donorOriginalPaths)) {
      paths = uniq(item.donorOriginalPaths)
    }
    const submissionId = String(item.submissionId || "").trim()
    if (!paths.length && submissionId) {
      try {
        const subSnap = await db.collection("donationSubmissions").doc(submissionId).get()
        if (subSnap.exists) paths = pathsFromSubmission(subSnap.data() || {})
      } catch (err) {
        console.warn("submission read failed", item.id, err?.message || err)
      }
    }

    // Drop AI-only paths already on the item so we don't treat modelled as original.
    const modelled = new Set(
      (item.images || [])
        .filter((img) => img && (img.imageType === "modelled" || img.bgRemoved === true))
        .map((img) => String(img.storagePath || "")),
    )
    paths = paths.filter((p) => p && !modelled.has(p))

    if (!paths.length) {
      unrecovered.push({ id: item.id, title: item.title || item.id })
      console.log(`✗ ${item.id} · ${(item.title || "").slice(0, 50)} — no original path found`)
      continue
    }

    recovered.push({ id: item.id, title: item.title || item.id, paths })
    console.log(
      `✓ ${item.id} · ${(item.title || "").slice(0, 50)} — ${paths.length} original(s)`,
    )

    if (dryRun) continue

    const keepAi = (item.images || []).filter(
      (img) => img && img.storagePath && img.imageType === "modelled",
    )
    const images = [
      ...keepAi.slice(0, 1).map((img, i) => ({
        storagePath: img.storagePath,
        imageType: "modelled",
        sortOrder: i,
        bgRemoved: true,
      })),
      ...paths.map((p, i) => ({
        storagePath: p,
        imageType: "original",
        sortOrder: keepAi.slice(0, 1).length + i,
        bgRemoved: false,
      })),
    ]

    await db
      .collection("items")
      .doc(item.id)
      .update({
        images,
        donorOriginalPaths: paths,
        missingOriginalImage: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

    if (doPolish) {
      // Prefer admin session polish endpoint
      try {
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
        const polishRes = await fetch(`${apiBase}/api/donations/polish-item-images`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${loginBody.token}`,
          },
          body: JSON.stringify({ itemId: item.id, force: true }),
        })
        const body = await polishRes.json().catch(() => ({}))
        console.log(
          `  polish ${polishRes.status} images=${body.imageCount} missing=${body.missingOriginal}`,
        )
      } catch (err) {
        console.warn("  polish failed", err?.message || err)
      }
    }
  }

  console.log("\n==== SUMMARY ====")
  console.log({
    recovered: recovered.length,
    unrecovered: unrecovered.length,
  })
  if (unrecovered.length) {
    console.log("\nStill missing originals (files not in Firestore):")
    for (const row of unrecovered) {
      console.log(`- ${row.id} · ${row.title}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
