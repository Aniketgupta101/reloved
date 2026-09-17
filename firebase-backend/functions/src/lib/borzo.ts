import crypto from "crypto"

/**
 * Borzo India Business API client.
 * Docs: https://borzodelivery.com/in/business-api/doc
 *
 * Configured via:
 * - BORZO_AUTH_TOKEN: API token from Borzo Business cabinet
 * - BORZO_API_BASE: Defaults to India test base, set to prod base for live operations
 * - BORZO_OPS_PHONE: Central ops phone number (digits only, e.g. 9653273812)
 * - BORZO_CALLBACK_SECRET: Secret for verifying webhook HMAC signatures (optional)
 */

const DEFAULT_TEST_BASE = "https://robotapitest-in.borzodelivery.com/api/business/1.8"
const DEFAULT_PROD_BASE = "https://robot-in.borzodelivery.com/api/business/1.8"

export function borzoConfigured(): boolean {
  return Boolean(process.env.BORZO_AUTH_TOKEN?.trim())
}

export function borzoApiBase(): string {
  return (process.env.BORZO_API_BASE || DEFAULT_TEST_BASE).replace(/\/$/, "")
}

export function borzoOpsPhone(): string {
  return (process.env.BORZO_OPS_PHONE || "").replace(/\D/g, "")
}

export function borzoCallbackSecret(): string {
  return (process.env.BORZO_CALLBACK_SECRET || "").trim()
}

