import { useEffect, useState } from "react"
import { Bike, ExternalLink, RefreshCw } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import {
  copyShiprocketBooking,
  // openBorzo,
  // openPorter,
  openMapsForBuilding,
} from "@/lib/logisticsLinks"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import { claimRequestStatusLabel, categoryDisplayLabel, handoverStageLabel, logisticsAdminLabel } from "@/lib/adminStatusLabels"
import { formatWallLocality } from "@/lib/formatLocality"
import { usesExternalCourier } from "@shared/taxonomy"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"

interface ItemRequest {
  id: string
  requesterTarget: string
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  note: string | null
  photoStoragePath: string | null
  status: string
  giverLogistics?: string | null
  handoverStage?: string | null
  pickupLocality?: string | null
  deliveryStatus?: "awaiting_pickup" | "rider_dispatched" | "picked_up" | "delivered" | "failed"
  borzoOrderId?: number | null
  borzoOrderName?: string | null
  borzoStatus?: string | null
  borzoDeliveryStatus?: string | null
  borzoTrackingUrl?: string | null
  borzoDeliveryFee?: string | number | null
  borzoPaidBy?: "reloved_subsidy" | "receiver" | null
  borzoSubsidyIndex?: number | null
  borzoCourier?: {
    courierId?: number
    name?: string
    surname?: string
    phone?: string
    photoUrl?: string
  } | null
  createdAt: string
  unreadChat?: boolean
  item: {
    id: string
    title: string
    category?: string | null
    images: { storagePath: string }[]
  }
}

const TABS = ["pending", "approved", "rejected"] as const

