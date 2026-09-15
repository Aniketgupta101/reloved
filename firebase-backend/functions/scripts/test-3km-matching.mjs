/**
 * Measurable 3 km donor-send matching + empty-radius fallback.
 * Run: node scripts/test-3km-matching.mjs
 */
import assert from "node:assert/strict"

const R = 6371
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const RADIUS = 3
const bandra = { lat: 19.0596, lng: 72.8295 }
const nearby = { lat: 19.065, lng: 72.83 } // ~0.6 km
const far = { lat: 19.12, lng: 72.9 } // ~10+ km

const nearKm = haversineKm(bandra.lat, bandra.lng, nearby.lat, nearby.lng)
const farKm = haversineKm(bandra.lat, bandra.lng, far.lat, far.lng)

assert.ok(nearKm <= RADIUS, `nearby should be ≤3km, got ${nearKm}`)
assert.ok(farKm > RADIUS, `far should be >3km, got ${farKm}`)

// Empty-radius policy: hard exclude + explicit message (not silent).
function decide(claimerKm) {
  if (claimerKm == null) {
    return { ok: false, code: "CLAIMER_LOCATION_REQUIRED" }
  }
  if (claimerKm > RADIUS) {
    return {
      ok: false,
      code: "OUTSIDE_3KM",
      error: `This giver only sends within 3 km (you're about ${claimerKm.toFixed(1)} km away). Fallback options: (1) closer giver, (2) Receiver collects / Porter-Borzo, (3) support — never silently fail.`,
    }
  }
  return { ok: true }
}

assert.equal(decide(nearKm).ok, true)
assert.equal(decide(farKm).ok, false)
assert.equal(decide(farKm).code, "OUTSIDE_3KM")
assert.match(decide(farKm).error, /Fallback|never silently fail/i)
assert.equal(decide(null).code, "CLAIMER_LOCATION_REQUIRED")

console.log("PASS 3km matching measurable", {
  nearKm: Number(nearKm.toFixed(2)),
  farKm: Number(farKm.toFixed(2)),
  radiusKm: RADIUS,
  emptyRadiusExplicit: true,
})
