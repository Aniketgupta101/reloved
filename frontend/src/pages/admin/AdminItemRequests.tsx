import { useSearchParams } from "react-router-dom"
import { InventoryClaimFocusPanel } from "@/components/admin/InventoryClaimFocusPanel"
import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import {
  claimRequestStatusLabel,
  categoryDisplayLabel,
  handoverStageLabel,
  logisticsAdminLabel,
} from "@/lib/adminStatusLabels"
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
  agreedSlotAt?: string | null
  proposedSlotAt?: string | null
  opsBookingStatus?: string | null
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

function formatSlot(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
}

type MaskCallMode =
  | "ops_to_claimer"
  | "ops_to_giver"
  | "claimer_to_giver"
  | "courier_to_claimer"
  | "courier_to_giver"

function AdminItemRequestsBoard() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("pending")
  const [requests, setRequests] = useState<ItemRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [maskingReady, setMaskingReady] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)

  async function load(status: string) {
    setLoading(true)
    try {
      const { requests } = await api.admin.get<{ requests: ItemRequest[] }>(
        `/api/admin/item-requests?status=${status}`
      )
      // Matched tab: keep match-flow claims. Courier pipeline belongs on Deliveries.
      if (status === "approved") {
        setRequests(
          (requests || []).filter((r) => {
            const ops = String(r.opsBookingStatus || "").toLowerCase()
            const stage = String(r.handoverStage || "").toLowerCase()
            if (stage === "received" || ops === "delivered") return false
            if (["ready_to_book", "booked", "out_for_delivery"].includes(ops)) return false
            if (["schedule_agreed", "awaiting_handover", "handed_over"].includes(stage)) return false
            return true
          })
        )
      } else {
        setRequests(requests)
      }
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load(tab)
  }, [tab])

  useEffect(() => {
    api.admin
      .get<{ configured: boolean }>("/api/admin/calls/masking-status")
      .then((s) => setMaskingReady(!!s.configured))
      .catch(() => setMaskingReady(false))
  }, [])

  async function callMasked(r: ItemRequest, mode: MaskCallMode) {
    setCallingId(`${r.id}:${mode}`)
    try {
      const res = await api.admin.post<{ message?: string; maskedNumber?: string | null }>(
        "/api/admin/calls/mask",
        { subjectType: "claim", subjectId: r.id, mode }
      )
      setNotice({
        title: "Masked call started",
        body:
          res.message ||
          "Ops phone rings first, then we bridge the other party. Both see the Reloved number.",
        tone: "ok",
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Masked call failed"
      setNotice({
        title: "Call failed",
        body: message,
        tone: "error",
      })
    }
    setCallingId(null)
  }

  async function decide(id: string, status: "approved" | "rejected") {
    if (status === "rejected") {
      setNotice({
        title: "Couldn't match?",
        body: "Soft-declines the claimer and puts the item back on the Wall.",
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

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full min-w-0">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Claims</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
          Accept/decline new claims and chase address or schedule. Once time is locked for courier, manage on{" "}
          <Link to="/admin/orders" className="underline font-bold">
            Deliveries
          </Link>
          . Masked calls:{" "}
          {maskingReady ? "Edesy ready (ops phone rings first)." : "waiting on Edesy config."}
        </p>
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
        <p className="text-foreground-muted">
          {tab === "approved"
            ? "No claims waiting on match (address/schedule). Courier booking is under Deliveries."
            : `No ${tab === "rejected" ? "declined" : tab} claims.`}
        </p>
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
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
                      {(r.agreedSlotAt || r.proposedSlotAt) && (
                        <p className="text-xs font-medium">
                          <span className="font-black uppercase tracking-widest text-[10px] text-foreground-muted mr-1">
                            Slot
                          </span>
                          {formatSlot(r.agreedSlotAt || r.proposedSlotAt)}
                          {!r.agreedSlotAt && r.proposedSlotAt ? " (proposed)" : ""}
                        </p>
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
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(r.id, "rejected")}
                      disabled={actingOn === r.id}
                    >
                      Couldn&apos;t match
                    </Button>
                  </div>
                )}

                {r.status === "approved" && usesExternalCourier(r.giverLogistics) && (
                  <div className="pt-3 border-t-2 border-foreground/10">
                    <p className="text-xs text-foreground-muted font-medium">
                      {String(r.handoverStage || "") === "schedule_agreed" ||
                      String(r.opsBookingStatus || "") === "ready_to_book" ||
                      String(r.opsBookingStatus || "") === "booked" ||
                      String(r.opsBookingStatus || "") === "out_for_delivery" ? (
                        <>
                          Courier stage — manage on{" "}
                          <Link to="/admin/orders" className="underline font-bold">
                            Deliveries
                          </Link>
                          .
                        </>
                      ) : (
                        <>
                          Manual courier — once time is agreed, book from{" "}
                          <Link to="/admin/orders" className="underline font-bold">
                            Deliveries
                          </Link>{" "}
                          ({handoverStageLabel(r.handoverStage)}).
                        </>
                      )}
                    </p>
                    {(String(r.handoverStage || "") === "schedule_agreed" ||
                      ["ready_to_book", "booked", "out_for_delivery", "delivered"].includes(
                        String(r.opsBookingStatus || "")
                      )) && (
                      <Link to="/admin/orders" className="inline-block mt-2">
                        <Button size="sm" variant="cta" type="button">
                          Open in Deliveries
                        </Button>
                      </Link>
                    )}
                  </div>
                )}

                {r.status === "approved" && (
                  <div className="pt-3 border-t-2 border-foreground/10 flex flex-col gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                      Masked calls
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId || !r.requesterPhone}
                        onClick={() => void callMasked(r, "ops_to_claimer")}
                        title={
                          maskingReady
                            ? "Your ops phone rings first, then claimer — both see Reloved masked number"
                            : "Try call anyway — keep ops phone ready"
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
                        onClick={() => void callMasked(r, "ops_to_giver")}
                        title={
                          maskingReady
                            ? "Your ops phone rings first, then dropper — both see Reloved masked number"
                            : "Try call anyway — keep ops phone ready"
                        }
                      >
                        {callingId === `${r.id}:ops_to_giver` ? "Calling…" : "Ops ↔ Dropper"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="w-full justify-center"
                        disabled={!!callingId || !r.requesterPhone}
                        onClick={() => void callMasked(r, "claimer_to_giver")}
                        title={
                          maskingReady
                            ? "Claimer rings first, then dropper — both see Reloved number only"
                            : "Try call anyway"
                        }
                      >
                        {callingId === `${r.id}:claimer_to_giver` ? "Calling…" : "Claimer ↔ Dropper"}
                      </Button>
                    </div>
                  </div>
                )}

                {(r.status === "pending" || r.status === "approved") && (
                  <div className="pt-3 flex flex-col gap-2 border-t-2 border-foreground/10 min-w-0">
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

export function AdminItemRequests() {
 const [params]=useSearchParams(); const id=params.get("claimId");
 return id ? <InventoryClaimFocusPanel id={id} kind="claim"/> : <AdminItemRequestsBoard/>
}
