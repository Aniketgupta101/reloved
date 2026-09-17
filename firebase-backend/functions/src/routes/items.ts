import { Router } from "express"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { GIVER_SENDS_MATCH_RADIUS_KM, haversineKm, parseCoord } from "../lib/geo"
import { collections, db } from "../lib/firestore"
import { toPublicItem, type ItemDoc } from "../types"

export const itemsRouter = Router()

itemsRouter.get("/", async (req, res) => {
  try {
    const status = String(req.query.status || "available")
    const viewerLat = parseCoord(req.query.lat ?? req.query.latitude)
    const viewerLng = parseCoord(req.query.lng ?? req.query.longitude)

    const base = db.collection(collections.items).where("publicVisibility", "==", true)

    // Wall shows Available + Being Matched / Matched for social proof.
    // Reloved stays on Wall of Love.
    let docs: QueryDocumentSnapshot[] = []
    if (status === "wall") {
      const [availableSnap, beingMatchedSnap, claimedSnap] = await Promise.all([
        base.where("publicStatus", "==", "available").orderBy("createdAt", "desc").limit(100).get(),
        base.where("publicStatus", "==", "being_matched").orderBy("createdAt", "desc").limit(50).get(),
        base.where("publicStatus", "==", "claimed").orderBy("createdAt", "desc").limit(50).get(),
      ])
      const seen = new Set<string>()
      for (const snap of [availableSnap, beingMatchedSnap, claimedSnap]) {
        for (const doc of snap.docs) {
          if (seen.has(doc.id)) continue
          seen.add(doc.id)
          docs.push(doc)
        }
      }
    } else if (status === "reloved") {
      const snap = await base.where("publicStatus", "==", "reloved").orderBy("createdAt", "desc").limit(100).get()
      docs = snap.docs
    } else {
      const snap = await base.where("publicStatus", "==", status).orderBy("createdAt", "desc").limit(100).get()
      docs = snap.docs
    }

    let items = docs.map((doc) => {
      const data = doc.data() as ItemDoc & {
        latitude?: number | null
        longitude?: number | null
        giverLogistics?: string | null
      }
      const base = toPublicItem(doc.id, data)
      const logistics = String(data.giverLogistics || "")
      if (logistics !== "giver_sends" || viewerLat == null || viewerLng == null) {
        return { ...base, distanceKm: null as number | null, withinMatchRadius: null as boolean | null }
      }
      const itemLat = parseCoord(data.latitude)
      const itemLng = parseCoord(data.longitude)
      if (itemLat == null || itemLng == null) {
        return {
          ...base,
          distanceKm: null as number | null,
          withinMatchRadius: false,
          matchHint: "Giver location missing — claim will explain fallback options.",
        }
      }
      const km = haversineKm(viewerLat, viewerLng, itemLat, itemLng)
      const within = km <= GIVER_SENDS_MATCH_RADIUS_KM
      return {
        ...base,
        distanceKm: Math.round(km * 10) / 10,
        withinMatchRadius: within,
        matchHint: within
          ? `Within ${GIVER_SENDS_MATCH_RADIUS_KM} km (donor-send)`
          : `Outside ${GIVER_SENDS_MATCH_RADIUS_KM} km — claim blocked with explicit fallback`,
      }
    })
    // Wall cards need a photo — hide empty placeholders like seed/test items.
    if (status === "wall" || status === "available" || status === "reloved") {
      items = items.filter((item) => (item.images || []).some((img) => Boolean(img.storagePath)))
    }

    // Donor-send path: prioritize in-radius matches; never expose exact coords.
    if (viewerLat != null && viewerLng != null) {
      items.sort((a, b) => {
        const aIn = a.withinMatchRadius === true ? 0 : a.giverLogistics === "giver_sends" ? 2 : 1
        const bIn = b.withinMatchRadius === true ? 0 : b.giverLogistics === "giver_sends" ? 2 : 1
        if (aIn !== bIn) return aIn - bIn
        const aKm = a.distanceKm ?? 999
        const bKm = b.distanceKm ?? 999
        return aKm - bKm
      })
    }

    const donorSend = items.filter((i) => i.giverLogistics === "giver_sends")
    const inRadius = donorSend.filter((i) => i.withinMatchRadius === true)
    const emptyRadius =
      viewerLat != null &&
      viewerLng != null &&
      donorSend.length > 0 &&
      inRadius.length === 0

    res.json({
      items,
      matchMeta: {
        radiusKm: GIVER_SENDS_MATCH_RADIUS_KM,
        viewerLocated: viewerLat != null && viewerLng != null,
        donorSendCount: donorSend.length,
        donorSendInRadius: inRadius.length,
        emptyRadius,
        emptyRadiusMessage: emptyRadius
          ? `Nothing within ${GIVER_SENDS_MATCH_RADIUS_KM} km for donor-send right now. You can still claim items marked for pickup or prepaid Borzo courier, or browse the wider Wall.`
          : null,
      },
    })
  } catch (err) {
    console.error("GET /items", err)
    res.status(500).json({ error: "Failed to load items" })
  }
})

itemsRouter.get("/:slug", async (req, res) => {
  try {
    const slug = req.params.slug
    const snap = await db
      .collection(collections.items)
      .where("publicVisibility", "==", true)
      .where("slug", "==", slug)
      .limit(1)
      .get()

    if (snap.empty) {
      res.status(404).json({ error: "Item not found" })
      return
    }

    const doc = snap.docs[0]
    res.json({ item: toPublicItem(doc.id, doc.data() as ItemDoc) })
  } catch (err) {
    console.error("GET /items/:slug", err)
    res.status(500).json({ error: "Failed to load item" })
  }
})
