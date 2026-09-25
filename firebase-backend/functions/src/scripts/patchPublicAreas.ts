/**
 * Recompute items.publicArea / locality (+ linked donationSubmissions)
 * from pickupLocality via toPublicArea.
 *
 * Usage (from functions/):
 *   set GOOGLE_APPLICATION_CREDENTIALS=...
 *   npx tsc -p tsconfig.json
 *   node lib/scripts/patchPublicAreas.js [--dry-run] [--limit=500]
 */
import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "../lib/firestore"
import { ensureFirebaseApp } from "../lib/firebaseApp"
import { toPublicArea } from "../lib/geo"

function argFlag(name: string): boolean {
  return process.argv.includes(name)
}

function argValue(name: string, fallback: number): number {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split("=")[1])
  return Number.isFinite(n) ? n : fallback
}

async function main() {
  const dryRun = argFlag("--dry-run")
  const limit = argValue("--limit", 2000)

  ensureFirebaseApp()
  const db = getDb()
  const snap = await db.collection(collections.items).limit(limit).get()

  let checked = 0
  let changed = 0
  let subsChanged = 0

  for (const doc of snap.docs) {
    checked++
    const data = doc.data()
    const pickup = String(data.pickupLocality || data.locality || "").trim()
    if (!pickup) continue
    const next = toPublicArea(pickup)
    const prev = String(data.publicArea || data.locality || "").trim()
    if (prev === next) continue

    console.log(`${doc.id} · ${String(data.title || "").slice(0, 40)}`)
    console.log(`  ${prev} → ${next}`)

    if (!dryRun) {
      await doc.ref.set(
        {
          locality: next,
          publicArea: next,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      const sid = String(data.submissionId || "").trim()
      if (sid) {
        await db
          .collection(collections.donationSubmissions)
          .doc(sid)
          .set({ publicArea: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        subsChanged++
      }
    }
    changed++
  }

  console.log(JSON.stringify({ checked, changed, subsChanged, dryRun }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
