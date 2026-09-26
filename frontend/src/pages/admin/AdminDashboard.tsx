import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { RefreshCw } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import {
  categoryDisplayLabel,
  handoverStageLabel,
  logisticsAdminLabel,
} from "@/lib/adminStatusLabels"
import { formatWallLocality } from "@/lib/formatLocality"

type MsgPreview = {
  id: string
  senderRole: string
  senderName: string
  text: string
  createdAt: string | null
}

type ClaimCard = {
  id: string
  itemId?: string | null
  itemTitle: string | null
  itemImages: { storagePath?: string }[] | string[]
  itemCategory: string | null
  size: string | null
  brand: string | null
  gender: string | null
  giverLogistics: string | null
  handoverStage: string | null
  opsBookingStatus: string | null
  agreedSlotAt: string | null
  proposedSlotAt: string | null
  pickupLocality: string | null
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  note: string | null
  giverName: string | null
  giverPhone: string | null
  pickupAddressConfirmedByGiver: boolean
  dropAddressConfirmedByClaimer: boolean
  unreadChat: boolean
  createdAt: string | null
  recentMessages: MsgPreview[]
  peerMessages: MsgPreview[]
}

type DropCard = {
  id: string
  reference: string | null
  donorFirstName: string | null
  phone: string | null
  pickupLocality: string | null
  giverLogistics: string | null
  status: string | null
  itemTitle: string
  itemImages: { storagePath?: string }[] | string[]
  unreadChat: boolean
  createdAt: string | null
}

type Overview = {
  todayIst: string
  counts: {
    todayDeliveries: number
    matched: number
    pendingClaims: number
    pendingDrops: number
    stuckMatched: number
    wallAvailable?: number
    wallBeingMatched?: number
    wallClaimed?: number
  }
  wallCounts?: { available: number; being_matched: number; claimed: number; other?: number }
  todayDeliveries: ClaimCard[]
  matched: ClaimCard[]
  pendingClaims: ClaimCard[]
  pendingDrops: DropCard[]
  stuckMatched: ClaimCard[]
}

function formatSlot(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
}

function firstImage(images: ClaimCard["itemImages"] | DropCard["itemImages"]): string | null {
  if (!images?.length) return null
  const first = images[0]
  if (typeof first === "string") return first
  return first?.storagePath || null
}

function stageChip(stage: string | null, ops: string | null): { label: string; className: string } {
  const s = String(stage || "").toLowerCase()
  const o = String(ops || "").toLowerCase()
  if (s === "received" || o === "delivered") {
    return { label: "Reloved", className: "bg-accent-green/40" }
  }
  if (s === "schedule_agreed" || o === "ready_to_book") {
    return { label: "Ready to book", className: "bg-accent-yellow" }
  }
  if (s === "awaiting_handover" || o === "booked") {
    return { label: "Booked", className: "bg-accent-blue text-white" }
  }
  if (s === "schedule_proposed") {
    return { label: "Waiting for claimer to confirm", className: "bg-accent-pink/30" }
  }
  return { label: handoverStageLabel(stage), className: "bg-white" }
}

function MessagePreview({ messages, empty }: { messages: MsgPreview[]; empty: string }) {
  if (!messages.length) {
    return <p className="text-xs text-foreground-muted font-medium">{empty}</p>
  }
  return (
    <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
      {messages.map((m) => (
        <li key={m.id} className="text-xs leading-snug border-l-2 border-foreground/20 pl-2">
          <span className="font-black uppercase tracking-widest text-[9px] text-foreground-muted">
            {m.senderName || m.senderRole}
          </span>
          <p className="font-medium text-foreground/90 line-clamp-2">{m.text}</p>
        </li>
      ))}
    </ul>
  )
}

