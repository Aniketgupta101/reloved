import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  decodeWallCursor,
  encodeWallCursor,
  parseWallLimit,
  sliceWallPage,
} from "./wallPagination"

describe("wallPagination", () => {
  it("parses limit only when provided", () => {
    assert.equal(parseWallLimit(undefined), null)
    assert.equal(parseWallLimit(""), null)
    assert.equal(parseWallLimit("24"), 24)
    assert.equal(parseWallLimit("0"), 24)
    assert.equal(parseWallLimit("999"), 100)
  })

  it("encodes and decodes cursor by item id", () => {
    const token = encodeWallCursor({ id: "abc-123" })
    assert.ok(token.length > 0)
    assert.deepEqual(decodeWallCursor(token), { id: "abc-123" })
    assert.equal(decodeWallCursor("not-valid"), null)
  })

  it("returns first page and nextCursor when more exist", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }))
    const first = sliceWallPage(items, 24, null)
    assert.equal(first.page.length, 24)
    assert.equal(first.page[0].id, "id-0")
    assert.equal(first.page[23].id, "id-23")
    assert.equal(first.hasMore, true)
    assert.ok(first.nextCursor)
  })

  it("returns second page without duplicates", () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `id-${i}` }))
    const first = sliceWallPage(items, 24, null)
    const second = sliceWallPage(items, 24, decodeWallCursor(first.nextCursor))
    assert.equal(second.page.length, 24)
    assert.equal(second.page[0].id, "id-24")
    const ids = new Set([...first.page, ...second.page].map((i) => i.id))
    assert.equal(ids.size, 48)
  })

  it("marks last page hasMore false", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({ id: `id-${i}` }))
    const first = sliceWallPage(items, 24, null)
    const second = sliceWallPage(items, 24, decodeWallCursor(first.nextCursor))
    assert.equal(second.page.length, 6)
    assert.equal(second.hasMore, false)
    assert.equal(second.nextCursor, null)
  })
})
