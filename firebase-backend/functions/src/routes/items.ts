import { Router } from "express"
import type { QueryDocumentSnapshot } from "firebase-admin/firestore"
import { GIVER_SENDS_MATCH_RADIUS_KM, haversineKm, parseCoord } from "../lib/geo"
import { collections, db } from "../lib/firestore"
import {
  itemHiddenForViewer,
  loadDeclinedItemIdsForViewer,
  resolveViewerHideKeys,
} from "../lib/wallHide"
import { attachSessionIfPresent } from "../middleware/session"
import { sessionIsGiver } from "./matchFlow"
import { toPublicItem, type ItemDoc } from "../types"

export const itemsRouter = Router()

itemsRouter.use(attachSessionIfPresent)

itemsRouter.get("/", async (req, res) => {
  try {
    const status = String(req.query.status || "available")
    const viewerLat = parseCoord(req.query.lat ?? req.query.latitude)
    const viewerLng = parseCoord(req.query.lng ?? req.query.longitude)

    const base = db.collection(collections.items).where("publicVisibility", "==", true)

    // Wall shows Available + Being matched + Claimed (Matched). Reloved stays on Wall of Love.
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

    // Logged-in claimer: hide items a giver previously declined them for.
    if (req.session?.role === "donor" && req.session.uid) {
      const viewerKeys = await resolveViewerHideKeys(db, req.session.uid)
      const declinedItemIds = await loadDeclinedItemIdsForViewer(db, req.session.uid, viewerKeys)
      docs = docs.filter((doc) => {
        if (declinedItemIds.has(doc.id)) return false
        return !itemHiddenForViewer(doc.data() as { wallHiddenForTargets?: unknown }, viewerKeys)
      })
    }

    let items = docs.map((doc) => {
      const data = doc.data() as ItemDoc & {
        latitude?: number | null
        longitude?: number | null
        giverLogistics?: string | null
      }
      const pub = toPublicItem(doc.id, data)
      const logistics = String(data.giverLogistics || "")
      if (logistics !== "giver_sends" || viewerLat == null || viewerLng == null) {
        return { ...pub, distanceKm: null as number | null, withinMatchRadius: null as boolean | null }
      }
      const itemLat = parseCoord(data.latitude)
      const itemLng = parseCoord(data.longitude)
      if (itemLat == null || itemLng == null) {
        return {
          ...pub,
          distanceKm: null as number | null,
          withinMatchRadius: false,
          matchHint: "Giver location missing — claim will explain fallback options.",
        }
      }
      const km = haversineKm(viewerLat, viewerLng, itemLat, itemLng)
      const within = km <= GIVER_SENDS_MATCH_RADIUS_KM
      return {
        ...pub,
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

    // Hard 3 km filter for giver-sends when the client asks (?near=1) and viewer is located.
    // Pickup / Borzo items stay visible — only donor-send outside the radius is removed.
    const nearFilter =
      String(req.query.near || req.query.radiusFilter || "").trim() === "1" ||
      String(req.query.near || "").toLowerCase() === "true"
    let radiusFiltered = false
    if (nearFilter && viewerLat != null && viewerLng != null) {
      const before = items.length
      items = items.filter((item) => {
        if (item.giverLogistics !== "giver_sends") return true
        return item.withinMatchRadius === true
      })
      radiusFiltered = items.length !== before
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

    // Count giver_sends before hard filter so empty-radius messaging stays accurate.
    const donorSendAll = docs.filter(
      (doc) => String((doc.data() as { giverLogistics?: string | null }).giverLogistics || "") === "giver_sends",
    ).length
    const showEmptyRadius =
      nearFilter &&
      viewerLat != null &&
      viewerLng != null &&
      donorSendAll > 0 &&
      inRadius.length === 0

    res.json({
      items,
      matchMeta: {
        radiusKm: GIVER_SENDS_MATCH_RADIUS_KM,
        viewerLocated: viewerLat != null && viewerLng != null,
        nearFilterApplied: Boolean(nearFilter && viewerLat != null && viewerLng != null),
        radiusFiltered,
        donorSendCount: donorSend.length,
        donorSendInRadius: inRadius.length,
        emptyRadius: showEmptyRadius,
        // Banner copy removed from Wall UI — keep flag for analytics/clients if needed.
        emptyRadiusMessage: null,
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
    const data = doc.data() as ItemDoc & { wallHiddenForTargets?: unknown }

    if (req.session?.role === "donor" && req.session.uid) {
      const viewerKeys = await resolveViewerHideKeys(db, req.session.uid)
      const declinedItemIds = await loadDeclinedItemIdsForViewer(db, req.session.uid, viewerKeys)
      if (declinedItemIds.has(doc.id) || itemHiddenForViewer(data, viewerKeys)) {
        res.status(404).json({ error: "Item not found" })
        return
      }
    }

    const item = toPublicItem(doc.id, data)
    let isOwnListing = false
    if (req.session?.role === "donor" && req.session.uid) {
      isOwnListing = await sessionIsGiver(db, req.session.uid, data)
    }
    res.json({ item: { ...item, isOwnListing } })
  } catch (err) {
    console.error("GET /items/:slug", err)
    res.status(500).json({ error: "Failed to load item" })
  }
})
