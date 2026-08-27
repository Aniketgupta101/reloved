import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "../lib/firestore"

export const seedRouter = Router()

const SAMPLES = [
  {
    slug: "dont-tell-my-mom-graphic-tee",
    title: "Don't Tell My Mom Graphic Tee",
    category: "Clothing",
    description: "Casual black kids tee with colorful graphic.",
    quantity: 1,
    brand: null,
    size: "Boys 6/7 yrs",
    condition: "Good",
    gender: "kids",
    locality: "Mumbai",
    donorRecognition: "Anonymous",
    status: "approved",
    publicStatus: "being_matched",
    publicVisibility: true,
    images: [
      {
        storagePath:
          "https://reloved.digital/images/wall-items/dont-tell-my-mom-graphic-tee.png?v=named1",
        imageType: "product",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "zanella-white-linen-embroidered-tunic-top",
    title: "Zanella White Linen Embroidered Tunic Top",
    category: "Clothing",
    description: "Lightweight white linen tunic with geometric embroidery.",
    quantity: 1,
    brand: "Zanella",
    size: "Free size",
    condition: "Good",
    gender: "men",
    locality: "Mumbai",
    donorRecognition: "Anonymous",
    status: "approved",
    publicStatus: "available",
    publicVisibility: true,
    images: [
      {
        storagePath:
          "https://reloved.digital/images/wall-items/zanella-white-linen-embroidered-tunic.png?v=named1",
        imageType: "product",
        sortOrder: 0,
      },
    ],
  },
  {
    slug: "black-cargo-jogger-pants",
    title: "Black Cargo Jogger Pants",
    category: "Clothing",
    description: "Comfortable black jogger-style cargo pants.",
    quantity: 1,
    brand: null,
    size: "S",
    condition: "Good",
    gender: "men",
    locality: "Mumbai",
    donorRecognition: "Anonymous",
    status: "approved",
    publicStatus: "available",
    publicVisibility: true,
    images: [
      {
        storagePath:
          "https://reloved.digital/images/wall-items/black-cargo-jogger-pants.png?v=named1",
        imageType: "product",
        sortOrder: 0,
      },
    ],
  },
]

/** One-time bootstrap — gated by SEED_SECRET header. Remove after initial seed. */
seedRouter.post("/wall", async (req, res) => {
  const secret = process.env.SEED_SECRET || "reloved-dev-seed"
  if (req.get("x-seed-secret") !== secret) {
    res.status(403).json({ error: "Forbidden" })
    return
  }

  try {
    const db = getDb()
    const created: string[] = []
    for (const sample of SAMPLES) {
      const existing = await db
        .collection(collections.items)
        .where("slug", "==", sample.slug)
        .limit(1)
        .get()
      if (!existing.empty) continue
      await db.collection(collections.items).add({
        ...sample,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
      created.push(sample.slug)
    }
    res.json({ ok: true, created })
  } catch (err) {
    console.error("seed wall", err)
    res.status(500).json({ error: "Seed failed" })
  }
})
