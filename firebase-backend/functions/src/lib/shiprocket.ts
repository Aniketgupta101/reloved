/**
 * Shiprocket India external API client.
 * Docs: https://apidocs.shiprocket.in/
 *
 * Env:
 * - SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD (API user)
 * - SHIPROCKET_OPS_PHONE (defaults to BORZO_OPS_PHONE / 9653273812)
 * - SHIPROCKET_PICKUP_LOCATION — optional: verified pickup nickname in Shiprocket
 *   dashboard (Settings → Pickup). Prefer this so each book doesn't create an
 *   unverified address that needs OTP again.
 * - SHIPROCKET_HSN — optional HSN for apparel (default 6109)
 * - SHIPROCKET_BOOKING_ENABLED — must be "1"/"true" to allow live API books (wallet spend).
 *   Default OFF for test.reloved.digital manual courier flow.
 */

const API_BASE = "https://apiv2.shiprocket.in/v1/external"

type ShiprocketJson = Record<string, any>

let cachedToken: { token: string; expiresAtMs: number } | null = null

function envFlagOn(name: string): boolean {
  const v = String(process.env[name] || "")
    .trim()
    .toLowerCase()
  return v === "1" || v === "true" || v === "yes" || v === "on"
}

/** Live API booking (spends Shiprocket wallet). Off unless explicitly enabled. */
export function shiprocketBookingEnabled(): boolean {
  return (
    envFlagOn("SHIPROCKET_BOOKING_ENABLED") &&
    Boolean(process.env.SHIPROCKET_EMAIL?.trim() && process.env.SHIPROCKET_PASSWORD?.trim())
  )
}

export function shiprocketConfigured(): boolean {
  return shiprocketBookingEnabled()
}

function assertShiprocketBookingAllowed(): void {
  if (shiprocketBookingEnabled()) return
  throw new Error(
    "Shiprocket API booking is disabled (manual courier only). No Shiprocket wallet will be charged. Set SHIPROCKET_BOOKING_ENABLED=1 only when you intentionally want live API books."
  )
}

export function shiprocketOpsPhone(): string {
  const raw =
    process.env.SHIPROCKET_OPS_PHONE ||
    process.env.BORZO_OPS_PHONE ||
    process.env.RELOVED_OPS_PRIMARY_PHONE ||
    "9653273812"
  return String(raw).replace(/\D/g, "").slice(-10)
}

/** Pull a 6-digit Indian PIN from free text (also accepts "400 053" / "400-053"). */
export function extractIndiaPincode(text?: string | null): string | null {
  const s = String(text || "")
  const solid = s.match(/\b([1-9]\d{5})\b/)
  if (solid) return solid[1]
  const spaced = s.match(/\b([1-9]\d{2})[\s-]?(\d{3})\b/)
  if (spaced) return `${spaced[1]}${spaced[2]}`
  return null
}

/** Append PIN to an address line when the text itself has none. */
export function withIndiaPincode(address: string, pincode?: string | null): string {
  const base = String(address || "").trim()
  if (!base) return base
  if (extractIndiaPincode(base)) return base
  const pin = extractIndiaPincode(pincode) || String(pincode || "").replace(/\D/g, "").slice(0, 6)
  if (pin.length !== 6 || pin[0] === "0") return base
  return `${base} ${pin}`
}

/** Shiprocket: address_1 + address_2 combined must be ≤ 190 chars. */
const SHIPROCKET_ADDR_COMBINED_MAX = 190
const SHORT_GATE_NOTE = "Gate security only — no flat."

