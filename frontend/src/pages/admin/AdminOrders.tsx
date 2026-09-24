import { useCallback, useEffect, useState } from "react"
import { Check, Copy, RefreshCw } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { handoverStageLabel } from "@/lib/adminStatusLabels"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"

type OpsStatus = "ready_to_book" | "booked" | "delivered" | string

interface Order {
  id: string
  itemTitle: string | null
  itemImages: { storagePath?: string }[] | string[]
  handoverStage: string | null
  opsBookingStatus: OpsStatus | null
  opsNote: string | null
  opsBookedAt: string | null
  agreedSlotAt: string | null
  proposedSlotAt: string | null
  pickupLocality: string | null
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  giverName: string | null
  giverPhone: string | null
  pickupAddressConfirmedByGiver?: boolean
  dropAddressConfirmedByClaimer?: boolean
  createdAt: string | null
}

function formatSlot(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
}

function opsChip(status: OpsStatus | null, stage: string | null): { label: string; className: string } {
  const s = String(status || "").toLowerCase()
  if (s === "delivered" || stage === "received") {
    return { label: "Delivered", className: "bg-accent-green/40" }
  }
  if (s === "booked" || stage === "awaiting_handover" || stage === "handed_over") {
    return { label: "Booked", className: "bg-accent-blue text-white" }
  }
  return { label: "Ready to book", className: "bg-accent-yellow" }
}