function ClaimOverviewCard({
  claim,
  expanded,
  onToggle,
  highlight,
}: {
  claim: ClaimCard
  expanded: boolean
  onToggle: () => void
  highlight?: "today" | "stuck" | "pending"
}) {
  const chip = stageChip(claim.handoverStage, claim.opsBookingStatus)
  const img = firstImage(claim.itemImages)
  const border =
    highlight === "today"
      ? "border-accent-blue"
      : highlight === "stuck"
        ? "border-accent-yellow"
        : highlight === "pending"
          ? "border-accent-green"
          : "border-foreground"

  return (
    <Card className={`overflow-hidden border-2 ${border}`}>
      <CardContent className="p-4 sm:p-5 flex flex-col gap-3 min-w-0">
        <div className="flex gap-3 sm:gap-4 items-start min-w-0">
          <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 border-2 border-foreground bg-[#f0eee8] overflow-hidden">
            <SafeImage
              src={resolveImageUrl(img)}
              alt={claim.itemTitle || "Item"}
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <p className="font-display font-black uppercase text-base leading-tight break-words">
                {claim.itemTitle || "Item"}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {claim.unreadChat && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-green">
                    Chat
                  </span>
                )}
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground ${chip.className}`}
                >
                  {chip.label}
                </span>
              </div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
              {categoryDisplayLabel(claim.itemCategory)}
              {claim.size ? ` · ${claim.size}` : ""}
              {claim.brand ? ` · ${claim.brand}` : ""}
              {claim.giverLogistics ? ` · ${logisticsAdminLabel(claim.giverLogistics)}` : ""}
            </p>
            <div className="text-sm space-y-0.5">
              <p>
                <span className="font-black uppercase tracking-widest text-[10px] text-foreground-muted mr-1">
                  Dropper
                </span>
                <span className="font-bold">{claim.giverName || "—"}</span>
                <span className="text-foreground-muted"> · {claim.giverPhone || "—"}</span>
              </p>
              <p>
                <span className="font-black uppercase tracking-widest text-[10px] text-foreground-muted mr-1">
                  Claimer
                </span>
                <span className="font-bold">{claim.requesterName || "—"}</span>
                <span className="text-foreground-muted"> · {claim.requesterPhone || "—"}</span>
              </p>
              {claim.pickupLocality && (
                <p className="text-foreground-muted text-xs break-words">
                  <span className="font-black uppercase tracking-widest text-[10px] text-foreground mr-1">
                    Pickup
                  </span>
                  {formatWallLocality(claim.pickupLocality)}
                </p>
              )}
              {claim.requesterAddress && (
                <p className="text-foreground-muted text-xs break-words">
                  <span className="font-black uppercase tracking-widest text-[10px] text-foreground mr-1">
                    Drop
                  </span>
                  {claim.requesterAddress}
                  {claim.note ? ` · ${claim.note}` : ""}
                </p>
              )}
              <p className="text-xs font-medium">
                <span className="font-black uppercase tracking-widest text-[10px] text-foreground-muted mr-1">
                  Slot
                </span>
                {formatSlot(claim.agreedSlotAt || claim.proposedSlotAt)}
                {!claim.agreedSlotAt && claim.proposedSlotAt ? " (proposed)" : ""}
              </p>
            </div>
          </div>
        </div>

        {(claim.peerMessages.length > 0 || claim.recentMessages.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t-2 border-foreground/10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted mb-1">
                Dropper ↔ claimer
              </p>
              <MessagePreview messages={claim.peerMessages} empty="No peer chat yet" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted mb-1">
                Ops ↔ claimer
              </p>
              <MessagePreview messages={claim.recentMessages} empty="No ops chat yet" />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" type="button" onClick={onToggle}>
            {expanded ? "Hide chat" : "Open chat"}
          </Button>
          {String(claim.handoverStage || "") === "schedule_agreed" ||
          String(claim.opsBookingStatus || "") === "ready_to_book" ? (
            <Link to="/admin/orders">
              <Button size="sm" variant="cta" type="button">
                Book on Orders
              </Button>
            </Link>
          ) : (
            <Link to="/admin/item-requests">
              <Button size="sm" variant="ghost" type="button">
                Open in Claims
              </Button>
            </Link>
          )}
        </div>

        {expanded && (
          <div className="pt-2 border-t-2 border-foreground/10">
            <OrderChatThread
              subjectType="claim"
              subjectId={claim.id}
              client="admin"
              hasUnread={claim.unreadChat}
              defaultOpen
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SectionHeader({
  title,
  count,
  hint,
}: {
  title: string
  count: number
  hint: string
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1 mb-3">
      <div>
        <h2 className="text-xl font-display font-black uppercase tracking-tight">
          {title}
          <span className="ml-2 text-foreground-muted tabular-nums">({count})</span>
        </h2>
        <p className="text-xs text-foreground-muted font-medium mt-0.5">{hint}</p>
      </div>
    </div>
  )
}

function istDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function claimFromRequest(r: any): ClaimCard {
  return {
    id: String(r.id),
    itemId: r.itemId || r.item?.id || null,
    itemTitle: r.itemTitle || r.item?.title || null,
    itemImages: r.itemImages || r.item?.images || [],
    itemCategory: r.itemCategory || r.item?.category || null,
    size: r.size || null,
    brand: r.brand || null,
    gender: r.gender || null,
    giverLogistics: r.giverLogistics || null,
    handoverStage: r.handoverStage || null,
    opsBookingStatus: r.opsBookingStatus || null,
    agreedSlotAt: r.agreedSlotAt || null,
    proposedSlotAt: r.proposedSlotAt || null,
    pickupLocality: r.pickupLocality || null,
    requesterName: r.requesterName || null,
    requesterPhone: r.requesterPhone || null,
    requesterAddress: r.requesterAddress || null,
    note: r.note || null,
    giverName: r.giverName || null,
    giverPhone: r.giverPhone || null,
    pickupAddressConfirmedByGiver: Boolean(r.pickupAddressConfirmedByGiver),
    dropAddressConfirmedByClaimer: Boolean(r.dropAddressConfirmedByClaimer),
    unreadChat: Boolean(r.unreadChat),
    createdAt: r.createdAt || null,
    recentMessages: r.recentMessages || [],
    peerMessages: r.peerMessages || [],
  }
}

/** Resolve dropper name/phone via items → submissions (overview/orders often omit these). */
async function enrichGiverDetails(claims: ClaimCard[]): Promise<ClaimCard[]> {
  const need = claims.filter((c) => !c.giverName || !c.giverPhone)
  if (!need.length) return claims

  const [itemsRes, subsRes] = await Promise.all([
    api.admin.get<{ items: any[] }>("/api/admin/items").catch(() => ({ items: [] })),
    api.admin.get<{ submissions: any[] }>("/api/admin/submissions").catch(() => ({ submissions: [] })),
  ])

  const itemById = new Map((itemsRes.items || []).map((i) => [String(i.id), i]))
  const subById = new Map((subsRes.submissions || []).map((s) => [String(s.id), s]))
  // Also index items by title as a weak fallback when claim has no itemId
  const subByItemTitle = new Map<string, any>()
  for (const s of subsRes.submissions || []) {
    const items = Array.isArray(s.items) ? s.items : []
    for (const it of items) {
      const t = String(it.title || it.itemTitle || "").trim().toLowerCase()
      if (t) subByItemTitle.set(t, s)
    }
  }

  return claims.map((c) => {
    if (c.giverName && c.giverPhone) return c
    let giverName = c.giverName
    let giverPhone = c.giverPhone

    const itemId = c.itemId
    const item =
      (itemId && itemById.get(String(itemId))) ||
      [...itemById.values()].find(
        (i) => String(i.title || "").trim().toLowerCase() === String(c.itemTitle || "").trim().toLowerCase()
      )

    if (item) {
      if (!giverName) {
        giverName =
          item.donorRecognition ||
          item.donorFirstName ||
          item.donorName ||
          null
      }
      if (!giverPhone) giverPhone = item.donorPhone || item.phone || null
      const sid = String(item.submissionId || "")
      const sub = sid ? subById.get(sid) : null
      if (sub) {
        if (!giverName) {
          giverName =
            sub.donorFirstName ||
            [sub.donorFirstName, sub.donorLastName].filter(Boolean).join(" ").trim() ||
            null
        }
        if (!giverPhone) giverPhone = sub.phone || null
      }
    }

    if (!giverName || !giverPhone) {
      const sub = subByItemTitle.get(String(c.itemTitle || "").trim().toLowerCase())
      if (sub) {
        if (!giverName) giverName = sub.donorFirstName || null
        if (!giverPhone) giverPhone = sub.phone || null
      }
    }

    return { ...c, giverName: giverName || null, giverPhone: giverPhone || null }
  })
}

/** Fallback when /api/admin/overview is not deployed yet. */
async function loadOverviewFallback(): Promise<Overview> {
  const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
  const [pendingRes, approvedRes, subsRes, ordersRes] = await Promise.all([
    api.admin.get<{ requests: any[] }>("/api/admin/item-requests?status=pending").catch(() => ({ requests: [] })),
    api.admin.get<{ requests: any[] }>("/api/admin/item-requests?status=approved").catch(() => ({ requests: [] })),
    api.admin.get<{ submissions: any[] }>("/api/admin/submissions").catch(() => ({ submissions: [] })),
    api.admin.get<{ orders: any[] }>("/api/admin/orders").catch(() => ({ orders: [] })),
  ])

  const orderById = new Map((ordersRes.orders || []).map((o) => [o.id, o]))
  const approved = (approvedRes.requests || []).map((r) => {
    const o = orderById.get(r.id)
    return claimFromRequest({
      ...r,
      giverName: o?.giverName ?? r.giverName,
      giverPhone: o?.giverPhone ?? r.giverPhone,
      agreedSlotAt: o?.agreedSlotAt ?? r.agreedSlotAt,
      opsBookingStatus: o?.opsBookingStatus ?? r.opsBookingStatus,
    })
  })

  const todayDeliveries = approved.filter((c) => {
    if (String(c.handoverStage || "") === "received") return false
    return istDayKey(c.agreedSlotAt || c.proposedSlotAt) === todayIst
  })
  const matched = approved.filter((c) => {
    if (String(c.handoverStage || "") === "received") return false
    return istDayKey(c.agreedSlotAt || c.proposedSlotAt) !== todayIst
  })
  const stuckMatched = approved.filter((c) => STUCK.has(String(c.handoverStage || "")))
  const pendingClaims = (pendingRes.requests || []).map(claimFromRequest)
  const pendingDrops = (subsRes.submissions || [])
    .filter((s) =>
      ["submitted", "pending_review", "pending", "under_review"].includes(String(s.status || ""))
    )
    .map((s) => {
      const items = Array.isArray(s.items) ? s.items : []
      const first = items[0] || {}
      return {
        id: String(s.id),
        reference: s.reference || null,
        donorFirstName: s.donorFirstName || null,
        phone: s.phone || null,
        pickupLocality: s.pickupLocality || s.locality || null,
        giverLogistics: s.giverLogistics || null,
        status: s.status || null,
        itemTitle: first.title || first.itemTitle || s.itemTitle || "Drop",
        itemImages: first.images || s.images || [],
        unreadChat: Boolean(s.unreadChat),
        createdAt: s.createdAt || s.submittedAt || null,
      } as DropCard
    })
    .slice(0, 30)

  const wallRes = await api.admin.get<{ items: any[] }>("/api/admin/items").catch(() => ({ items: [] }))
  const wallCounts = { available: 0, being_matched: 0, claimed: 0, other: 0 }
  for (const i of wallRes.items || []) {
    if (i.publicVisibility === false) continue
    const ps = String(i.publicStatus || "")
    if (ps === "available") wallCounts.available++
    else if (ps === "being_matched") wallCounts.being_matched++
    else if (ps === "claimed") wallCounts.claimed++
    else if (ps !== "reloved" && ps !== "withdrawn") wallCounts.other++
  }

  return {
    todayIst,
    counts: {
      todayDeliveries: todayDeliveries.length,
      matched: matched.length,
      pendingClaims: pendingClaims.length,
      pendingDrops: pendingDrops.length,
      stuckMatched: stuckMatched.length,
      wallAvailable: wallCounts.available,
      wallBeingMatched: wallCounts.being_matched,
      wallClaimed: wallCounts.claimed,
    },
    wallCounts,
    todayDeliveries: await enrichGiverDetails(todayDeliveries),
    matched: await enrichGiverDetails(matched),
    pendingClaims: await enrichGiverDetails(pendingClaims),
    pendingDrops,
    stuckMatched: await enrichGiverDetails(stuckMatched),
  }
}

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.admin.get<Overview>("/api/admin/overview")
      const enriched: Overview = {
        ...res,
        todayDeliveries: await enrichGiverDetails(res.todayDeliveries || []),
        matched: await enrichGiverDetails(res.matched || []),
        pendingClaims: await enrichGiverDetails(res.pendingClaims || []),
        stuckMatched: await enrichGiverDetails(res.stuckMatched || []),
      }
      setData(enriched)
    } catch {
      try {
        const fallback = await loadOverviewFallback()
        setData(fallback)
      } catch (err: any) {
        setError(err?.message || "Couldn't load overview")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  async function syncWallStatuses() {
    setSyncNote(null)
    try {
      const res = await api.admin.post<{ updated: number; changes: unknown[] }>(
        "/api/admin/sync-wall-statuses",
        {}
      )
      setSyncNote(
        res.updated
          ? `Synced ${res.updated} Wall status${res.updated === 1 ? "" : "es"} from claims.`
          : "Wall statuses already match claims."
      )
      await load()
    } catch (err: any) {
      setSyncNote(err?.message || "Couldn't sync Wall statuses (deploy Functions if 404).")
    }
  }

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 30000)
    return () => window.clearInterval(id)
  }, [load])

  const counts = data?.counts
  const todayList = data?.todayDeliveries || []
  const matchedAll = data?.matched || []
  const todayIst = data?.todayIst || ""

  /** When nothing is due today, surface soonest upcoming slots instead of an empty box. */
  const upcomingFromMatched = [...matchedAll]
    .filter((c) => {
      const day = istDayKey(c.agreedSlotAt || c.proposedSlotAt)
      return !!day && !!todayIst && day > todayIst
    })
    .sort((a, b) =>
      String(a.agreedSlotAt || a.proposedSlotAt || "").localeCompare(
        String(b.agreedSlotAt || b.proposedSlotAt || "")
      )
    )

  const showingUpcoming = todayList.length === 0 && upcomingFromMatched.length > 0
  const deliveryBoard = todayList.length > 0 ? todayList : upcomingFromMatched
  const deliveryBoardIds = new Set(deliveryBoard.map((c) => c.id))
  const matchedRest = showingUpcoming
    ? matchedAll.filter((c) => !deliveryBoardIds.has(c.id))
    : matchedAll

  return (
    <div className="flex flex-col gap-10 max-w-5xl mx-auto w-full min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Overview</h1>
          <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
            Ops board for today&apos;s deliveries, active matches, and items waiting on someone.
            {data?.todayIst ? (
              <span className="block mt-1 text-xs font-bold uppercase tracking-widest">
                Today · {data.todayIst} IST
              </span>
            ) : null}
          </p>
        </div>
        <Button size="sm" variant="outline" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="border-2 border-foreground bg-accent-red/20 px-4 py-3 text-sm font-medium">{error}</div>
      )}
      {syncNote && (
        <div className="border-2 border-foreground bg-accent-yellow/30 px-4 py-3 text-sm font-medium">{syncNote}</div>
      )}

      {loading && !data ? (
        <p className="text-foreground-muted">Loading overview…</p>
      ) : (
        <>
          <section className="border-2 border-foreground bg-white p-4 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <div>
                <h2 className="text-lg font-display font-black uppercase tracking-tight">Wall snapshot</h2>
                <p className="text-xs text-foreground-muted font-medium">
                  Live listings: Available · Being Matched · Claimed (still on Wall until Reloved).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" type="button" onClick={() => void syncWallStatuses()}>
                  Sync statuses from claims
                </Button>
                <Link to="/admin/items">
                  <Button size="sm" variant="ghost" type="button">
                    Open Wall items
                  </Button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="border-2 border-foreground px-3 py-2 bg-white">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Available</p>
                <p className="text-2xl font-display font-black tabular-nums">
                  {data?.wallCounts?.available ?? counts?.wallAvailable ?? "—"}
                </p>
              </div>
              <div className="border-2 border-foreground px-3 py-2 bg-accent-yellow/40">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Being matched</p>
                <p className="text-2xl font-display font-black tabular-nums">
                  {data?.wallCounts?.being_matched ?? counts?.wallBeingMatched ?? "—"}
                </p>
              </div>
              <div className="border-2 border-foreground px-3 py-2 bg-accent-pink/30">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Claimed</p>
                <p className="text-2xl font-display font-black tabular-nums">
                  {data?.wallCounts?.claimed ?? counts?.wallClaimed ?? "—"}
                </p>
              </div>
            </div>
          </section>

          <section>
            <SectionHeader
              title={showingUpcoming ? "Upcoming deliveries" : "Deliveries today"}
              count={deliveryBoard.length}
              hint={
                showingUpcoming
                  ? "Nothing scheduled for today — next agreed / proposed slots (soonest first). Book from Orders when time is locked."
                  : "Agreed or proposed slot falls on today — book Porter / courier from Orders when time is locked."
              }
            />
            {deliveryBoard.length === 0 ? (
              <p className="text-sm text-foreground-muted font-medium border-2 border-dashed border-foreground/20 px-4 py-6">
                No deliveries scheduled for today, and no upcoming slots yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {deliveryBoard.map((c) => (
                  <ClaimOverviewCard
                    key={c.id}
                    claim={c}
                    highlight="today"
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader
              title="Matched orders"
              count={matchedRest.length}
              hint={
                showingUpcoming
                  ? "Other active matches (no future slot, or still waiting on addresses / confirm)."
                  : "Active matches (not delivering today). Stage chip shows where dropper / claimer are in the flow."
              }
            />
            {matchedRest.length === 0 ? (
              <p className="text-sm text-foreground-muted font-medium border-2 border-dashed border-foreground/20 px-4 py-6">
                No other active matches.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {matchedRest.map((c) => (
                  <ClaimOverviewCard
                    key={c.id}
                    claim={c}
                    expanded={expandedId === c.id}
                    onToggle={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <SectionHeader
              title="Needs attention"
              count={(counts?.pendingDrops || 0) + (counts?.pendingClaims || 0)}
              hint="New drops to approve and new claims to decide. Stuck matches stay under Matched with a stage chip + chat."
            />

            {(data?.pendingDrops || []).length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-2">
                  New drops · {data!.pendingDrops.length}
                </h3>
                <div className="flex flex-col gap-2">
                  {data!.pendingDrops.map((d) => (
                    <Link
                      key={d.id}
                      to="/admin/donations"
                      className="block border-2 border-foreground bg-white p-3 shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                    >
                      <div className="flex gap-3 items-center min-w-0">
                        <div className="w-14 h-14 shrink-0 border-2 border-foreground bg-[#f0eee8] overflow-hidden">
                          <SafeImage
                            src={resolveImageUrl(firstImage(d.itemImages))}
                            alt={d.itemTitle}
                            className="w-full h-full object-contain p-0.5"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-display font-black uppercase text-sm truncate">{d.itemTitle}</p>
                          <p className="text-xs text-foreground-muted">
                            {d.donorFirstName || "Dropper"} · {d.phone || "—"}
                            {d.pickupLocality ? ` · ${formatWallLocality(String(d.pickupLocality))}` : ""}
                          </p>
                          {d.unreadChat && (
                            <span className="inline-block mt-1 text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-foreground bg-accent-green">
                              Unread chat
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest shrink-0">Approve →</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(data?.pendingClaims || []).length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-2">
                  New claims · {data!.pendingClaims.length}
                </h3>
                <div className="flex flex-col gap-3">
                  {data!.pendingClaims.map((c) => (
                    <ClaimOverviewCard
                      key={c.id}
                      claim={c}
                      highlight="pending"
                      expanded={expandedId === c.id}
                      onToggle={() => setExpandedId((cur) => (cur === c.id ? null : c.id))}
                    />
                  ))}
                </div>
              </div>
            )}

            {(counts?.stuckMatched || 0) > 0 && (
              <p className="text-xs text-foreground-muted font-medium border-2 border-foreground/15 bg-accent-yellow/20 px-3 py-2">
                {counts!.stuckMatched} matched order{counts!.stuckMatched === 1 ? "" : "s"} still waiting on
                addresses or a time confirm — see stage chips under Matched above (open chat to nudge).
              </p>
            )}

            {!counts?.pendingDrops && !counts?.pendingClaims ? (
              <p className="text-sm text-foreground-muted font-medium border-2 border-dashed border-foreground/20 px-4 py-6">
                No new drops or claims waiting.
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}