/** Strip long Reloved gate suffixes before sending to Shiprocket. */
export function cleanShiprocketBuilding(text: string): string {
  return String(text || "")
    .replace(/\s*\(\s*Collect from building main gate security\.?\s*Do not call flat\.?\s*\)/gi, "")
    .replace(/\s*Collect from building main gate security\.?\s*Do not call flat\.?/gi, "")
    .replace(/\s*Deliver to building main gate security\.?\s*Do not call flat\.?/gi, "")
    .replace(/\s*Main gate security\.?\s*Do not call flat\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Shiprocket rejects addresses without house/flat/road — gate prefix keeps Reloved privacy. */
export function formatShiprocketGateAddress(building: string): string {
  const raw = cleanShiprocketBuilding(building) || "Building main gate, Mumbai"
  if (/^\s*(gate|flat|house|shop|plot|road|no\.?\s*\d)/i.test(raw)) return raw
  return `Gate 1, ${raw}`
}

/**
 * Split building into address + address_2 within Shiprocket's 190-char combined limit.
 */
export function splitShiprocketAddress(building: string): { address: string; address2: string } {
  let line1 = formatShiprocketGateAddress(building)
  let address2 = SHORT_GATE_NOTE
  const pin = extractIndiaPincode(line1)

  const fit = (a1: string, a2: string) => a1.length + a2.length <= SHIPROCKET_ADDR_COMBINED_MAX

  if (!fit(line1, address2)) {
    const max1 = Math.max(40, SHIPROCKET_ADDR_COMBINED_MAX - address2.length)
    if (pin && !line1.slice(0, max1).includes(pin)) {
      line1 = `${line1.slice(0, Math.max(0, max1 - pin.length - 1)).trim()} ${pin}`
    } else {
      line1 = line1.slice(0, max1).trim()
    }
  }
  if (!fit(line1, address2)) {
    address2 = "Gate only"
  }
  if (!fit(line1, address2)) {
    line1 = line1.slice(0, SHIPROCKET_ADDR_COMBINED_MAX - address2.length).trim()
  }
  return { address: line1, address2 }
}

async function shiprocketLogin(): Promise<string> {
  const email = process.env.SHIPROCKET_EMAIL?.trim()
  const password = process.env.SHIPROCKET_PASSWORD?.trim()
  if (!email || !password) {
    throw new Error("SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD are not configured")
  }
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.token
  }
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const json = (await res.json()) as ShiprocketJson
  if (!res.ok || !json.token) {
    throw new Error(json.message || `Shiprocket login failed (${res.status})`)
  }
  cachedToken = {
    token: String(json.token),
    // Shiprocket tokens last ~10 days; refresh earlier
    expiresAtMs: Date.now() + 8 * 24 * 60 * 60 * 1000,
  }
  return cachedToken.token
}

async function shiprocketRequest(path: string, opts?: { method?: string; body?: ShiprocketJson }): Promise<ShiprocketJson> {
  const token = await shiprocketLogin()
  const method = opts?.method || (opts?.body ? "POST" : "GET")
  const res = await fetch(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: ShiprocketJson = {}
  try {
    json = text ? (JSON.parse(text) as ShiprocketJson) : {}
  } catch {
    throw new Error(`Shiprocket non-JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    const msg =
      typeof json.message === "string"
        ? json.message
        : json.message
          ? JSON.stringify(json.message)
          : `Shiprocket error ${res.status}`
    throw new Error(msg)
  }
  return json
}

export async function shiprocketGetWalletBalance(): Promise<number> {
  const json = await shiprocketRequest("/account/details/wallet-balance")
  const raw = json?.data?.balance_amount ?? json?.balance_amount ?? 0
  const n = typeof raw === "number" ? raw : parseFloat(String(raw))
  return Number.isFinite(n) ? n : 0
}

export async function shiprocketCheckServiceability(opts: {
  pickupPincode: string
  dropPincode: string
  weightKg?: number
  /** When true, quote COD-capable couriers (claimer pays at door). */
  cod?: boolean
}): Promise<{
  ok: boolean
  cheapest?: { courierName: string; courierCompanyId: number; freightCharge: number; etd?: string }
  raw?: ShiprocketJson
}> {
  const qs = new URLSearchParams({
    pickup_postcode: opts.pickupPincode,
    delivery_postcode: opts.dropPincode,
    cod: opts.cod ? "1" : "0",
    weight: String(opts.weightKg ?? 0.5),
  })
  const json = await shiprocketRequest(`/courier/serviceability?${qs.toString()}`)
  const list = json?.data?.available_courier_companies
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, raw: json }
  }
  const sorted = [...list].sort(
    (a, b) => Number(a.freight_charge || a.rate || 9999) - Number(b.freight_charge || b.rate || 9999),
  )
  const best = sorted[0]
  return {
    ok: true,
    cheapest: {
      courierName: String(best.courier_name || "Courier"),
      courierCompanyId: Number(best.courier_company_id),
      freightCharge: Number(best.freight_charge || best.rate || 0),
      etd: best.etd ? String(best.etd) : undefined,
    },
    raw: json,
  }
}

export async function shiprocketAddPickupLocation(opts: {
  pickupCode: string
  address: string
  pincode: string
  city?: string
  state?: string
  phone?: string
  name?: string
}): Promise<{ pickupCode: string; pickupId?: number }> {
  const phone = (opts.phone || shiprocketOpsPhone()).replace(/\D/g, "").slice(-10)
  const { address, address2 } = splitShiprocketAddress(opts.address)
  const contactName = String(opts.name || "Reloved donor").slice(0, 50)

  async function addOnce(code: string) {
    const json = await shiprocketRequest("/settings/company/addpickup", {
      method: "POST",
      body: {
        pickup_location: code.slice(0, 36),
        name: contactName,
        email: process.env.SHIPROCKET_EMAIL?.trim() || "ops@reloved.digital",
        phone,
        address,
        address_2: address2,
        city: opts.city || "Mumbai",
        state: opts.state || "Maharashtra",
        country: "India",
        pin_code: opts.pincode,
      },
    })
    return {
      pickupCode: String(json?.address?.pickup_code || code).slice(0, 36),
      pickupId: json?.pickup_id ? Number(json.pickup_id) : undefined,
    }
  }

  try {
    return await addOnce(opts.pickupCode)
  } catch (err) {
    const msg = String((err as Error)?.message || err).toLowerCase()
    // Nickname already registered — reuse it for the order (may still need OTP once in dashboard).
    if (msg.includes("already exists") || msg.includes("inactive")) {
      return { pickupCode: opts.pickupCode.slice(0, 36) }
    }
    throw err
  }
}

/** List company pickup locations (for reusing a verified nickname). */
export async function shiprocketListPickupLocations(): Promise<
  Array<{
    id?: number
    pickup_location: string
    pin_code?: string
    phone_verified?: number | boolean
    status?: number | string
    address?: string
  }>
> {
  try {
    const json = await shiprocketRequest("/settings/company/pickup")
    const raw = json?.data?.shipping_address || json?.data || json?.shipping_address || []
    return Array.isArray(raw) ? raw : []
  } catch (err) {
    console.warn("shiprocket list pickup", err)
    return []
  }
}

/**
 * Build a stable Shiprocket pickup nickname from donor pin + building,
 * so different donors (or buildings) don't share the wrong address.
 */
function pickupCodeForDonorBuilding(pincode: string, address: string): string {
  const pin = String(pincode || "").replace(/\D/g, "").slice(0, 6) || "MUM"
  const norm = String(address || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 48)
  let h = 0
  for (let i = 0; i < norm.length; i++) h = ((h << 5) - h + norm.charCodeAt(i)) | 0
  const tag = Math.abs(h).toString(36).slice(0, 5)
  return `RLV${pin}${tag}`.slice(0, 36)
}

/**
 * Pickup = this donor's building only (never reuse another address by pincode alone).
 * Receiver address is set separately on the order as billing/shipping.
 */
export async function resolveShiprocketPickupLocation(opts: {
  pickupAddress: string
  pickupPincode: string
  donorName?: string
}): Promise<{ pickupCode: string; created: boolean }> {
  const pin = String(opts.pickupPincode || "").replace(/\D/g, "").slice(0, 6)
  const code = pickupCodeForDonorBuilding(pin, opts.pickupAddress)
  const list = await shiprocketListPickupLocations()

  const exact = list.find(
    (p) => String(p.pickup_location || "").toLowerCase() === code.toLowerCase()
  )
  if (exact?.pickup_location) {
    return { pickupCode: String(exact.pickup_location).slice(0, 36), created: false }
  }

  // Optional ops HQ only when explicitly configured — not used for donor→claimer by default.
  // (Left unused here so pickup always maps to the donor building.)

  const created = await shiprocketAddPickupLocation({
    pickupCode: code,
    address: opts.pickupAddress,
    pincode: pin || "400001",
    name: opts.donorName ? `${opts.donorName} (donor)` : "Reloved donor",
  })
  return { pickupCode: created.pickupCode, created: true }
}

function shiprocketHsn(): string {
  const raw = String(process.env.SHIPROCKET_HSN || "6109").replace(/\D/g, "")
  return (raw || "6109").slice(0, 8)
}

function formatOrderDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface ShiprocketCreateOrderResult {
  orderId: number
  channelOrderId: string
  shipmentId: number
  status: string
  awbCode?: string
  courierName?: string
  trackingUrl?: string
  raw: ShiprocketJson
}

export async function shiprocketCreateAdhocOrder(opts: {
  clientOrderId: string
  pickupCode: string
  dropAddress: string
  dropPincode: string
  dropCity?: string
  dropState?: string
  /** Claimer first name — shown as delivery customer in Shiprocket. */
  claimerName?: string
  itemTitle?: string
  phone?: string
  /** Prepaid = Reloved wallet; COD = claimer pays courier at delivery (after first-500). */
  paymentMethod?: "Prepaid" | "COD"
  /** Amount claimer pays at door when COD (usually the freight quote). */
  collectAmountInr?: number
}): Promise<ShiprocketCreateOrderResult> {
  const phone = (opts.phone || shiprocketOpsPhone()).replace(/\D/g, "").slice(-10)
  const paymentMethod = opts.paymentMethod === "COD" ? "COD" : "Prepaid"
  // COD collect: freight estimate. Prepaid: nominal ₹1 (item is free; Reloved wallet pays shipping).
  const collect =
    paymentMethod === "COD"
      ? Math.max(1, Math.round(Number(opts.collectAmountInr || 80)))
      : 1
  const { address: billingAddress, address2: billingAddress2 } = splitShiprocketAddress(opts.dropAddress)
  const claimerFirst = String(opts.claimerName || "Claimer").trim().split(/\s+/)[0].slice(0, 40) || "Claimer"
  const body: ShiprocketJson = {
    order_id: opts.clientOrderId.slice(0, 50),
    order_date: formatOrderDate(),
    pickup_location: opts.pickupCode,
    billing_customer_name: claimerFirst,
    billing_last_name: "Receiver",
    billing_address: billingAddress,
    billing_address_2: billingAddress2 || "Receiver building gate — no flat",
    billing_city: opts.dropCity || "Mumbai",
    billing_pincode: opts.dropPincode,
    billing_state: opts.dropState || "Maharashtra",
    billing_country: "India",
    billing_email: process.env.SHIPROCKET_EMAIL?.trim() || "ops@reloved.digital",
    billing_phone: phone,
    shipping_is_billing: true,
    order_items: [
      {
        name: (opts.itemTitle || "Reloved preloved item").slice(0, 200),
        sku: `RLV-${opts.clientOrderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`,
        units: 1,
        selling_price: collect,
        hsn: shiprocketHsn(),
      },
    ],
    payment_method: paymentMethod,
    sub_total: collect,
    length: 25,
    breadth: 20,
    height: 8,
    weight: 0.5,
  }

  const json = await shiprocketRequest("/orders/create/adhoc", { method: "POST", body })
  const orderId = Number(json.order_id)
  const shipmentId = Number(json.shipment_id)
  if (!orderId || !shipmentId) {
    throw new Error(`Shiprocket create-order missing ids: ${JSON.stringify(json).slice(0, 300)}`)
  }
  return {
    orderId,
    channelOrderId: String(json.channel_order_id || opts.clientOrderId),
    shipmentId,
    status: String(json.status || "NEW"),
    awbCode: json.awb_code ? String(json.awb_code) : undefined,
    courierName: json.courier_name ? String(json.courier_name) : undefined,
    trackingUrl: json.awb_code ? `https://shiprocket.co/tracking/${json.awb_code}` : undefined,
    raw: json,
  }
}

export async function shiprocketAssignAwb(shipmentId: number, courierId?: number): Promise<ShiprocketJson> {
  const body: ShiprocketJson = { shipment_id: shipmentId }
  if (courierId) body.courier_id = courierId
  return shiprocketRequest("/courier/assign/awb", { method: "POST", body })
}

export async function shiprocketGeneratePickup(shipmentId: number): Promise<ShiprocketJson> {
  return shiprocketRequest("/courier/generate/pickup", {
    method: "POST",
    body: { shipment_id: [shipmentId] },
  })
}

export async function shiprocketCancelOrder(orderId: number): Promise<ShiprocketJson> {
  assertShiprocketBookingAllowed()
  return shiprocketRequest("/orders/cancel", { method: "POST", body: { ids: [orderId] } })
}

/**
 * Full book: add dynamic pickup → create order → assign AWB → schedule pickup.
 * Prepaid (Reloved first-500): wallet pays shipping.
 * COD (after 500): claimer pays collect amount at delivery.
 */
export async function shiprocketBookGateToGate(opts: {
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
}): Promise<
  ShiprocketCreateOrderResult & {
    walletBalance: number
    assigned: boolean
    assignError?: string
    paymentMethod: "Prepaid" | "COD"
  }
> {
  assertShiprocketBookingAllowed()
  const paymentMethod = opts.paymentMethod === "COD" ? "COD" : "Prepaid"
  const walletBalance = await shiprocketGetWalletBalance()

  const pickup = await resolveShiprocketPickupLocation({
    pickupAddress: opts.pickupAddress,
    pickupPincode: opts.pickupPincode,
    donorName: opts.donorName,
  })
  const resolvedPickupCode = pickup.pickupCode

  let collectAmount = opts.collectAmountInr
  if (paymentMethod === "COD" && (collectAmount == null || collectAmount <= 0)) {
    const svc = await shiprocketCheckServiceability({
      pickupPincode: opts.pickupPincode,
      dropPincode: opts.dropPincode,
      cod: true,
    })
    collectAmount = svc.cheapest?.freightCharge || 80
  }

  // Unique order id per attempt so a partial prior create doesn't block retries.
  const orderId = `${opts.clientOrderId}_${Date.now().toString(36)}`.slice(0, 50)

  const created = await shiprocketCreateAdhocOrder({
    clientOrderId: orderId,
    pickupCode: resolvedPickupCode,
    dropAddress: opts.dropAddress,
    dropPincode: opts.dropPincode,
    claimerName: opts.claimerName,
    itemTitle: opts.itemTitle,
    paymentMethod,
    collectAmountInr: collectAmount,
  })

  // Prepaid AWB needs wallet; COD still often needs a small Shiprocket balance for fees.
  if (paymentMethod === "Prepaid" && walletBalance < 100) {
    return {
      ...created,
      walletBalance,
      assigned: false,
      paymentMethod,
      assignError: `Shiprocket wallet is ₹${walletBalance}. Recharge to at least ₹100, then sync/assign AWB.`,
    }
  }

  try {
    const awbRes = await shiprocketAssignAwb(created.shipmentId)
    const awbOk = awbRes.awb_assign_status === 1 || Boolean(awbRes?.response?.data?.awb_code)
    const awbCode =
      awbRes?.response?.data?.awb_code ||
      awbRes?.awb_code ||
      created.awbCode
    const courierName =
      awbRes?.response?.data?.courier_name ||
      awbRes?.courier_name ||
      created.courierName

    if (awbOk && awbCode) {
      try {
        await shiprocketGeneratePickup(created.shipmentId)
      } catch (err) {
        console.warn("Shiprocket generate pickup warning:", err)
      }
      return {
        ...created,
        awbCode: String(awbCode),
        courierName: courierName ? String(courierName) : undefined,
        trackingUrl: `https://shiprocket.co/tracking/${awbCode}`,
        status: "AWB_ASSIGNED",
        walletBalance,
        assigned: true,
        paymentMethod,
      }
    }

    const assignError =
      awbRes?.response?.data?.awb_assign_error ||
      awbRes?.message ||
      "AWB assignment failed"
    return {
      ...created,
      walletBalance,
      assigned: false,
      paymentMethod,
      assignError: String(assignError),
    }
  } catch (err) {
    return {
      ...created,
      walletBalance,
      assigned: false,
      paymentMethod,
      assignError: err instanceof Error ? err.message : "AWB assignment failed",
    }
  }
}
