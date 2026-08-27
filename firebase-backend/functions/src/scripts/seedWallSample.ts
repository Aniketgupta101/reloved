/**
 * Seeds a few sample wall items into Firestore for local/emulator testing.
 * Does not touch the Express/Postgres backend.
 *
 * Usage (from firebase-backend/functions):
 *   set GOOGLE_CLOUD_PROJECT=reloved-digital
 *   npm run seed:wall
 *
 * Or against the emulator:
 *   set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 *   npm run seed:wall
 */
import { FieldValue } from "firebase-admin/firestore"
import { collections, db } from "../lib/firestore"
import type { ItemDoc } from "../types"

const samples: Omit<ItemDoc, "createdAt" | "updatedAt">[] = [
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
]

async function main() {
  for (const sample of samples) {
    const existing = await db
      .collection(collections.items)
      .where("slug", "==", sample.slug)
      .limit(1)
      .get()

    if (!existing.empty) {
      console.log(`skip existing ${sample.slug}`)
      continue
    }

    await db.collection(collections.items).add({
      ...sample,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    console.log(`seeded ${sample.slug}`)
  }
  console.log("done")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
