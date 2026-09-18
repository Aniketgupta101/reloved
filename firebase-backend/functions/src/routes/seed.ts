import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "../lib/firestore"

export const seedRouter = Router()

const ASSET_BASE = "https://reloved.digital/images/wall-items"

type SeedItem = {
  file: string
  backFile?: string
  title: string
  category: string
  description: string
  size: string
  gender: "men" | "kids" | "unisex"
}

/** Full catalogue from frontend/assets/.aistudio/Assets → public/images/wall-items (32 listings; 3 have front+back). */
const CLOSET_ITEMS: SeedItem[] = [
  { file: "zanella-white-linen-embroidered-tunic.png", title: "Zanella White Linen Embroidered Tunic Top", category: "Tops", description: "Lightweight white linen tunic with geometric embroidery around the V-neck.", size: "Free size", gender: "men" },
  { file: "black-cargo-jogger-pants.png", title: "Black Cargo Jogger Pants", category: "Bottoms", description: "Black jogger-style cargo pants with drawstring waist and cargo pockets.", size: "S", gender: "men" },
  { file: "hm-grey-chino-shorts.png", title: "H&M Grey Button-Fly Chino Shorts", category: "Bottoms", description: "Grey chino shorts with button fly and flat-front design.", size: "32", gender: "men" },
  { file: "distressed-grey-graphic-vneck-tee.png", title: "Distressed Grey Graphic V-Neck Tee", category: "Tops", description: "Dark grey V-neck tee with distressed graphic print.", size: "S", gender: "men" },
  { file: "black-long-sleeve-crewneck-tee.png", title: "Black Long-Sleeve Crewneck Tee", category: "Tops", description: "Plain black long-sleeve crewneck tee.", size: "S", gender: "men" },
  { file: "abercrombie-green-af-ny-92-tee.png", title: "Abercrombie & Fitch Green AF NY 92 Tee", category: "Tops", description: "Green short-sleeve tee with AF NY 92 lettering and elk graphic.", size: "S", gender: "men" },
  { file: "marvel-hulk-comic-battles-tee.png", backFile: "marvel-hulk-comic-battles-tee-back.png", title: "Marvel Hulk Comic Battles Graphic Tee", category: "Tops", description: "Hulk comic-style graphic tee (front + back).", size: "M", gender: "men" },
  { file: "hm-grey-henley-long-sleeve.png", title: "H&M Grey Henley Long Sleeve", category: "Tops", description: "Soft grey long-sleeve henley with three-button placket.", size: "M", gender: "men" },
  { file: "abercrombie-kids-black-moose-tee.png", title: "Abercrombie Kids Black Moose Tee", category: "Tops", description: "Abercrombie kids crew tee with moose logo.", size: "Boys 17/18 yrs", gender: "kids" },
  { file: "hunter-x-hunter-hisoka-tee.png", backFile: "hunter-x-hunter-hisoka-tee-back.png", title: "Hunter x Hunter Hisoka Graphic Tee", category: "Tops", description: "Hisoka graphic tee (front + back).", size: "Boys XXS 11/12 yrs", gender: "kids" },
  { file: "surfs-on-graphic-tee.png", title: "Surf's On Graphic Tee", category: "Tops", description: "White tee with Surf's On graphic.", size: "Boys 10/12 yrs", gender: "kids" },
  { file: "dark-grey-zip-pocket-joggers.png", title: "Dark Grey Zip-Pocket Joggers", category: "Bottoms", description: "Dark grey joggers with zippered pockets.", size: "Boys M 10/12 yrs", gender: "kids" },
  { file: "true-religion-grey-navy-block-tee.png", title: "True Religion Grey & Navy Block Tee", category: "Tops", description: "Grey tee with navy chest stripe and True Religion branding.", size: "Boys 5/6 yrs", gender: "kids" },
  { file: "orca-print-navy-kids-tee.png", title: "Orca Print Navy Kids Tee", category: "Tops", description: "Navy kids tee with orca print.", size: "Boys 8/10 yrs", gender: "kids" },
  { file: "shark-water-kids-tee.png", title: "Shark Water Kids Tee", category: "Tops", description: "White tee with shark print and SHARK WATER text.", size: "Boys 6/8 yrs", gender: "kids" },
  { file: "batman-interactive-sequin-tee.png", backFile: "batman-interactive-sequin-tee-back.png", title: "Batman Interactive Sequin Tee", category: "Tops", description: "Interactive sequin Batman tee (front + back).", size: "Boys 6/8 yrs", gender: "kids" },
  { file: "polo-ralph-lauren-kids-navy-logo-tee.png", title: "Polo Ralph Lauren Kids Navy Logo Tee", category: "Tops", description: "Navy Polo Ralph Lauren kids logo tee.", size: "Boys 6/7 yrs", gender: "kids" },
  { file: "kids-navy-crew-tee.png", title: "Kids Navy Crew Tee", category: "Tops", description: "Kids navy crew tee.", size: "Boys 6/7 yrs", gender: "kids" },
  { file: "kids-soft-cotton-tee.png", title: "Kids Soft Cotton Tee", category: "Tops", description: "Soft cotton kids tee.", size: "Boys 6 yrs", gender: "kids" },
  { file: "kids-black-skeleton-dance-tee.png", title: "Kids Black Skeleton Dance Tee", category: "Tops", description: "Black tee with dancing skeleton print.", size: "Boys 6 yrs", gender: "kids" },
  { file: "converse-camo-chuck-taylor-tee.png", title: "Converse Camo Chuck Taylor Tee", category: "Tops", description: "Camo Converse Chuck Taylor tee.", size: "Boys 8/10 yrs", gender: "kids" },
  { file: "abstract-grunge-print-kids-tee.png", title: "Abstract Grunge Print Kids Tee", category: "Tops", description: "Black and white abstract grunge print kids tee.", size: "Boys 7/8 yrs", gender: "kids" },
  { file: "kids-everyday-crew-tee.png", title: "Kids Everyday Crew Tee", category: "Tops", description: "Everyday kids crew tee.", size: "Boys 9 yrs", gender: "kids" },
  { file: "kids-classic-crew-tee.png", title: "Kids Classic Crew Tee", category: "Tops", description: "Classic kids crew tee.", size: "Boys 8 yrs", gender: "kids" },
  { file: "kids-character-pajama-set.png", title: "Kids Character Pajama Set", category: "Tops", description: "Character print pajama set.", size: "Boys 8/9 yrs", gender: "kids" },
  { file: "spirit-halloween-baby-spider-costume.png", title: "Spirit Halloween Baby Spider Belly Costume", category: "Accessories", description: "Baby/toddler spider costume in packaging.", size: "2–4 yrs", gender: "unisex" },
  { file: "lego-marvel-comics-baseball-cap.png", title: "LEGO Marvel Comics Baseball Cap", category: "Accessories", description: "Black cap with LEGO Marvel Comics print.", size: "Free size", gender: "unisex" },
  { file: "thor-avengers-superhero-costume.png", title: "Thor Avengers Superhero Costume with Cape", category: "Accessories", description: "Thor costume with red cape.", size: "Boys 7–10 yrs", gender: "kids" },
  { file: "teen-titans-robin-costume.png", title: "Teen Titans Go! Robin Costume", category: "Accessories", description: "Robin costume in packaging.", size: "Boys 4/6 yrs", gender: "kids" },
  { file: "zara-lemon-ice-lolly-graphic-tee.png", title: "Zara Lemon Ice Lolly Graphic Tee", category: "Tops", description: "Yellow tee with Lemon Flavour Ice Lolly graphic.", size: "M", gender: "men" },
  { file: "dont-tell-my-mom-graphic-tee.png", title: "Don't Tell My Mom Graphic Tee", category: "Tops", description: "Black kids tee with Don't Tell My Mom graphic.", size: "Boys 6/7 yrs", gender: "kids" },
  { file: "polo-ralph-lauren-bear-crest-tee.png", title: "Polo Ralph Lauren Bear Crest Tee", category: "Tops", description: "Navy Polo Ralph Lauren tee with bear crest.", size: "Boys 12 yrs", gender: "kids" },
]

