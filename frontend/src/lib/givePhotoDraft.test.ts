import assert from "node:assert/strict"
import test from "node:test"

import {
  acceptDonationResult,
  assignChunkResults,
  canLeaveForLogin,
  idempotencyKeyForGroup,
  mergePhotosById,
  persistentPreviewUrl,
  PHOTO_NOT_STORED_MESSAGE,
  uploadNameForPhoto,
} from "./givePhotoDraft.ts"

test("two items get two idempotency keys and a retry keeps each item's own key", () => {
  const store = new Map<number, string>()
  let n = 0
  const make = () => `key-${++n}`
  const first = idempotencyKeyForGroup(store, 1, make)
  const second = idempotencyKeyForGroup(store, 2, make)
  assert.equal(first, "key-1")
  assert.equal(second, "key-2")
  assert.notEqual(first, second)
  assert.equal(idempotencyKeyForGroup(store, 1, make), "key-1")
  assert.equal(idempotencyKeyForGroup(store, 2, make), "key-2")
  assert.equal(store.size, 2)
})

test("replay of the same key is the same item; another key cannot claim that itemId", () => {
  const owners = new Map<string, string>()
  assert.equal(
    acceptDonationResult(owners, "key-a", { reference: "RL-1", itemId: "item-1" }),
    true,
  )
  assert.equal(
    acceptDonationResult(owners, "key-a", { reference: "RL-1", itemId: "item-1", idempotentReplay: true }),
    true,
  )
  assert.equal(
    acceptDonationResult(owners, "key-b", { reference: "RL-1", itemId: "item-1", idempotentReplay: true }),
    false,
  )
  assert.equal(
    acceptDonationResult(owners, "key-b", { reference: "RL-2", itemId: "item-2" }),
    true,
  )
})

test("three files named image.jpg stay three photos", () => {
  const photos = [
    { photoId: "id-a", fileName: "image.jpg", storagePath: "" },
    { photoId: "id-b", fileName: "image.jpg", storagePath: "" },
    { photoId: "id-c", fileName: "image.jpg", storagePath: "" },
  ]
  const results = assignChunkResults(photos, [
    { ok: true, originalName: uploadNameForPhoto("id-c", "jpg"), storagePath: "path-c" },
    { ok: true, originalName: uploadNameForPhoto("id-a", "jpg"), storagePath: "path-a" },
    { ok: true, originalName: uploadNameForPhoto("id-b", "jpg"), storagePath: "path-b" },
  ])
  assert.deepEqual(
    results.map((result) => ("storagePath" in result ? result.storagePath : "")),
    ["path-a", "path-b", "path-c"],
  )

  const next = photos.map((photo, index) => ({
    ...photo,
    storagePath: "storagePath" in results[index] ? String(results[index].storagePath) : "",
  }))
  const merged = mergePhotosById(photos, next)
  assert.deepEqual(
    merged.map((photo) => photo.storagePath),
    ["path-a", "path-b", "path-c"],
  )
  assert.deepEqual(
    merged.map((photo) => photo.fileName),
    ["image.jpg", "image.jpg", "image.jpg"],
  )
})

test("login restore uses storagePath and rejects a blob preview", () => {
  const url = persistentPreviewUrl("https://storage.example/donations/a.jpg", (path) => path)
  assert.equal(url, "https://storage.example/donations/a.jpg")
  assert.equal(persistentPreviewUrl("blob:http://localhost/abc", (path) => path), null)
  assert.equal(persistentPreviewUrl(undefined, (path) => path), null)
})

test("leaving for login without a stored photo is an error", () => {
  assert.equal(
    canLeaveForLogin([{ storagePath: "https://storage.example/a.jpg" }, {}]),
    PHOTO_NOT_STORED_MESSAGE,
  )
  assert.equal(canLeaveForLogin([{ storagePath: "https://storage.example/a.jpg" }]), null)
})
