/**
 * Shadowfax360 Unified Forward (Dale) — production.
 * Docs: https://sfxunifiedapi.docs.apiary.io/
 *
 * Auth: Authorization: Token <SHADOWFAX_TOKEN>
 * Base: https://dale.shadowfax.in (prod)
 *
 * Env:
 * - SHADOWFAX_TOKEN
 * - SHADOWFAX_BASE_URL (default https://dale.shadowfax.in)
 * - SHADOWFAX_AUTH_STYLE (default token)
 * - SHADOWFAX_OPS_PHONE
 * - SHADOWFAX_BOOKING_ENABLED — must be "1"/"true" to allow live API books (wallet spend).
 *   Default OFF: test.reloved.digital uses manual courier; claiming never books Shadowfax.
 */

type ShadowfaxJson = Record<string, any>

const DEFAULT_PROD_BASE = "https://dale.shadowfax.in"

function envFlagOn(name: string): boolean {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

/** Live API booking (spends Shadowfax wallet). Off unless explicitly enabled. */
export function shadowfaxBookingEnabled(): boolean {
  return envFlagOn("SHADOWFAX_BOOKING_ENABLED") && Boolean(process.env.SHADOWFAX_TOKEN?.trim())
}

export function shadowfaxConfigured(): boolean {
  return shadowfaxBookingEnabled()
}

function assertShadowfaxBookingAllowed(): void {
  if (shadowfaxBookingEnabled()) return
  throw new Error(
    "Shadowfax API booking is disabled (manual courier only). No Shadowfax credits will be used. Set SHADOWFAX_BOOKING_ENABLED=1 only when you intentionally want live API books."
  )
}

export function shadowfaxOpsPhone(): string {
  const raw =
    process.env.SHADOWFAX_OPS_PHONE ||
    process.env.SHIPROCKET_OPS_PHONE ||
    process.env.BORZO_OPS_PHONE ||
    process.env.RELOVED_OPS_PRIMARY_PHONE ||
    "9653273812"
  return String(raw).replace(/\D/g, "").slice(-10)
}

function shadowfaxBaseUrl(): string {
  return (process.env.SHADOWFAX_BASE_URL || DEFAULT_PROD_BASE).replace(/\/$/, "")
}

function shadowfaxToken(): string {
  const t = process.env.SHADOWFAX_TOKEN?.trim()
  if (!t) throw new Error("SHADOWFAX_TOKEN is not configured")
  return t
}

function authHeader(): string {
  const style = (process.env.SHADOWFAX_AUTH_STYLE || "token").trim().toLowerCase()
  const t = shadowfaxToken()
  if (style === "raw") return t
  if (style === "bearer") return `Bearer ${t}`
  return `Token ${t}`
}

function extractCityState(address: string, pincode?: string | null): { city: string; state: string } {
  const a = String(address || "")
  if (/mumbai|bandra|andheri|powai|worli|parel|juhu|goregaon|malad|borivali|kurla|chembur|dadar/i.test(a)) {
    return { city: "Mumbai", state: "Maharashtra" }
  }
  if (pincode && /^4/.test(pincode)) return { city: "Mumbai", state: "Maharashtra" }
  return { city: "Mumbai", state: "Maharashtra" }
}

async function shadowfaxRequest(
  path: string,
  opts?: { method?: string; body?: ShadowfaxJson }
): Promise<ShadowfaxJson> {
  const method = opts?.method || (opts?.body ? "POST" : "GET")
  const url = `${shadowfaxBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: ShadowfaxJson = {}
  try {
    json = text ? (JSON.parse(text) as ShadowfaxJson) : {}
  } catch {
    throw new Error(`Shadowfax non-JSON (${res.status}): ${text.slice(0, 240)}`)
  }

  const failMsg = (() => {
    if (typeof json.errors === "string") return json.errors
    if (Array.isArray(json.errors)) return json.errors.join("; ")
    if (typeof json.message === "string" && /failure|error|invalid/i.test(json.message) && json.errors) {
      return typeof json.errors === "string" ? json.errors : JSON.stringify(json.errors)
    }
    if (typeof json.message === "string" && json.message !== "Success" && res.ok === false) return json.message
    if (typeof json.error === "string") return json.error
    if (typeof json.errorCode === "string") return json.errorCode
    return null
  })()

  // Dale often returns HTTP 200 with { message: "Failure", errors: "..." }
  if (!res.ok || String(json.message || "").toLowerCase() === "failure" || failMsg) {
    const raw = failMsg || text.slice(0, 240) || `Shadowfax error ${res.status}`
    if (/inactive|expired/i.test(raw)) {
      throw new Error(
        "Shadowfax token is inactive or expired. Update SHADOWFAX_TOKEN (production) and redeploy."
      )
    }
    if (/credentials not provided/i.test(raw)) {
      throw new Error(
        "Shadowfax rejected auth. Use production token with SHADOWFAX_AUTH_STYLE=token and base https://dale.shadowfax.in"
      )
    }
    if (/insufficient wallet/i.test(raw)) {
      throw new Error(
        `Shadowfax wallet needs recharge. ${raw}`
      )
    }
    if (/not serviceable|invalid pickup pincode/i.test(raw)) {
      throw new Error(
        `Shadowfax cannot pick up from this pincode. ${raw}`
      )
    }
    throw new Error(raw)
  }
  return json
}

export interface ShadowfaxBookResult {
  orderId: string
  status: string
  trackingUrl?: string | null
  awb?: string | null
  raw: ShadowfaxJson
}

/**
 * Book gate→gate via Unified Forward (Dale).
 * Ops phone on both ends for privacy.
 */
export async function shadowfaxBookGateToGate(opts: {
  clientOrderId: string
  pickupAddress: string
  dropAddress: string
  pickupPincode: string
  dropPincode: string
  donorName?: string
  claimerName?: string
  itemTitle?: string
  paymentMethod?: "Prepaid" | "COD"
  collectAmountInr?: number
}): Promise<ShadowfaxBookResult> {
  assertShadowfaxBookingAllowed()
  const phone = shadowfaxOpsPhone()
  const prepaid = (opts.paymentMethod || "Prepaid") === "Prepaid"
  const pickupPin = String(opts.pickupPincode).replace(/\D/g, "").slice(0, 6)
  const dropPin = String(opts.dropPincode).replace(/\D/g, "").slice(0, 6)
  const pickupGeo = extractCityState(opts.pickupAddress, pickupPin)
  const dropGeo = extractCityState(opts.dropAddress, dropPin)
  const pickupName = String(opts.donorName || "Donor").split(/\s+/)[0].slice(0, 40) || "Donor"
  const dropName = String(opts.claimerName || "Receiver").split(/\s+/)[0].slice(0, 40) || "Receiver"
  const productValue = 500
  const codAmount = prepaid ? 0 : Math.max(0, Math.round(Number(opts.collectAmountInr || 40)))

  const partyPickup = {
    name: `${pickupName} (donor)`,
    contact: phone,
    address_line_1: opts.pickupAddress.slice(0, 190),
    address_line_2: "Gate security only — no flat",
    city: pickupGeo.city,
    state: pickupGeo.state,
    pincode: pickupPin,
  }

  const body = {
    order_details: {
      client_order_id: opts.clientOrderId.slice(0, 50),
      actual_weight: 0.5,
      volumetric_weight: 0.5,
      product_value: productValue,
      payment_mode: prepaid ? "Prepaid" : "COD",
      cod_amount: codAmount,
      total_amount: prepaid ? 0 : codAmount,
    },
    customer_details: {
      name: `${dropName} (receiver)`,
      contact: phone,
      address_line_1: opts.dropAddress.slice(0, 190),
      address_line_2: "Gate security only — no flat",
      city: dropGeo.city,
      state: dropGeo.state,
      pincode: dropPin,
    },
    pickup_details: partyPickup,
    // Required by Dale forward API for this client
    return_details: {
      return_type: "seller",
      ...partyPickup,
    },
    product_details: [
      {
        sku: "RELOVED",
        client_sku_id: "RELOVED",
        sku_name: String(opts.itemTitle || "Reloved preloved item").slice(0, 100),
        name: String(opts.itemTitle || "Reloved preloved item").slice(0, 100),
        price: productValue,
        quantity: 1,
        hsn_code: "6109",
      },
    ],
  }

  const json = await shadowfaxRequest("/api/v1/clients/orders/", { method: "POST", body })
  const data = json.data || json
  const awb = String(
    data.awb_number || data.awb || data.AWB || json.awb_number || json.awb || ""
  )
  const orderId = String(
    data.order_id || data.id || data.client_order_id || awb || opts.clientOrderId
  )
  const status = String(data.status || data.order_status || json.message || "CREATED")
  const track =
    data.tracking_url ||
    json.tracking_url ||
    (awb ? `https://track.shadowfax.in/track?awb=${encodeURIComponent(awb)}` : null)

  return {
    orderId,
    status,
    trackingUrl: track ? String(track) : null,
    awb: awb || null,
    raw: json,
  }
}

export async function shadowfaxCancelOrder(orderIdOrAwb: string): Promise<ShadowfaxJson> {
  assertShadowfaxBookingAllowed()
  const id = String(orderIdOrAwb).trim()
  try {
    return await shadowfaxRequest(`/api/v1/clients/orders/${encodeURIComponent(id)}/cancel/`, {
      method: "POST",
      body: { reason: "Cancelled by Reloved client" },
    })
  } catch (err: any) {
    const msg = String(err?.message || "")
    if (!/404|not found/i.test(msg)) throw err
    return shadowfaxRequest("/api/v1/clients/orders/cancel/", {
      method: "POST",
      body: { awb_number: id, request_id: id, reason: "Cancelled by Reloved client" },
    })
  }
}

export function shadowfaxStatusSummary(): {
  configured: boolean
  bookingEnabled: boolean
  tokenPresent: boolean
  baseUrl: string
  authStyle: string
  message: string
} {
  const tokenPresent = Boolean(process.env.SHADOWFAX_TOKEN?.trim())
  const bookingEnabled = shadowfaxBookingEnabled()
  return {
    configured: bookingEnabled,
    bookingEnabled,
    tokenPresent,
    baseUrl: shadowfaxBaseUrl(),
    authStyle: (process.env.SHADOWFAX_AUTH_STYLE || "token").trim().toLowerCase(),
    message: bookingEnabled
      ? "Shadowfax API booking ON — live wallet may be charged."
      : "Shadowfax API booking OFF — manual courier only; claiming will not use Shadowfax credits.",
  }
}
