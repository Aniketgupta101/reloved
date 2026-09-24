/**
 * Collapse lifecycle alerts so one claim/drop shows a single card with the latest step.
 */

export type CollapsibleNotification = {
  id: string
  role: string
  type: string
  title: string
  body: string
  href: string
  itemTitle?: string | null
  requestId?: string | null
  read: boolean
  createdAt: string
}

/** Higher = later in the handover lifecycle (wins when collapsing). */
const TYPE_RANK: Record<string, number> = {
  item_dropped: 5,
  claim_sent: 10,
  item_claimed: 15,
  claim_accepted: 30,
  claim_declined: 95,
  address_shared: 40,
  address_confirmed: 45,
  schedule_proposed: 50,
  schedule_reschedule: 52,
  schedule_agreed: 60,
  handed_over: 70,
  received: 80,
  new_message: 25,
}

function rank(type: string): number {
  return TYPE_RANK[String(type || "").toLowerCase()] ?? 0
}

function groupKey(n: CollapsibleNotification): string {
  const requestId = String(n.requestId || "").trim()
  if (requestId) return `claim:${n.role}:${requestId}`

  // Drop live alerts: group by gift href so re-drops don't spam.
  const href = String(n.href || "")
  const gift = href.match(/\/account\/gifts\/([^/?#]+)/)
  if (gift && n.type === "item_dropped") return `drop:${n.role}:${gift[1]}`

  return `solo:${n.id}`
}

/**
 * Keep one card per claim/drop thread — the furthest step — and mark unread if any
 * step in the group was unread.
 */
export function collapseNotificationsByTransaction<T extends CollapsibleNotification>(
  list: T[],
): T[] {
  const groups = new Map<string, T[]>()
  for (const n of list) {
    const key = groupKey(n)
    const bucket = groups.get(key) || []
    bucket.push(n)
    groups.set(key, bucket)
  }

  const collapsed: T[] = []
  for (const [, bucket] of groups) {
    if (bucket.length === 1) {
      collapsed.push(bucket[0])
      continue
    }
    bucket.sort((a, b) => {
      const rd = rank(b.type) - rank(a.type)
      if (rd !== 0) return rd
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    })
    const latest = { ...bucket[0] }
    latest.read = bucket.every((n) => n.read)
    // Prefer a real Firestore id over live-* for mark-read.
    const persisted = bucket.find((n) => !String(n.id).startsWith("live-"))
    if (persisted && String(latest.id).startsWith("live-")) {
      latest.id = persisted.id
    }
    collapsed.push(latest)
  }

  collapsed.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
  return collapsed
}
