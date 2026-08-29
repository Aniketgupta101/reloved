import { Router } from "express"
import { collections, db } from "../lib/firestore"
import { toPublicItem, type ItemDoc } from "../types"

export const itemsRouter = Router()

itemsRouter.get("/", async (req, res) => {
  try {
    const status = String(req.query.status || "available")
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
    let items = snap.docs.map((doc) => toPublicItem(doc.id, doc.data() as ItemDoc))
    // Wall cards need a photo — hide empty placeholders like seed/test items.
    if (status === "wall" || status === "available" || status === "reloved") {
      items = items.filter((item) => (item.images || []).some((img) => Boolean(img.storagePath)))
    }
    res.json({ items })
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