function closetSlug(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

function imagesFor(item: SeedItem) {
  const images = [
    {
      storagePath: `${ASSET_BASE}/${item.file}?v=named1`,
      imageType: "product",
      sortOrder: 0,
    },
  ]
  if (item.backFile) {
    images.push({
      storagePath: `${ASSET_BASE}/${item.backFile}?v=named1`,
      imageType: "product",
      sortOrder: 1,
    })
  }
  return images
}

/** Upsert full .aistudio/Assets closet onto the Wall. First ~40% Being Matched / Matched for social proof. */
seedRouter.post("/wall", async (req, res) => {
  const secret = process.env.SEED_SECRET || "reloved-dev-seed"
  if (req.get("x-seed-secret") !== secret) {
    res.status(403).json({ error: "Forbidden" })
    return
  }

  try {
    const db = getDb()
    const created: string[] = []
    const updated: string[] = []
    const SEED_OWNER = process.env.SEED_DONOR_TARGET || "admin-seed@reloved.digital"
    const beingMatchedCount = Math.min(12, CLOSET_ITEMS.length)
    const claimedCount = Math.min(8, Math.max(0, CLOSET_ITEMS.length - beingMatchedCount))

    for (let i = 0; i < CLOSET_ITEMS.length; i++) {
      const item = CLOSET_ITEMS[i]
      const slug = closetSlug(item.title)
      const publicStatus =
        i < beingMatchedCount ? ("being_matched" as const) : i < beingMatchedCount + claimedCount ? ("claimed" as const) : ("available" as const)
      const payload = {
        slug,
        title: item.title,
        category: item.category,
        description: item.description,
        quantity: 1,
        brand: null as string | null,
        size: item.size,
        condition: "Good",
        gender: item.gender,
        locality: "Bandra West",
        publicArea: "Bandra West",
        donorRecognition: "Anonymous",
        status: "approved",
        publicStatus,
        publicVisibility: true,
        images: imagesFor(item),
        source: "aistudio-assets",
        donorTarget: SEED_OWNER,
        giverLogistics: "porter_arranged",
        porterPaidBy: "receiver",
        latitude: 19.0596,
        longitude: 72.8295,
        updatedAt: FieldValue.serverTimestamp(),
      }

      const existing = await db
        .collection(collections.items)
        .where("slug", "==", slug)
        .limit(1)
        .get()

      if (existing.empty) {
        await db.collection(collections.items).add({
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
        })
        created.push(slug)
      } else {
        await existing.docs[0].ref.set(payload, { merge: true })
        updated.push(slug)
      }
    }

    res.json({
      ok: true,
      total: CLOSET_ITEMS.length,
      beingMatched: beingMatchedCount,
      claimed: claimedCount,
      available: CLOSET_ITEMS.length - beingMatchedCount - claimedCount,
      seedOwner: SEED_OWNER,
      created,
      updated,
    })
  } catch (err) {
    console.error("seed wall", err)
    res.status(500).json({ error: "Seed failed" })
  }
})

/** Clear UAT/recording claim requests so weekly limit and Wall items reset. */
seedRouter.post("/reset-uat-claims", async (req, res) => {
  const secret = process.env.SEED_SECRET || "reloved-dev-seed"
  if (req.get("x-seed-secret") !== secret) {
    res.status(403).json({ error: "Forbidden" })
    return
  }

  const emailRaw = String(req.body?.email || req.body?.target || "").trim().toLowerCase()
  const phone = String(req.body?.phone || (emailRaw ? "" : "9876501235")).replace(/\D/g, "")
  const email = emailRaw.includes("@") ? emailRaw : ""

  if (!email && !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ error: "Provide a valid phone or email" })
    return
  }

  try {
    const db = getDb()
    const snap = await db.collection(collections.itemRequests).limit(500).get()
    let deleted = 0
    const itemIds = new Set<string>()

    for (const doc of snap.docs) {
      const data = doc.data()
      const target = String(data.requesterTarget || "").trim().toLowerCase()
      const requesterPhone = String(data.requesterPhone || "").replace(/\D/g, "")
      const requesterEmail = String(data.requesterEmail || data.email || "").trim().toLowerCase()
      const matches = email
        ? target === email || requesterEmail === email || target.includes(email)
        : target.includes(phone) || requesterPhone === phone
      if (!matches) continue
      if (data.itemId) itemIds.add(String(data.itemId))
      await doc.ref.delete()
      deleted++
    }

    let itemsReset = 0
    for (const itemId of itemIds) {
      const ref = db.collection(collections.items).doc(itemId)
      const item = await ref.get()
      if (!item.exists) continue
      const status = item.data()?.publicStatus
      if (status === "being_matched" || status === "reloved" || status === "claimed") {
        await ref.set(
          { publicStatus: "available", updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
        itemsReset++
      }
    }

    if (phone) {
      const otpSnap = await db.collection(collections.otpCodes).where("target", "==", phone).limit(50).get()
      for (const doc of otpSnap.docs) {
        await doc.ref.delete()
      }
    }
    if (email) {
      const otpSnap = await db.collection(collections.otpCodes).where("target", "==", email).limit(50).get()
      for (const doc of otpSnap.docs) {
        await doc.ref.delete()
      }
    }

    res.json({ ok: true, phone: phone || null, email: email || null, deleted, itemsReset })
  } catch (err) {
    console.error("reset uat claims", err)
    res.status(500).json({ error: "Reset failed" })
  }
})

const MATCH_FLOW_SLUG = "uat-giver-sends-3km-tee"

/** Live Wall item owned by the UAT giver, with Bandra coords for 3 km matching. */
seedRouter.post("/match-flow", async (req, res) => {
  const secret = process.env.SEED_SECRET || "reloved-dev-seed"
  if (req.get("x-seed-secret") !== secret) {
    res.status(403).json({ error: "Forbidden" })
    return
  }

  const giverPhone = String(req.body?.giverPhone || "9876501236").replace(/\D/g, "")
  const claimerPhone = String(req.body?.claimerPhone || "9876501235").replace(/\D/g, "")

  try {
    const db = getDb()
    const existing = await db.collection(collections.items).where("slug", "==", MATCH_FLOW_SLUG).limit(5).get()
    for (const doc of existing.docs) {
      const claims = await db.collection(collections.itemRequests).where("itemId", "==", doc.id).limit(50).get()
      for (const c of claims.docs) await c.ref.delete()
      const submissionId = String(doc.data()?.submissionId || "")
      await doc.ref.delete()
      if (submissionId) await db.collection(collections.donationSubmissions).doc(submissionId).delete()
    }

    const submissionRef = await db.collection(collections.donationSubmissions).add({
      reference: "REL-UAT-MATCH",
      donorTarget: giverPhone,
      donorFirstName: "UAT",
      donorLastName: "Giver",
      phone: giverPhone,
      email: null,
      locality: "Bandra West, Mumbai",
      giverLogistics: "giver_sends",
      handoverMethod: "giver_sends",
      latitude: 19.0596,
      longitude: 72.8295,
      status: "approved",
      submittedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    })

    const itemRef = await db.collection(collections.items).add({
      submissionId: submissionRef.id,
      slug: MATCH_FLOW_SLUG,
      title: "UAT Bandra Linen Tee (giver sends, 3 km)",
      category: "Tops",
      gender: "unisex",
      condition: "Gently used",
      size: "M",
      quantity: 1,
      brand: "Reloved UAT",
      description: "Seeded item for giver Accept / 3 km send / handover recording.",
      locality: "Bandra West, Mumbai",
      donorRecognition: "UAT Giver",
      giverLogistics: "giver_sends",
      latitude: 19.0596,
      longitude: 72.8295,
      status: "approved",
      publicStatus: "available",
      publicVisibility: true,
      images: [
        {
          storagePath: `${ASSET_BASE}/zanella-white-linen-embroidered-tunic.png?v=named1`,
          imageType: "product",
          sortOrder: 0,
        },
      ],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    res.json({
      ok: true,
      slug: MATCH_FLOW_SLUG,
      itemId: itemRef.id,
      submissionId: submissionRef.id,
      giverPhone,
      claimerPhone,
      giverCoords: { lat: 19.0596, lng: 72.8295 },
    })
  } catch (err) {
    console.error("seed match-flow", err)
    res.status(500).json({ error: "Match-flow seed failed" })
  }
})

