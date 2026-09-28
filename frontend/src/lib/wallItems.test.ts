import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { appendWallItems, mapApiItemsToWall, wallItemsQuery, WALL_PAGE_SIZE } from "./wallItems.ts"

describe("wallItems", () => {
  it("builds paginated wall query", () => {
    assert.equal(wallItemsQuery(null), `/api/items?status=wall&limit=${WALL_PAGE_SIZE}`)
    assert.equal(
      wallItemsQuery("abc"),
      `/api/items?status=wall&limit=${WALL_PAGE_SIZE}&cursor=abc`,
    )
  })

  it("maps and filters live wall items", () => {
    const mapped = mapApiItemsToWall(
      [
        {
          id: "1",
          slug: "a",
          title: "Tee",
          publicStatus: "available",
          gender: "women",
          images: [{ storagePath: "https://example.com/a.webp" }],
        },
        {
          id: "2",
          slug: "b",
          title: "Bad",
          publicStatus: "available",
          images: [{ storagePath: "https://unsplash.com/x" }],
        },
        {
          id: "3",
          slug: "c",
          title: "Claimed",
          publicStatus: "claimed",
          images: [{ storagePath: "https://example.com/c.webp" }],
        },
      ],
      "women",
    )
    assert.equal(mapped.length, 2)
    assert.equal(mapped[0].id, "1")
    assert.equal(mapped[0].public_status, "available")
    assert.equal(mapped[0].item_images[0].storage_path.includes("example.com"), true)
  })

  it("appends without duplicates", () => {
    const a = mapApiItemsToWall([
      {
        id: "1",
        slug: "a",
        title: "A",
        publicStatus: "available",
        images: [{ storagePath: "https://example.com/a.webp" }],
      },
    ])
    const b = mapApiItemsToWall(
      [
        {
          id: "1",
          slug: "a",
          title: "A",
          publicStatus: "available",
          images: [{ storagePath: "https://example.com/a.webp" }],
        },
        {
          id: "2",
          slug: "b",
          title: "B",
          publicStatus: "available",
          images: [{ storagePath: "https://example.com/b.webp" }],
        },
      ],
      null,
      { sortByGender: false },
    )
    const merged = appendWallItems(a, b)
    assert.equal(merged.length, 2)
    assert.deepEqual(
      merged.map((i) => i.id),
      ["1", "2"],
    )
  })
})
