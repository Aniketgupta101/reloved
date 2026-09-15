import { Router } from "express"
import { GIVER_SENDS_MATCH_RADIUS_KM, haversineKm, parseCoord } from "../lib/geo"
import { collections, db } from "../lib/firestore"
import { toPublicItem, type ItemDoc } from "../types"

export const itemsRouter = Router()

itemsRouter.get("/", async (req, res) => {
  try {
    const status = String(req.query.status || "available")
    const viewerLat = parseCoord(req.query.lat ?? req.query.latitude)
    const viewerLng = parseCoord(req.query.lng ?? req.query.longitude)

    let query = db
      .collection(collections.items)
      .where("publicVisibility", "==", true)

    // Wall of Kindness = claimable items only. Matched / claimed / reloved
    // belong on track/history or Wall of Love — not the live catalogue.
    if (status === "wall") {
      query = query.where("publicStatus", "==", "available")
    } else if (status === "reloved") {
      query = query.where("publicStatus", "==", "reloved")
    } else {
      query = query.where("publicStatus", "==", status)
    }

    const snap = await query.orderBy("createdAt", "desc").limit(100).get()
    let items = snap.docs.map((doc) => {
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
          ? `No donor-send items within ${GIVER_SENDS_MATCH_RADIUS_KM} km of your area. Fallback: claim “Receiver collects” or “Porter / Borzo” items, or browse without the 3 km filter — we never silently fail.`
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
