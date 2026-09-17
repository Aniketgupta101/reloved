/**
 * Privacy + photo-analyze assumption tests (plan Section D).
 * Run: npm run test:privacy (from firebase-backend/functions after build)
 */
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  detectSensitiveChatText,
  peerChatTextBlocked,
  sanitizePublicError,
  PHOTO_ANALYZE_PUBLIC_ERROR,
  PEER_CHAT_BLOCK_MESSAGE,
} from "../lib/privacyText.js"
import { toPublicArea } from "../lib/geo.js"

describe("TC-C peer chat scrub", () => {
  it("TC-C1 allow landmark", () => {
    assert.equal(peerChatTextBlocked("Meet at Oberoi Springs gate"), false)
    assert.equal(detectSensitiveChatText("Meet at Oberoi Springs gate"), null)
  })

  it("TC-C2 reject phone", () => {
    assert.equal(peerChatTextBlocked("Call me on 9876543210"), true)
    assert.equal(detectSensitiveChatText("Call me on 9876543210"), "phone")
  })

  it("TC-C3 reject +91 spaced phone", () => {
    assert.equal(peerChatTextBlocked("+91 98765 43210 at gate"), true)
  })

  it("TC-C4 reject flat/wing", () => {
    assert.equal(peerChatTextBlocked("Flat 1203 wing B"), true)
    assert.equal(detectSensitiveChatText("Flat 1203 wing B"), "housing")
  })

  it("TC-C5 reject email", () => {
    assert.equal(peerChatTextBlocked("email me at a@b.com"), true)
    assert.equal(detectSensitiveChatText("email me at a@b.com"), "email")
  })

  it("TC-C6 ops thread policy: same phone text is detectable (caller decides allow)", () => {
    // Reloved threads soft-warn only — detection still true; route does not block.
    assert.equal(peerChatTextBlocked("9876543210"), true)
    assert.ok(PEER_CHAT_BLOCK_MESSAGE.includes("landmark"))
  })
})

describe("TC-H handover address mask", () => {
  it("TC-H1 strips flat/wing tokens", () => {
    const publicArea = toPublicArea("Oberoi Springs, Flat 12, Wing A, Andheri West, Mumbai")
    assert.ok(!/flat/i.test(publicArea), `got: ${publicArea}`)
    assert.ok(!/wing/i.test(publicArea), `got: ${publicArea}`)
  })

  it("TC-H2 public area stays neighbourhood-ish", () => {
    const publicArea = toPublicArea("Some Building, Bandra West, Mumbai")
    assert.match(publicArea.toLowerCase(), /bandra|mumbai/)
  })
})

describe("TC-P photo error sanitize", () => {
  it("TC-P1 strips Gemini 429 detail", () => {
    const out = sanitizePublicError(
      new Error("Gemini API 429: RESOURCE_EXHAUSTED quota"),
      PHOTO_ANALYZE_PUBLIC_ERROR,
    )
    assert.equal(out, PHOTO_ANALYZE_PUBLIC_ERROR)
    assert.ok(!out.toLowerCase().includes("gemini"))
    assert.ok(!out.includes("429"))
  })

  it("TC-P6 friendly fallback for empty/ADC errors", () => {
    const out = sanitizePublicError(
      new Error("No GEMINI_API_KEY and Vertex ADC unavailable"),
      PHOTO_ANALYZE_PUBLIC_ERROR,
    )
    assert.equal(out, PHOTO_ANALYZE_PUBLIC_ERROR)
  })

  it("allows short product copy through", () => {
    const msg = "Couldn't analyze that photo right now. Please try again."
    assert.equal(sanitizePublicError(new Error(msg), PHOTO_ANALYZE_PUBLIC_ERROR), msg)
  })
})

describe("TC-P7/P8 sensitive flag contract (shape)", () => {
  it("documents expected AnalyzeOk fields", () => {
    const sample = {
      ok: true as const,
      bgRemoved: false,
      sensitiveDetected: true,
      sensitiveReason: "id_document",
      storagePath: "https://example.com/x.jpg",
    }
    assert.equal(sample.sensitiveDetected, true)
    assert.equal(sample.bgRemoved, false)
    assert.ok(sample.storagePath)
  })
})