export function AdminItemRequests() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending")
  const [requests, setRequests] = useState<ItemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [maskingReady, setMaskingReady] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [borzoReady, setBorzoReady] = useState<{
    configured: boolean
    isProduction?: boolean
    opsPhone?: string | null
    error?: string
    subsidy?: {
      limit: number
      usedCount: number
      remaining: number
      exhausted: boolean
      nextCoveredByReloved: boolean
    }
    subsidyCopy?: { headline: string; detail: string; payerLabel: string }
  } | null>(null)
  const [shiprocketReady, setShiprocketReady] = useState<{
    configured: boolean
    walletBalance?: number
    walletReady?: boolean
    message?: string
    error?: string
  } | null>(null)
  const [shadowfaxReady, setShadowfaxReady] = useState<{
    configured: boolean
    baseUrl?: string
    message?: string
  } | null>(null)
  const [estimates, setEstimates] = useState<
    Record<string, { fee: string; pickup: string; drop: string; subsidyLabel?: string }>
  >({})
  const [estimatingId, setEstimatingId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  async function load(status: string) {
    setLoading(true)
    try {
      const { requests } = await api.admin.get<{ requests: ItemRequest[] }>(`/api/admin/item-requests?status=${status}`)
      setRequests(requests)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load(tab) }, [tab])

  useEffect(() => {
    api.admin
      .get<{ configured: boolean }>("/api/admin/calls/masking-status")
      .then((s) => setMaskingReady(!!s.configured))
      .catch(() => setMaskingReady(false))

    api.admin
      .get<{
        configured: boolean
        isProduction?: boolean
        opsPhone?: string | null
        error?: string
        subsidy?: {
          limit: number
          usedCount: number
          remaining: number
          exhausted: boolean
          nextCoveredByReloved: boolean
        }
        subsidyCopy?: { headline: string; detail: string; payerLabel: string }
      }>("/api/admin/borzo/status")
      .then((s) => setBorzoReady(s))
      .catch(() => setBorzoReady({ configured: false }))

    api.admin
      .get<{
        configured: boolean
        walletBalance?: number
        walletReady?: boolean
        message?: string
        error?: string
      }>("/api/admin/shiprocket/status")
      .then((s) => setShiprocketReady(s))
      .catch(() => setShiprocketReady({ configured: false }))

    api.admin
      .get<{ configured: boolean; baseUrl?: string; message?: string }>("/api/admin/shadowfax/status")
      .then((s) => setShadowfaxReady(s))
      .catch(() => setShadowfaxReady({ configured: false }))
  }, [])

  async function estimateShiprocketFee(r: ItemRequest) {
    setEstimatingId(r.id)
    try {
      const res = await api.admin.post<{
        ok: boolean
        paymentAmount: string | null
        pickupAddress: string
        dropAddress: string
        courierName?: string | null
        etd?: string | null
        subsidyCopy?: { headline: string; detail: string }
      }>(`/api/admin/item-requests/${r.id}/shiprocket/estimate`)
      const fee = res.paymentAmount || "—"
      setEstimates((prev) => ({
        ...prev,
        [r.id]: {
          fee: `₹${fee}${res.courierName ? ` · ${res.courierName}` : ""}`,
          pickup: res.pickupAddress,
          drop: res.dropAddress,
          subsidyLabel: res.subsidyCopy?.headline,
        },
      }))
    } catch (err: any) {
      setNotice({ title: "Estimate failed", body: err?.message || "Failed to estimate Shiprocket fee", tone: "error" })
    } finally {
      setEstimatingId(null)
    }
  }

  function bookShiprocket(r: ItemRequest) {
    const covered = borzoReady?.subsidy?.nextCoveredByReloved !== false && !borzoReady?.subsidy?.exhausted
    const payLine = covered
      ? "Reloved pays (prepaid wallet — first 500)."
      : "First-500 used — claimer pays COD to the courier at delivery."
    const walletHint = shiprocketReady?.walletReady
      ? `Wallet ₹${shiprocketReady.walletBalance ?? "?"}.`
      : `Wallet ₹${shiprocketReady?.walletBalance ?? 0} — need ≥ ₹100 for prepaid AWB.`
    setNotice({
      title: "Book Shiprocket?",
      body: `Create Shiprocket order for "${r.item.title}"?\n\n${payLine}\n${walletHint}\nAddresses need 6-digit pincodes.`,
      tone: "warn",
      primaryLabel: "Confirm book",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runBookShiprocket(r),
    })
  }

  async function runBookShiprocket(r: ItemRequest) {
    setBookingId(r.id)
    setNotice(null)
    try {
      const res = await api.admin.post<{
        ok: boolean
        assigned?: boolean
        assignError?: string | null
        message?: string
        paymentMethod?: string
        order?: { orderId?: number; awbCode?: string | null; trackingUrl?: string | null }
        borzoPaidBy?: string
        subsidy?: { usedCount: number; limit: number }
      }>(`/api/admin/item-requests/${r.id}/shiprocket/book`)
      const pay =
        res.paymentMethod === "COD" || res.borzoPaidBy === "receiver"
          ? "Claimer pays COD at delivery."
          : `Reloved cover #${res.subsidy?.usedCount || "?"}/${res.subsidy?.limit || 500}.`
      setNotice({
        title: res.assigned ? "Shiprocket booked" : "Order created — AWB pending",
        body: `${res.message || ""}\nOrder #${res.order?.orderId || "?"}${res.order?.awbCode ? ` · AWB ${res.order.awbCode}` : ""}.\n${pay}`,
        tone: res.assigned ? "ok" : "warn",
      })
      await load(tab)
      api.admin
        .get<NonNullable<typeof shiprocketReady>>("/api/admin/shiprocket/status")
        .then((s) => setShiprocketReady(s))
        .catch(() => {})
    } catch (err: any) {
      setNotice({
        title: "Shiprocket book failed",
        body: err?.message || "Couldn't book Shiprocket",
        tone: "error",
      })
    } finally {
      setBookingId(null)
    }
  }

  function bookShadowfax(r: ItemRequest) {
    const covered = borzoReady?.subsidy?.nextCoveredByReloved !== false && !borzoReady?.subsidy?.exhausted
    const payLine = covered
      ? "Reloved pays (first 500 prepaid)."
      : "First-500 used — claimer pays COD at delivery."
    setNotice({
      title: "Book Shadowfax?",
      body: `Local A/B — create Shadowfax order for "${r.item.title}"?\n\n${payLine}\nAddresses need 6-digit pincodes.`,
      tone: "warn",
      primaryLabel: "Confirm book",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runBookShadowfax(r),
    })
  }

  async function runBookShadowfax(r: ItemRequest) {
    setBookingId(r.id)
    setNotice(null)
    try {
      const res = await api.admin.post<{
        ok: boolean
        assigned?: boolean
        message?: string
        paymentMethod?: string
        order?: { orderId?: string; awbCode?: string | null; trackingUrl?: string | null }
        borzoPaidBy?: string
        subsidy?: { usedCount: number; limit: number }
      }>(`/api/admin/item-requests/${r.id}/shadowfax/book`)
      const pay =
        res.paymentMethod === "COD" || res.borzoPaidBy === "receiver"
          ? "Claimer pays COD at delivery."
          : `Reloved cover #${res.subsidy?.usedCount || "?"}/${res.subsidy?.limit || 500}.`
      setNotice({
        title: res.assigned ? "Shadowfax booked" : "Order created — AWB pending",
        body: `${res.message || ""}\nOrder #${res.order?.orderId || "?"}${res.order?.awbCode ? ` · AWB ${res.order.awbCode}` : ""}.\n${pay}`,
        tone: res.assigned ? "ok" : "warn",
      })
      await load(tab)
    } catch (err: any) {
      setNotice({
        title: "Shadowfax book failed",
        body: err?.message || "Couldn't book Shadowfax",
        tone: "error",
      })
    } finally {
      setBookingId(null)
    }
  }

  async function estimateBorzoFee(r: ItemRequest) {
    setEstimatingId(r.id)
    try {
      const res = await api.admin.post<{
        ok: boolean
        paymentAmount: string | null
        deliveryFeeAmount: string | null
        pickupAddress: string
        dropAddress: string
        subsidyCopy?: { headline: string; detail: string }
      }>(`/api/admin/item-requests/${r.id}/borzo/estimate`)
      const fee = res.paymentAmount || res.deliveryFeeAmount || "Calculated"
      setEstimates((prev) => ({
        ...prev,
        [r.id]: {
          fee: `₹${fee}`,
          pickup: res.pickupAddress,
          drop: res.dropAddress,
          subsidyLabel: res.subsidyCopy?.headline,
        },
      }))
    } catch (err: any) {
      setNotice({ title: "Estimate failed", body: err?.message || "Failed to estimate Borzo fee", tone: "error" })
    } finally {
      setEstimatingId(null)
    }
  }

  function bookBorzo(r: ItemRequest) {
    const coverHint = borzoReady?.subsidy?.nextCoveredByReloved
      ? `Reloved covers this ride (first-500: ${borzoReady.subsidy.usedCount}/${borzoReady.subsidy.limit} used).`
      : "First-500 cover used — mark as receiver reimburses Reloved (still prepaid, no COD)."
    setNotice({
      title: "Book Borzo?",
      body: `Book Borzo for "${r.item.title}"?\n\nGate → gate with Reloved ops phone.\n${coverHint}`,
      tone: "warn",
      primaryLabel: "Confirm book",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runBookBorzo(r),
    })
  }

  async function runBookBorzo(r: ItemRequest) {
    setBookingId(r.id)
    try {
      const res = await api.admin.post<{
        ok: boolean
        order: any
        request: any
        borzoPaidBy?: string
        subsidy?: { usedCount: number; limit: number }
      }>(`/api/admin/item-requests/${r.id}/borzo/book`)
      const pay =
        res.borzoPaidBy === "reloved_subsidy"
          ? `Reloved cover #${res.subsidy?.usedCount || "?"}/${res.subsidy?.limit || 500}.`
          : "Receiver reimburses Reloved (first-500 used)."
      setNotice({
        title: "Borzo booked",
        body: `Order #${res.order?.orderName || res.order?.orderId} created. ${pay}`,
        tone: "ok",
      })
      await load(tab)
      api.admin
        .get<NonNullable<typeof borzoReady>>("/api/admin/borzo/status")
        .then((s) => setBorzoReady(s))
        .catch(() => {})
    } catch (err: any) {
      setNotice({ title: "Booking failed", body: err?.message || "Failed to book Borzo order", tone: "error" })
    } finally {
      setBookingId(null)
    }
  }

  async function syncBorzo(r: ItemRequest) {
    setSyncingId(r.id)
    try {
      await api.admin.post<{ ok: boolean; order: any; request: any }>(
        `/api/admin/item-requests/${r.id}/borzo/sync`
      )
      await load(tab)
    } catch (err: any) {
      setNotice({ title: "Sync failed", body: err?.message || "Failed to sync Borzo order", tone: "error" })
    } finally {
      setSyncingId(null)
    }
  }

  function cancelBorzo(r: ItemRequest) {
    setNotice({
      title: "Cancel Borzo order?",
      body: `Cancel Borzo order #${r.borzoOrderName || r.borzoOrderId}?`,
      tone: "warn",
      primaryLabel: "Cancel order",
      secondaryLabel: "Keep",
      onSecondary: () => setNotice(null),
      onPrimary: () => void runCancelBorzo(r),
    })
  }

  async function runCancelBorzo(r: ItemRequest) {
    setActingOn(r.id)
    try {
      await api.admin.post(`/api/admin/item-requests/${r.id}/borzo/cancel`)
      setNotice({ title: "Canceled", body: "Borzo order canceled.", tone: "ok" })
      await load(tab)
    } catch (err: any) {
      setNotice({ title: "Cancel failed", body: err?.message || "Failed to cancel Borzo order", tone: "error" })
    } finally {
      setActingOn(null)
    }
  }

  async function callMasked(
    r: ItemRequest,
    mode: "courier_to_claimer" | "courier_to_giver" | "claimer_to_giver" | "ops_to_claimer" | "ops_to_giver",
  ) {
    setCallingId(`${r.id}:${mode}`)
    try {
      const res = await api.admin.post<{ message?: string; error?: string }>("/api/admin/calls/mask", {
        subjectType: "claim",
        subjectId: r.id,
        mode,
      })
      setNotice({
        title: "Masked call",
        body: res.message || "Masked call started — first party rings first (ops is not called).",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({
        title: "Call failed",
        body: err?.message || "Masked call failed. Is Edesy configured?",
        tone: "error",
      })
    }
    setCallingId(null)
  }
  async function decide(id: string, status: "approved" | "rejected") {
    if (status === "rejected") {
      setNotice({
        title: "Couldn't match?",
        body: "This soft-declines the claimer (never says rejected) and puts the item back on the Wall. Prefer letting the giver Decline from Account when they're online.",
        tone: "warn",
        primaryLabel: "Couldn't match",
        secondaryLabel: "Cancel",
        onSecondary: () => setNotice(null),
        onPrimary: () => {
          setNotice(null)
          void (async () => {
            setActingOn(id)
            try {
              await api.admin.patch(`/api/admin/item-requests/${id}`, { status: "rejected" })
              await load(tab)
            } catch (err) {
              console.error(err)
            }
            setActingOn(null)
          })()
        },
      })
      return
    }
    setActingOn(id)
    try {
      await api.admin.patch(`/api/admin/item-requests/${id}`, { status })
      await load(tab)
    } catch (err) {
      console.error(err)
    }
    setActingOn(null)
  }

  async function setDelivery(id: string, deliveryStatus: "rider_dispatched" | "picked_up" | "delivered" | "failed", audience?: "giver" | "claimer") {
    setActingOn(id)
    try {
      await api.admin.patch(`/api/admin/item-requests/${id}/delivery`, { deliveryStatus, audience })
      await load(tab)
    } catch (err: any) {
      setNotice({
        title: "Update failed",
        body: err?.message || "Couldn't update delivery status",
        tone: "error",
      })
    }
    setActingOn(null)
  }

  async function copyForOps(r: ItemRequest) {
    await copyShiprocketBooking({
      pickupBuilding: r.pickupLocality || "",
      dropBuilding: r.requesterAddress || "",
      itemTitle: r.item.title,
      reference: `claim:${r.id.slice(0, 8)}`,
      opsNote: [
        r.note?.trim() ? `Note: ${r.note.trim()}` : null,
        "Ops books Shiprocket Quick manually (copy pickup + drop). Ops phone only — not personal numbers.",
      ]
        .filter(Boolean)
        .join(" · "),
    })
    setCopiedId(r.id)
    window.setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 2000)
  }

  async function markRelovedPaid(r: ItemRequest, carrier: "shiprocket" | "borzo" | "porter" = "shiprocket") {
    setActingOn(r.id)
    try {
      const res = await api.admin.post<{
        ok: boolean
        borzoPaidBy?: string
        subsidy?: { usedCount: number; limit: number }
        alreadyMarked?: boolean
      }>(`/api/admin/item-requests/${r.id}/courier/mark-reloved-paid`, { carrier })
      setNotice({
        title: res.alreadyMarked ? "Already marked" : "Reloved paid",
        body:
          res.borzoPaidBy === "reloved_subsidy"
            ? `Counted toward first-500 (${res.subsidy?.usedCount ?? "?"}/${res.subsidy?.limit ?? 500}). Pay in Shiprocket with company prepaid — no COD.`
            : "First-500 used — mark as receiver reimburses Reloved offline. Still prepaid, no COD.",
        tone: res.borzoPaidBy === "reloved_subsidy" ? "ok" : "warn",
      })
      await load(tab)
      api.admin
        .get<NonNullable<typeof borzoReady>>("/api/admin/borzo/status")
        .then((s) => setBorzoReady(s))
        .catch(() => {})
    } catch (err: any) {
      setNotice({
        title: "Couldn't mark paid",
        body: err?.message || "Failed to mark Reloved paid",
        tone: "error",
      })
    } finally {
      setActingOn(null)
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full min-w-0">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Claims</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
          Wall claims: Pending → Matched (addresses + schedule) → Reloved. Book Porter from{" "}
          <a href="/admin/orders" className="underline font-bold">
            Orders
          </a>{" "}
          after time is agreed. Legacy Shiprocket/Borzo API tools are under Advanced below each matched claim.
        </p>
        <details className="mt-3 max-w-2xl text-sm text-foreground/90">
          <summary className="cursor-pointer font-black uppercase tracking-widest text-[11px] text-foreground-muted hover:text-foreground">
            Ops checklist
          </summary>
          <ol className="mt-2 list-decimal pl-5 font-medium space-y-1">
            <li>
              <strong>Pending</strong> — Accept or soft-decline (Couldn&apos;t match). Prefer letting the giver decide from Account when possible.
            </li>
            <li>
              <strong>Matched</strong> — Giver + claimer confirm addresses and agree a time (≥2 days). Then open{" "}
              <strong>Orders</strong> to book Porter manually.
            </li>
            <li>
              <strong>Chat</strong> — Two-way with claimer. Green = unread.
            </li>
            <li>
              <strong>Masked calls</strong> — {maskingReady ? "Edesy ready." : "Waiting on Edesy API key."}
            </li>
          </ol>
        </details>
      </div>

      <div className="flex flex-wrap gap-2 border-b-2 border-foreground/10 pb-4">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
              tab === t
                ? "bg-foreground text-background shadow-none"
                : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            }`}
          >
            {t === "pending" ? "Pending" : t === "approved" ? "Matched" : "Couldn't match"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-foreground-muted">No {tab} requests.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((r) => (
            <Card key={r.id} className="overflow-hidden">
              <CardContent className="p-4 sm:p-5 flex flex-col gap-4 min-w-0">
                <div className="flex gap-4 items-start min-w-0">
                  <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 self-start border-2 border-foreground bg-[#f0eee8] overflow-hidden">
                    <SafeImage
                      src={resolveImageUrl(r.item.images?.[0]?.storagePath)}
                      alt={r.item.title}
                      className="w-full h-full object-contain p-1"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-display font-black uppercase text-base sm:text-lg leading-tight break-words">
                        {r.item.title}
                      </p>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.unreadChat && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-green">
                            New chat
                          </span>
                        )}
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">
                          {claimRequestStatusLabel(r.status)}
                        </span>
                        {r.handoverStage && r.status === "approved" && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-white">
                            {handoverStageLabel(r.handoverStage)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
                        {categoryDisplayLabel(r.item.category)}
                        {r.giverLogistics ? ` · ${logisticsAdminLabel(r.giverLogistics)}` : ""}
                        {r.pickupLocality ? ` · Pickup ${formatWallLocality(r.pickupLocality)}` : ""}
                      </p>
                      <p>
                        <span className="font-bold">{r.requesterName || "Unnamed"}</span>
                        <span className="text-foreground-muted">
                          {" "}
                          · {r.requesterPhone || "—"} · {r.requesterTarget || "—"}
                        </span>
                      </p>
                      {r.requesterAddress && (
                        <p className="text-foreground-muted break-words">
                          <span className="font-black uppercase tracking-widest text-[10px] text-foreground mr-1.5">
                            Building
                          </span>
                          {r.requesterAddress}
                        </p>
                      )}
                      {r.note && (
                        <p className="text-foreground-muted break-words">
                          <span className="font-black uppercase tracking-widest text-[10px] text-foreground mr-1.5">
                            Delivery note
                          </span>
                          {r.note}
                        </p>
                      )}
                      {r.photoStoragePath && (
                        <a
                          href={resolveImageUrl(r.photoStoragePath)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold underline w-fit inline-block"
                        >
                          View submitted photo
                        </a>
                      )}
                      <p className="text-xs text-foreground-muted">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                  {r.status === "pending" && (
                    <div className="flex flex-wrap gap-2 pt-3 border-t-2 border-foreground/10">
                      <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={actingOn === r.id}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => decide(r.id, "rejected")} disabled={actingOn === r.id}>
                        Couldn&apos;t match
                      </Button>
                    </div>
                  )}

                  {(r.status === "pending" || r.status === "approved") && (
                    <div className="flex flex-col gap-2 pt-3 border-t-2 border-foreground/10">
                      {usesExternalCourier(r.giverLogistics) && r.status === "approved" && (
                        <p className="text-xs text-foreground-muted font-medium">
                          Manual schedule courier — book from{" "}
                          <a href="/admin/orders" className="underline font-bold">
                            Orders
                          </a>{" "}
                          once time is agreed ({handoverStageLabel(r.handoverStage)}).
                        </p>
                      )}
                      {!usesExternalCourier(r.giverLogistics) && (
                        <p className="text-xs text-foreground-muted font-medium">
                          Handover is peer-led ({logisticsAdminLabel(r.giverLogistics)}). Track stage badges above / chat if needed.
                        </p>
                      )}
                      <details className="border-2 border-foreground/20 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-[10px] font-black uppercase tracking-widest text-foreground-muted hover:text-foreground">
                          Advanced / legacy courier
                        </summary>
                        <div className="flex flex-col gap-2 p-3 pt-0 border-t border-foreground/10">
                      {usesExternalCourier(r.giverLogistics) ? (
                        <>
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Courier — Reloved ops books
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      <Button size="sm" variant="outline" type="button" className="w-full justify-center" onClick={() => void copyForOps(r)}>
                        {copiedId === r.id ? "Copied" : "Copy pickup + drop"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        onClick={() => openMapsForBuilding(r.requesterAddress || "")}
                      >
                        Open Maps
                      </Button>
                      {/* Open Shiprocket / Book API / Shadowfax hidden from UI — ops books outside Reloved */}
                      </div>
                        </>
                      ) : (
                        <p className="text-xs text-foreground-muted font-medium">
                          No courier tools for this logistics mode.
                        </p>
                      )}
                        </div>
                      </details>
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted pt-1">
                        Masked calls
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId}
                        onClick={() => void callMasked(r, "ops_to_claimer")}
                        title={
                          maskingReady
                            ? "Reloved ops rings first, then claimer — both see Reloved masked number"
                            : "Configure Edesy first"
                        }
                      >
                        {callingId === `${r.id}:ops_to_claimer` ? "Calling…" : "Ops ↔ Claimer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId}
                        onClick={() => void callMasked(r, "claimer_to_giver")}
                        title={
                          maskingReady
                            ? "Claimer rings first, then giver — both see Reloved number only"
                            : "Configure Edesy first"
                        }
                      >
                        {callingId === `${r.id}:claimer_to_giver` ? "Calling…" : "Claimer ↔ Giver"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId || !r.borzoCourier?.phone}
                        onClick={() => void callMasked(r, "courier_to_claimer")}
                        title={
                          !r.borzoCourier?.phone
                            ? "Book Borzo first — needs rider phone"
                            : maskingReady
                              ? "Rider rings first, then claimer — both see Reloved number only"
                              : "Configure Edesy first"
                        }
                      >
                        {callingId === `${r.id}:courier_to_claimer` ? "Calling…" : "Rider ↔ Claimer"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId || !r.borzoCourier?.phone}
                        onClick={() => void callMasked(r, "courier_to_giver")}
                        title={
                          !r.borzoCourier?.phone
                            ? "Book Borzo first — needs rider phone"
                            : maskingReady
                              ? "Rider rings first, then giver — both see Reloved number only"
                              : "Configure Edesy first"
                        }
                      >
                        {callingId === `${r.id}:courier_to_giver` ? "Calling…" : "Rider ↔ Giver"}
                      </Button>
                      </div>
                    </div>
                  )}

                  {/* Borzo Delivery API panel paused for Shiprocket demo — re-enable when Borzo prod unlocks */}
                  {false && r.status === "approved" && usesExternalCourier(r.giverLogistics) && (
                    <div className="w-full p-3.5 border-2 border-foreground bg-[#F7F5F0] flex flex-col gap-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5 font-display">
                            <Bike size={15} className="text-foreground" />
                            Borzo Delivery API
                          </span>
                          {borzoReady?.configured ? (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-accent-green text-foreground border border-foreground">
                              {borzoReady.isProduction ? "Live API" : "Test API"}
                            </span>
                          ) : (
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-accent-yellow text-foreground border border-foreground">
                              Manual Track A
                            </span>
                          )}
                        </div>
                        {r.borzoOrderId && (
                          <span className="text-xs font-mono font-bold px-2 py-0.5 bg-white border border-foreground">
                            Order #{r.borzoOrderName || r.borzoOrderId}
                          </span>
                        )}
                      </div>

                      {r.borzoOrderId ? (
                        <div className="flex flex-col gap-2.5">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-white p-3 border-2 border-foreground text-xs">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">
                                Borzo Status
                              </p>
                              <p className="font-display font-black uppercase text-accent-blue mt-0.5">
                                {r.borzoStatus || "Unknown"}
                              </p>
                              {r.borzoDeliveryStatus && (
                                <p className="text-[10px] text-foreground-muted font-medium capitalize">
                                  {r.borzoDeliveryStatus.replace(/_/g, " ")}
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">
                                Delivery Fee
                              </p>
                              <p className="font-display font-black mt-0.5">
                                {r.borzoDeliveryFee ? `₹${r.borzoDeliveryFee}` : "—"}
                              </p>
                              <p className="text-[10px] text-foreground-muted">
                                {r.borzoPaidBy === "reloved_subsidy"
                                  ? `Reloved cover #${r.borzoSubsidyIndex || "?"}`
                                  : r.borzoPaidBy === "receiver"
                                    ? "Receiver reimburses Reloved"
                                    : "Prepaid wallet (no COD)"}
                              </p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-widest text-foreground-muted">
                                Assigned Rider
                              </p>
                              {r.borzoCourier?.name ? (
                                <p className="font-bold mt-0.5">
                                  {r.borzoCourier.name}
                                  {r.borzoCourier.phone ? ` • ${r.borzoCourier.phone}` : ""}
                                </p>
                              ) : (
                                <p className="text-[11px] text-foreground-muted italic mt-0.5">
                                  Assigning rider...
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {r.borzoTrackingUrl && (
                              <a
                                href={r.borzoTrackingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent-blue text-white text-xs font-display font-black uppercase tracking-wider border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                              >
                                <ExternalLink size={12} />
                                Live Rider Tracking
                              </a>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              type="button"
                              disabled={syncingId === r.id}
                              onClick={() => void syncBorzo(r)}
                            >
                              <RefreshCw size={12} className={syncingId === r.id ? "animate-spin" : ""} />
                              {syncingId === r.id ? "Syncing..." : "Sync Status"}
                            </Button>
                            {r.borzoStatus !== "canceled" && r.deliveryStatus !== "delivered" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                type="button"
                                disabled={actingOn === r.id}
                                onClick={() => void cancelBorzo(r)}
                                className="text-accent-red hover:bg-accent-red/10 border border-foreground/30"
                              >
                                Cancel Rider
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {estimates[r.id] && (
                            <div className="p-2.5 bg-white border-2 border-foreground text-xs flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="font-black uppercase tracking-wider">Estimated Delivery Cost:</span>
                                <span className="font-display font-black text-sm text-foreground">
                                  {estimates[r.id].fee}
                                </span>
                              </div>
                              {estimates[r.id].subsidyLabel && (
                                <p className="text-[11px] font-bold text-foreground">{estimates[r.id].subsidyLabel}</p>
                              )}
                              <p className="text-[11px] text-foreground-muted truncate">
                                <strong>Pickup:</strong> {estimates[r.id].pickup}
                              </p>
                              <p className="text-[11px] text-foreground-muted truncate">
                                <strong>Drop:</strong> {estimates[r.id].drop}
                              </p>
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {borzoReady?.configured ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  type="button"
                                  disabled={estimatingId === r.id}
                                  onClick={() => void estimateBorzoFee(r)}
                                >
                                  {estimatingId === r.id ? "Estimating…" : "Estimate Borzo Fee"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  type="button"
                                  disabled={bookingId === r.id}
                                  onClick={() => void bookBorzo(r)}
                                  title="Creates live motorbike order on Borzo with central ops phone"
                                >
                                  {bookingId === r.id ? "Booking Rider…" : "Book via Borzo API"}
                                </Button>
                              </>
                            ) : (
                              <p className="text-xs text-foreground-muted">
                                Configure <code className="font-mono bg-white px-1 border border-foreground/30">BORZO_AUTH_TOKEN</code> in backend functions .env to enable 1-click booking, live rider tracking, and automatic stage updates.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {r.status === "approved" && usesExternalCourier(r.giverLogistics) && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t-2 border-foreground/10">
                      <span className="w-full text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Delivery stage —{" "}
                        {(r.deliveryStatus || "awaiting_pickup").replaceAll("_", " ")}
                      </span>
                      {(!r.deliveryStatus || r.deliveryStatus === "awaiting_pickup") && (
                        <Button
                          size="sm"
                          variant="cta"
                          type="button"
                          disabled={actingOn === r.id}
                          title="Emails the giver the bag / gate-security checklist"
                          onClick={() => setDelivery(r.id, "rider_dispatched")}
                        >
                          {actingOn === r.id ? "Sending…" : "Notify giver — rider dispatched"}
                        </Button>
                      )}
                      {r.deliveryStatus === "rider_dispatched" && (
                        <Button
                          size="sm"
                          variant="cta"
                          type="button"
                          disabled={actingOn === r.id}
                          title="Emails the claimer that the item is on the way"
                          onClick={() => setDelivery(r.id, "picked_up")}
                        >
                          {actingOn === r.id ? "Updating…" : "Mark picked up"}
                        </Button>
                      )}
                      {r.deliveryStatus === "picked_up" && (
                        <Button
                          size="sm"
                          variant="cta"
                          type="button"
                          disabled={actingOn === r.id}
                          title="Emails claimer and giver that delivery is complete"
                          onClick={() => setDelivery(r.id, "delivered")}
                        >
                          {actingOn === r.id ? "Updating…" : "Mark delivered"}
                        </Button>
                      )}
                      {r.deliveryStatus !== "delivered" && r.deliveryStatus !== "failed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          disabled={actingOn === r.id}
                          onClick={() =>
                            setDelivery(
                              r.id,
                              "failed",
                              r.deliveryStatus === "picked_up" ? "claimer" : "giver"
                            )
                          }
                        >
                          Mark failed
                        </Button>
                      )}
                    </div>
                  )}

                  {(r.status === "pending" || r.status === "approved") && (
                    <div className="pt-3 flex flex-col gap-2 border-t-2 border-foreground/10 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Two-way chat — message the claimer
                      </span>
                      <OrderChatThread
                        subjectType="claim"
                        subjectId={r.id}
                        client="admin"
                        hasUnread={!!r.unreadChat}
                      />
                    </div>
                  )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notice && (
        <NoticeModal
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
          primaryLabel={notice.primaryLabel}
          onPrimary={notice.onPrimary}
          secondaryLabel={notice.secondaryLabel}
          onSecondary={notice.onSecondary}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
