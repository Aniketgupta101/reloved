/**
 * Morning ops digest — today's scheduled deliveries (IST calendar day).
 * Same slot filter as admin /overview "todayDeliveries".
 */
import { collections, getDb } from "./firestore"
import { sendOpsDailyDeliveriesReminder } from "./notifications"

export type TodayDeliveryRow = {
  id: string
  itemTitle: string
  slotLabel: string
  giverName: string
  claimerName: string
  area: string
  statusLabel: string
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    try {
      return (value as { toDate: () => Date }).toDate()
    } catch {
      return null
    }
  }
  return null
}

function istDayKey(value: unknown): string | null {
  const d = toDate(value)
  if (!d) return null
  try {
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function todayIstKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
}

function formatSlotLabel(slot: unknown): string {
  const d = toDate(slot)
  if (!d) return "Time TBC"
  try {
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
  } catch {
    return d.toISOString()
  }
}

function statusLabel(stage: string, ops: string): string {
  if (ops) return ops.replace(/_/g, " ")
  if (stage) return stage.replace(/_/g, " ")
  return "scheduled"
}

async function resolveGiverName(
  db: ReturnType<typeof getDb>,
  itemId: string
): Promise<{ giverName: string; area: string }> {
  if (!itemId) return { giverName: "Giver", area: "—" }
  try {
    const itemSnap = await db.collection(collections.items).doc(itemId).get()
    const item = itemSnap.data() || {}
    const area = String(item.publicArea || item.locality || "—").trim() || "—"
    const donorId = String(item.donorId || item.giverId || "").trim()
    if (donorId) {
      const profile = await db.collection(collections.donorProfiles).doc(donorId).get()
      const p = profile.data() || {}
      const name =
        String(p.displayName || p.firstName || p.name || "").trim() ||
        String(item.donorName || item.giverName || "Giver").trim()
      return { giverName: name || "Giver", area }
    }
    return {
      giverName: String(item.donorName || item.giverName || "Giver").trim() || "Giver",
      area,
    }
  } catch {
    return { giverName: "Giver", area: "—" }
  }
}

/** Approved claims whose agreed/proposed slot falls on today's IST calendar day. */
export async function listTodayDeliveries(): Promise<TodayDeliveryRow[]> {
  const db = getDb()
  const todayIst = todayIstKey()
  const snap = await db
    .collection(collections.itemRequests)
    .where("status", "==", "approved")
    .get()

  const candidates = snap.docs.filter((d) => {
    const data = d.data()
    const stage = String(data.handoverStage || "")
    const ops = String(data.opsBookingStatus || "")
    if (stage === "received" || ops === "delivered") return false
    const slot = data.agreedSlotAt || data.proposedSlotAt
    return istDayKey(slot) === todayIst
  })

  const rows: TodayDeliveryRow[] = []
  for (const doc of candidates) {
    const data = doc.data()
    const itemId = data.itemId ? String(data.itemId) : ""
    const { giverName, area } = await resolveGiverName(db, itemId)
    const slot = data.agreedSlotAt || data.proposedSlotAt
    rows.push({
      id: doc.id,
      itemTitle: String(data.itemTitle || "Item").trim() || "Item",
      slotLabel: formatSlotLabel(slot),
      giverName,
      claimerName: String(data.requesterName || "Claimer").trim() || "Claimer",
      area: String(data.pickupLocality || area || "—").trim() || "—",
      statusLabel: statusLabel(String(data.handoverStage || ""), String(data.opsBookingStatus || "")),
    })
  }

  rows.sort((a, b) => a.slotLabel.localeCompare(b.slotLabel))
  return rows
}

export function dateLabelIst(d = new Date()): string {
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/**
 * Send the morning digest when there is at least one delivery today.
 * Returns how many were emailed (0 if skipped / none).
 */
export async function runOpsDailyDeliveriesReminder(opts?: {
  /** Force send even when count is 0 (for tests). */
  force?: boolean
  recipients?: string[]
}): Promise<{ sent: boolean; count: number; reason?: string }> {
  const { opsDailyDeliveriesRecipients } = await import("./notifications")
  const recipients = opts?.recipients?.length ? opts.recipients : opsDailyDeliveriesRecipients()
  if (!recipients.length && !opts?.force) {
    console.log("opsDailyDeliveriesReminder: no recipients configured in OPS_DAILY_DELIVERIES_EMAILS — skip")
    return { sent: false, count: 0, reason: "no_recipients" }
  }

  const deliveries = await listTodayDeliveries()
  const count = deliveries.length
  if (!count && !opts?.force) {
    console.log("opsDailyDeliveriesReminder: no deliveries today — skip")
    return { sent: false, count: 0, reason: "no_deliveries" }
  }

  await sendOpsDailyDeliveriesReminder({
    dateLabel: dateLabelIst(),
    deliveries,
    recipients,
  })

  console.log(`opsDailyDeliveriesReminder: sent for ${count} delivery(ies) to ${recipients.join(", ")}`)
  return { sent: true, count }
}