/** Formats a phone number for Borzo India (10 digits -> +91XXXXXXXXXX). */
export function formatBorzoPhone(phone?: string | null): string {
  const digits = (phone || "").replace(/\D/g, "")
  if (!digits) {
    const ops = borzoOpsPhone()
    return ops.length === 10 ? `+91${ops}` : ops
  }
  if (digits.length === 10) return `+91${digits}`
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`
  return digits.startsWith("+") ? digits : `+${digits}`
}

type BorzoJson = Record<string, any>

export interface BorzoCourierInfo {
  courierId?: number
  name?: string
  surname?: string
  phone?: string
  photoUrl?: string
  latitude?: number
  longitude?: number
}

export interface BorzoOrderSummary {
  orderId: number
  orderName?: string
  status: string
  statusDescription?: string
  trackingUrl?: string
  paymentAmount?: string
  deliveryFeeAmount?: string
  deliveryStatus?: string
  courier?: BorzoCourierInfo | null
  createdDatetime?: string
  finishDatetime?: string
  points?: any[]
  raw?: BorzoJson
}

export interface BorzoCalculateOrderOpts {
  pickupAddress: string
  dropAddress: string
  pickupPhone?: string
  pickupName?: string
  dropPhone?: string
  dropName?: string
  matter?: string
  totalWeightKg?: number
}

export interface BorzoCreateOrderOpts {
  clientOrderId?: string
  pickupAddress: string
  dropAddress: string
  pickupPhone?: string
  pickupName?: string
  dropPhone?: string
  dropName?: string
  pickupNote?: string
  dropNote?: string
  matter?: string
  totalWeightKg?: number
}

function extractErrorMessage(json: BorzoJson, fallbackStatus: number): string {
  if (json.parameter_errors && typeof json.parameter_errors === "object") {
    const parts: string[] = []
    const recurse = (obj: any, prefix = "") => {
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) {
          parts.push(`${prefix ? `${prefix}.` : ""}${k}: ${v.join(", ")}`)
        } else if (v && typeof v === "object") {
          recurse(v, prefix ? `${prefix}.${k}` : k)
        }
      }
    }
    recurse(json.parameter_errors)
    if (parts.length > 0) return parts.join("; ")
  }
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    return json.errors.join(", ")
  }
  if (typeof json.message === "string") return json.message
  return `Borzo API returned error status ${fallbackStatus}`
}

async function borzoRequest(path: string, body?: BorzoJson): Promise<BorzoJson> {
  const token = process.env.BORZO_AUTH_TOKEN?.trim()
  if (!token) {
    throw new Error("BORZO_AUTH_TOKEN is not configured in server environment")
  }
  const url = `${borzoApiBase()}${path.startsWith("/") ? path : `/${path}`}`
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-DV-Auth-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: BorzoJson = {}
  try {
    json = text ? (JSON.parse(text) as BorzoJson) : {}
  } catch {
    throw new Error(`Borzo non-JSON response (${res.status}): ${text.slice(0, 200)}`)
  }

  if (!res.ok || json.is_successful === false) {
    const msg = extractErrorMessage(json, res.status)
    throw new Error(`Borzo error (${res.status}): ${msg}`)
  }

  return json
}

/** Check account auth, balance, and profile details. */
export async function borzoGetClient(): Promise<BorzoJson> {
  return borzoRequest("/client")
}

/**
 * Calculate price for a building→building hop.
 */
export async function borzoCalculateOrder(opts: BorzoCalculateOrderOpts): Promise<{
  isSuccessful: boolean
  paymentAmount: string | null
  deliveryFeeAmount: string | null
  rawOrder: any
}> {
  const opsFormatted = formatBorzoPhone(borzoOpsPhone())
  const pickupPhone = opts.pickupPhone ? formatBorzoPhone(opts.pickupPhone) : opsFormatted
  const dropPhone = opts.dropPhone ? formatBorzoPhone(opts.dropPhone) : opsFormatted

  const body: BorzoJson = {
    type: "standard",
    vehicle_type_id: 8, // motorbike
    matter: opts.matter || "Reloved preloved item — collect from main gate security. Do not call flat.",
    total_weight_kg: opts.totalWeightKg ?? 1,
    points: [
      {
        address: opts.pickupAddress,
        contact_person: {
          phone: pickupPhone,
          name: opts.pickupName || "Reloved Ops (Pickup)",
        },
        note: "Collect package directly from main gate security. Do not call flat.",
      },
      {
        address: opts.dropAddress,
        contact_person: {
          phone: dropPhone,
          name: opts.dropName || "Reloved Ops (Drop)",
        },
        note: "Deliver package directly to main gate security. Do not call flat.",
      },
    ],
  }

  const res = await borzoRequest("/calculate-order", body)
  const order = res.order || {}
  const delivery = order.delivery || {}
  const paymentAmount = order.payment_amount != null ? String(order.payment_amount) : delivery.payment_amount != null ? String(delivery.payment_amount) : null
  const deliveryFeeAmount = order.delivery_fee_amount != null ? String(order.delivery_fee_amount) : delivery.delivery_fee_amount != null ? String(delivery.delivery_fee_amount) : null

  return {
    isSuccessful: Boolean(res.is_successful),
    paymentAmount,
    deliveryFeeAmount,
    rawOrder: order,
  }
}

/**
 * Places a live/test delivery order with Borzo.
 */
export async function borzoCreateOrder(opts: BorzoCreateOrderOpts): Promise<BorzoOrderSummary> {
  const opsFormatted = formatBorzoPhone(borzoOpsPhone())
  const pickupPhone = opts.pickupPhone ? formatBorzoPhone(opts.pickupPhone) : opsFormatted
  const dropPhone = opts.dropPhone ? formatBorzoPhone(opts.dropPhone) : opsFormatted

  const body: BorzoJson = {
    type: "standard",
    vehicle_type_id: 8,
    matter: opts.matter || "Reloved preloved item — collect from main gate security. Do not call flat.",
    total_weight_kg: opts.totalWeightKg ?? 1,
    is_client_notification_enabled: false,
    is_contact_person_notification_enabled: false,
    // F&F safe launch: prepaid account balance only — never cash-on-delivery.
    payment_method: "balance",
    is_motobox_required: false,
    points: [
      {
        address: opts.pickupAddress,
        contact_person: {
          phone: pickupPhone,
          name: opts.pickupName || "Reloved Ops (Pickup Gate)",
        },
        client_order_id: opts.clientOrderId || null,
        note: opts.pickupNote || "Collect package directly from building main gate security. Do not call flat.",
      },
      {
        address: opts.dropAddress,
        contact_person: {
          phone: dropPhone,
          name: opts.dropName || "Reloved Ops (Drop Gate)",
        },
        client_order_id: opts.clientOrderId || null,
        note: opts.dropNote || "Deliver package directly to building main gate security. Do not call flat.",
      },
    ],
  }

  const res = await borzoRequest("/create-order", body)
  return parseBorzoOrderSummary(res.order, res)
}

/**
 * Fetches order details by order_id from Borzo.
 */
export async function borzoGetOrder(orderId: number | string): Promise<BorzoOrderSummary | null> {
  const numericId = typeof orderId === "string" ? parseInt(orderId, 10) : orderId
  if (isNaN(numericId)) throw new Error(`Invalid Borzo order_id: ${orderId}`)
  const res = await borzoRequest(`/orders?order_id=${numericId}`)
  const orders = Array.isArray(res.orders) ? res.orders : []
  if (orders.length === 0) return null
  return parseBorzoOrderSummary(orders[0], res)
}

/**
 * Cancels an order on Borzo (allowed if status is new, available, active, or delayed).
 */
export async function borzoCancelOrder(orderId: number | string): Promise<BorzoOrderSummary> {
  const numericId = typeof orderId === "string" ? parseInt(orderId, 10) : orderId
  if (isNaN(numericId)) throw new Error(`Invalid Borzo order_id: ${orderId}`)
  const res = await borzoRequest("/cancel-order", { order_id: numericId })
  return parseBorzoOrderSummary(res.order, res)
}

/** Parses raw Borzo order structure into standard Reloved summary. */
export function parseBorzoOrderSummary(order: any, rawEnvelope?: BorzoJson): BorzoOrderSummary {
  if (!order || typeof order !== "object") {
    throw new Error("Invalid order payload from Borzo")
  }

  const points = Array.isArray(order.points) ? order.points : []
  // Recipient tracking URL is usually attached to drop point (point 2) or pickup
  const trackingUrl =
    points[1]?.tracking_url ||
    points[0]?.tracking_url ||
    order.tracking_url ||
    null

  const delivery = order.delivery || {}
  const courierRaw = delivery.courier || order.courier || null

  let courier: BorzoCourierInfo | null = null
  if (courierRaw) {
    const names = [courierRaw.name, courierRaw.surname].filter(Boolean).join(" ").trim()
    courier = {
      courierId: courierRaw.courier_id,
      name: names || courierRaw.name || "Borzo Rider",
      surname: courierRaw.surname || undefined,
      phone: courierRaw.phone || undefined,
      photoUrl: courierRaw.photo_url || undefined,
      latitude: courierRaw.latitude || undefined,
      longitude: courierRaw.longitude || undefined,
    }
  }

  return {
    orderId: order.order_id,
    orderName: order.order_name || undefined,
    status: order.status,
    statusDescription: order.status_description || undefined,
    trackingUrl: trackingUrl || undefined,
    paymentAmount:
      order.payment_amount != null
        ? String(order.payment_amount)
        : delivery.payment_amount != null
          ? String(delivery.payment_amount)
          : undefined,
    deliveryFeeAmount:
      order.delivery_fee_amount != null
        ? String(order.delivery_fee_amount)
        : delivery.delivery_fee_amount != null
          ? String(delivery.delivery_fee_amount)
          : undefined,
    deliveryStatus: delivery.status || undefined,
    courier,
    createdDatetime: order.created_datetime || undefined,
    finishDatetime: order.finish_datetime || undefined,
    points,
    raw: rawEnvelope || order,
  }
}

/**
 * Verifies webhook signature sent in X-DV-Signature header.
 */
export function verifyBorzoWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader?: string | null
): boolean {
  const secret = borzoCallbackSecret()
  if (!secret) return true // If secret is not configured, pass verification
  if (!signatureHeader) return false
  try {
    const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader.trim()))
  } catch {
    return false
  }
}

/**
 * Maps Borzo order / delivery statuses to Reloved 4-stage tracking status.
 */
export function mapBorzoToRelovedDeliveryStatus(
  orderStatus?: string,
  deliveryStatus?: string
): "rider_dispatched" | "picked_up" | "delivered" | "failed" | null {
  const ds = (deliveryStatus || "").toLowerCase()
  const os = (orderStatus || "").toLowerCase()

  if (os === "canceled" || ds === "canceled") return "failed"
  if (os === "completed" || ds === "finished") return "delivered"
  if (ds === "parcel_picked_up" || ds === "courier_arrived") return "picked_up"
  if (
    ds === "courier_assigned" ||
    ds === "courier_departed" ||
    ds === "courier_at_pickup" ||
    os === "active"
  ) {
    return "rider_dispatched"
  }
  return null
}

export { DEFAULT_TEST_BASE, DEFAULT_PROD_BASE }
