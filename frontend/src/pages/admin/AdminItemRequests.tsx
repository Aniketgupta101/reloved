import { useEffect, useState } from "react"
import { Bike, ExternalLink, RefreshCw } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { copyPickupForOps, openBorzo, openPorter, openMapsForBuilding } from "@/lib/logisticsLinks"
import { OrderChatThread } from "@/components/chat/OrderChatThread"

interface ItemRequest {
  id: string
  requesterTarget: string
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  note: string | null
  photoStoragePath: string | null
  status: string
  deliveryStatus?: "awaiting_pickup" | "rider_dispatched" | "picked_up" | "delivered" | "failed"
  borzoOrderId?: number | null
  borzoOrderName?: string | null
  borzoStatus?: string | null
  borzoDeliveryStatus?: string | null
  borzoTrackingUrl?: string | null
  borzoDeliveryFee?: string | number | null
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
    category: string
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
  } | null>(null)
  const [estimates, setEstimates] = useState<Record<string, { fee: string; pickup: string; drop: string }>>({})
  const [estimatingId, setEstimatingId] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

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
      .get<{ configured: boolean; isProduction?: boolean; opsPhone?: string | null; error?: string }>("/api/admin/borzo/status")
      .then((s) => setBorzoReady(s))
      .catch(() => setBorzoReady({ configured: false }))
  }, [])

  async function estimateBorzoFee(r: ItemRequest) {
    setEstimatingId(r.id)
    try {
      const res = await api.admin.post<{
        ok: boolean
        paymentAmount: string | null
        deliveryFeeAmount: string | null
        pickupAddress: string
        dropAddress: string
      }>(`/api/admin/item-requests/${r.id}/borzo/estimate`)
      const fee = res.paymentAmount || res.deliveryFeeAmount || "Calculated"
      setEstimates((prev) => ({
        ...prev,
        [r.id]: { fee: `₹${fee}`, pickup: res.pickupAddress, drop: res.dropAddress },
      }))
    } catch (err: any) {
      window.alert(err?.message || "Failed to estimate Borzo fee")
    } finally {
      setEstimatingId(null)
    }
  }

  async function bookBorzo(r: ItemRequest) {
    if (
      !window.confirm(
        `Book Borzo motorbike rider for "${r.item.title}"?\n\nRider will collect from donor building main gate security and deliver to claimer building main gate security using Reloved central ops phone.`
      )
    ) {
      return
    }
    setBookingId(r.id)
    try {
      const res = await api.admin.post<{ ok: boolean; order: any; request: any }>(
        `/api/admin/item-requests/${r.id}/borzo/book`
      )
      window.alert(
        `Borzo Order #${res.order?.orderName || res.order?.orderId} created successfully! Delivery stage updated to Rider Dispatched.`
      )
      await load(tab)
    } catch (err: any) {
      window.alert(err?.message || "Failed to book Borzo order")
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
      window.alert(err?.message || "Failed to sync Borzo order")
    } finally {
      setSyncingId(null)
    }
  }

  async function cancelBorzo(r: ItemRequest) {
    if (
      !window.confirm(
        `Are you sure you want to cancel Borzo order #${r.borzoOrderName || r.borzoOrderId}?`
      )
    ) {
      return
    }
    setActingOn(r.id)
    try {
      await api.admin.post(`/api/admin/item-requests/${r.id}/borzo/cancel`)
      window.alert("Borzo order canceled.")
      await load(tab)
    } catch (err: any) {
      window.alert(err?.message || "Failed to cancel Borzo order")
    } finally {
      setActingOn(null)
    }
  }

  async function callMasked(
    r: ItemRequest,
    mode: "courier_to_claimer" | "courier_to_giver" | "claimer_to_giver",
  ) {
    setCallingId(`${r.id}:${mode}`)
    try {
      const res = await api.admin.post<{ message?: string; error?: string }>("/api/admin/calls/mask", {
        subjectType: "claim",
        subjectId: r.id,
        mode,
      })
      window.alert(res.message || "Masked call started — first party rings first (ops is not called).")
    } catch (err: any) {
      window.alert(err?.message || "Masked call failed. Is Edesy configured?")
    }
    setCallingId(null)
  }
  async function decide(id: string, status: "approved" | "rejected") {
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
      window.alert(err?.message || "Couldn't update delivery status")
    }
    setActingOn(null)
  }

  async function copyForOps(r: ItemRequest) {
    await copyPickupForOps({
      building: r.requesterAddress || "",
      reference: `claim:${r.item.title}`,
      opsNote: [
        r.note?.trim() ? `Address for delivery: ${r.note.trim()}` : null,
        "Giver pays Borzo once. Contact via company phone — not personal numbers.",
      ]
        .filter(Boolean)
        .join(" "),
    })
    setCopiedId(r.id)
    window.setTimeout(() => setCopiedId((cur) => (cur === r.id ? null : cur)), 2000)
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Claim requests</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl">
          People claiming a Wall item for themselves (not NGO allocations).
        </p>
        <ol className="mt-3 list-decimal pl-5 text-sm font-medium space-y-1 text-foreground/90 max-w-2xl">
          <li>
            <strong>Pending</strong> — Approve or reject (badge in the sidebar counts these).
          </li>
          <li>
            <strong>Approved</strong> — Book Borzo with company phone (
            {borzoReady?.configured
              ? `1-click API ready · ${borzoReady.isProduction ? "Live" : "Test"}`
              : "Manual Track A / Open Borzo"}
            ). Then: notify giver (rider dispatched) → picked up → delivered.
          </li>
          <li>
            <strong>Message user</strong> — Two-way chat. Green dot = unread message from the claimer.
          </li>
          <li>
            <strong>Masked delivery calls</strong> — Connect rider↔claimer, rider↔giver, or claimer↔giver directly (no ops phone).{" "}
            {maskingReady ? "Ready." : "Waiting on Edesy API key."}
          </li>
        </ol>
      </div>

      <div className="flex gap-2 border-b-2 border-foreground/10 pb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
              tab === t
                ? "bg-foreground text-background shadow-none"
                : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            }`}
          >
            {t}
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
            <Card key={r.id}>
              <CardContent className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-28 aspect-square border-2 border-foreground bg-surface-muted overflow-hidden flex-shrink-0">
                  <SafeImage
                    src={resolveImageUrl(r.item.images?.[0]?.storagePath)}
                    alt={r.item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <p className="font-display font-black uppercase">{r.item.title}</p>
                    <div className="flex items-center gap-2">
                      {r.unreadChat && (
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-green">
                          New chat
                        </span>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">
                        {r.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm">
                    <span className="font-bold">{r.requesterName || "Unnamed"}</span> &bull; {r.requesterPhone} &bull;{" "}
                    {r.requesterTarget}
                  </p>
                  {r.requesterAddress && <p className="text-sm text-foreground-muted">{r.requesterAddress}</p>}
                  {r.note && <p className="text-sm text-foreground-muted">Address: {r.note}</p>}
                  {r.photoStoragePath && (
                    <a
                      href={resolveImageUrl(r.photoStoragePath)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold underline w-fit"
                    >
                      View submitted photo
                    </a>
                  )}
                  <p className="text-xs text-foreground-muted">{new Date(r.createdAt).toLocaleString()}</p>

                  {r.status === "pending" && (
                    <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                      <Button size="sm" onClick={() => decide(r.id, "approved")} disabled={actingOn === r.id}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => decide(r.id, "rejected")} disabled={actingOn === r.id}>
                        Reject
                      </Button>
                    </div>
                  )}

                  {(r.status === "pending" || r.status === "approved") && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-foreground/10">
                      <span className="w-full text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Launch logistics — giver pays Borzo once
                      </span>
                      <Button size="sm" variant="outline" type="button" onClick={() => void copyForOps(r)}>
                        {copiedId === r.id ? "Copied" : "Copy building + rider note"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => openMapsForBuilding(r.requesterAddress || "")}
                      >
                        Open Maps
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          void copyForOps(r)
                          openBorzo()
                        }}
                      >
                        Open Borzo
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        onClick={() => {
                          void copyForOps(r)
                          openPorter()
                        }}
                      >
                        Open Porter
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        disabled={!!callingId}
                        onClick={() => void callMasked(r, "claimer_to_giver")}
                        title={
                          maskingReady
                            ? "Claimer rings first, then giver — both see Reloved number only (ops not called)"
                            : "Configure Edesy first"
                        }
                      >
                        {callingId === `${r.id}:claimer_to_giver` ? "Calling…" : "Claimer ↔ Giver"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
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
                  )}

                  {r.status === "approved" && (
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
                                {r.borzoDeliveryFee ? `₹${r.borzoDeliveryFee}` : "₹0 (Covered)"}
                              </p>
                              <p className="text-[10px] text-foreground-muted">Giver pays courier</p>
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

                  {r.status === "approved" && (
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
                    <div className="pt-2 flex flex-col gap-2 border-t-2 border-foreground/10">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