function firstImage(order: Order): string | null {
  const imgs = order.itemImages || []
  if (!imgs.length) return null
  const first = imgs[0]
  if (typeof first === "string") return first
  return first?.storagePath || null
}

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.admin.get<{ orders: Order[] }>("/api/admin/orders")
      setOrders(data.orders || [])
    } catch (err: any) {
      setNotice({ title: "Couldn't load orders", body: err?.message || "Try again", tone: "error" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      setNotice({ title: "Copy failed", body: "Clipboard blocked — select and copy manually.", tone: "warn" })
    }
  }

  function pickupBlock(o: Order): string {
    return [
      `PICKUP`,
      o.giverName || "Giver",
      o.giverPhone || "—",
      o.pickupLocality || "—",
    ].join("\n")
  }

  function dropBlock(o: Order): string {
    return [
      `DROP`,
      o.requesterName || "Claimer",
      o.requesterPhone || "—",
      o.requesterAddress || "—",
    ].join("\n")
  }

  function allBlock(o: Order): string {
    return [
      o.itemTitle || "Item",
      `When: ${formatSlot(o.agreedSlotAt)}`,
      "",
      pickupBlock(o),
      "",
      dropBlock(o),
    ].join("\n")
  }

  async function patchOps(o: Order, opsStatus: "booked" | "delivered") {
    setActingOn(o.id)
    try {
      await api.admin.patch(`/api/admin/orders/${o.id}`, { opsStatus })
      await load()
      setNotice({
        title: opsStatus === "booked" ? "Marked booked" : "Marked delivered",
        body:
          opsStatus === "booked"
            ? "Giver can mark Handed over when the bag leaves."
            : "Order marked delivered / handed over.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({
        title: "Update failed",
        body: err?.message || "Couldn't update order",
        tone: "error",
      })
    } finally {
      setActingOn(null)
    }
  }

  const ready = orders.filter((o) => {
    const s = String(o.opsBookingStatus || "").toLowerCase()
    return s === "ready_to_book" || (!s && o.handoverStage === "schedule_agreed")
  })
  const booked = orders.filter((o) => {
    const s = String(o.opsBookingStatus || "").toLowerCase()
    return s === "booked" || o.handoverStage === "awaiting_handover" || o.handoverStage === "handed_over"
  })
  const delivered = orders.filter((o) => {
    const s = String(o.opsBookingStatus || "").toLowerCase()
    return s === "delivered" || o.handoverStage === "received"
  })

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Orders</h1>
          <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
            Schedule-agreed claims ready for manual Porter / courier booking. Copy addresses, book offline, then mark
            Booked.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 text-xs font-black uppercase tracking-widest">
        <span className="px-3 py-1.5 border-2 border-foreground bg-accent-yellow">Ready {ready.length}</span>
        <span className="px-3 py-1.5 border-2 border-foreground bg-accent-blue text-white">Booked {booked.length}</span>
        <span className="px-3 py-1.5 border-2 border-foreground bg-accent-green/40">Delivered {delivered.length}</span>
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-foreground-muted">No orders yet. They appear when giver and claimer agree a delivery time.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o) => {
            const chip = opsChip(o.opsBookingStatus, o.handoverStage)
            const img = firstImage(o)
            return (
              <Card key={o.id} className="overflow-hidden">
                <CardContent className="p-4 sm:p-5 flex flex-col gap-4 min-w-0">
                  <div className="flex gap-4 items-start min-w-0">
                    <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 border-2 border-foreground bg-[#f0eee8] overflow-hidden">
                      <SafeImage
                        src={resolveImageUrl(img)}
                        alt={o.itemTitle || "Item"}
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="font-display font-black uppercase text-base sm:text-lg leading-tight break-words">
                          {o.itemTitle || "Untitled item"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground ${chip.className}`}
                          >
                            {chip.label}
                          </span>
                          {o.handoverStage && (
                            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-white">
                              {handoverStageLabel(o.handoverStage)}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xl sm:text-2xl font-display font-black leading-snug">
                        {formatSlot(o.agreedSlotAt)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 border-2 border-foreground bg-[#F7F5F0] flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pickup</p>
                        <button
                          type="button"
                          className="text-[10px] font-black uppercase tracking-widest underline inline-flex items-center gap-1"
                          onClick={() => void copyText(`${o.id}:pickup`, pickupBlock(o))}
                        >
                          {copied === `${o.id}:pickup` ? <Check size={12} /> : <Copy size={12} />}
                          Copy
                        </button>
                      </div>
                      <p className="font-bold">{o.giverName || "—"}</p>
                      <p className="text-sm">{o.giverPhone || "—"}</p>
                      <p className="text-sm break-words">{o.pickupLocality || "—"}</p>
                    </div>
                    <div className="p-3 border-2 border-foreground bg-[#F7F5F0] flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Drop</p>
                        <button
                          type="button"
                          className="text-[10px] font-black uppercase tracking-widest underline inline-flex items-center gap-1"
                          onClick={() => void copyText(`${o.id}:drop`, dropBlock(o))}
                        >
                          {copied === `${o.id}:drop` ? <Check size={12} /> : <Copy size={12} />}
                          Copy
                        </button>
                      </div>
                      <p className="font-bold">{o.requesterName || "—"}</p>
                      <p className="text-sm">{o.requesterPhone || "—"}</p>
                      <p className="text-sm break-words">{o.requesterAddress || "—"}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => void copyText(`${o.id}:all`, allBlock(o))}
                    >
                      {copied === `${o.id}:all` ? "Copied all" : "Copy all"}
                    </Button>
                    {String(o.opsBookingStatus || "") !== "booked" &&
                      String(o.opsBookingStatus || "") !== "delivered" && (
                        <Button
                          size="sm"
                          variant="cta"
                          type="button"
                          disabled={actingOn === o.id}
                          onClick={() => void patchOps(o, "booked")}
                        >
                          {actingOn === o.id ? "Saving…" : "Mark booked with Porter"}
                        </Button>
                      )}
                    {String(o.opsBookingStatus || "") === "booked" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        disabled={actingOn === o.id}
                        onClick={() => void patchOps(o, "delivered")}
                      >
                        {actingOn === o.id ? "Saving…" : "Mark delivered"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {notice && <NoticeModal {...notice} onClose={() => setNotice(null)} />}
    </div>
  )
}
