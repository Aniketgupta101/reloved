import { useCallback, useEffect, useMemo, useState } from "react"
import { Check, Copy, Eye, RefreshCw, X } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { handoverStageLabel } from "@/lib/adminStatusLabels"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"

type OpsStatus = "ready_to_book" | "booked" | "out_for_delivery" | "delivered" | string
type StageFilter = "all" | "ready" | "in_process" | "out_for_delivery" | "delivered"

interface NotifSummary {
  count: number
  lastAt: string | null
  lastLabel: string | null
}

interface Order {
  id: string
  itemTitle: string | null
  itemImages: { storagePath?: string }[] | string[]
  handoverStage: string | null
  opsBookingStatus: OpsStatus | null
  deliveryStatus: string | null
  claimerDispatchNotifiedAt: string | null
  opsNote: string | null
  opsBookedAt: string | null
  agreedSlotAt: string | null
  proposedSlotAt: string | null
  pickupLocality: string | null
  requesterName: string | null
  requesterPhone: string | null
  requesterAddress: string | null
  requesterEmail?: string | null
  giverName: string | null
  giverPhone: string | null
  giverEmail?: string | null
  pickupAddressConfirmedByGiver?: boolean
  dropAddressConfirmedByClaimer?: boolean
  createdAt: string | null
  notificationSummary?: NotifSummary
}

interface NotifEvent {
  id: string
  claimId?: string
  channel: "email" | "sms" | string
  templateKey: string
  audience: string
  to: string
  subject: string
  previewBody: string
  params?: Record<string, string>
  status: string
  createdAt: string | null
  error?: string | null
}

interface AsReceivedPreview {
  key: string
  label: string
  channel: string
  audience: string
  subject: string
  textBody: string
  htmlBody: string | null
  source: string
  providerTemplateId: string | null
  body?: string
}

interface CatalogEntry {
  key: string
  label: string
  channel: string
  audience: string
  stage: string
  subjectTemplate: string
  bodyTemplate: string
}

function formatSlot(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
}

function stageOf(o: Order): StageFilter {
  const s = String(o.opsBookingStatus || "").toLowerCase()
  if (s === "delivered" || o.handoverStage === "received") return "delivered"
  if (s === "out_for_delivery" || o.claimerDispatchNotifiedAt) return "out_for_delivery"
  if (s === "booked" || o.handoverStage === "awaiting_handover" || o.handoverStage === "handed_over") {
    return "in_process"
  }
  return "ready"
}

function stageChip(stage: StageFilter): { label: string; className: string } {
  if (stage === "delivered") return { label: "Delivered", className: "bg-accent-green/40" }
  if (stage === "out_for_delivery") return { label: "Out for delivery", className: "bg-accent-pink" }
  if (stage === "in_process") return { label: "In process", className: "bg-accent-blue text-white" }
  return { label: "Ready to book", className: "bg-accent-yellow" }
}

function firstImage(order: Order): string | null {
  const imgs = order.itemImages || []
  if (!imgs.length) return null
  const first = imgs[0]
  if (typeof first === "string") return first
  return first?.storagePath || null
}

function templateLabel(key: string, catalog: CatalogEntry[]): string {
  return catalog.find((c) => c.key === key)?.label || key.replace(/_/g, " ")
}

export function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [filter, setFilter] = useState<StageFilter>("all")
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [previewOrder, setPreviewOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<NotifEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [previewEvent, setPreviewEvent] = useState<NotifEvent | null>(null)
  const [asReceived, setAsReceived] = useState<AsReceivedPreview | null>(null)
  const [asReceivedLoading, setAsReceivedLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.admin.get<{ orders: Order[] }>("/api/admin/orders")
      setOrders(data.orders || [])
    } catch (err: any) {
      setNotice({ title: "Couldn't load deliveries", body: err?.message || "Try again", tone: "error" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    api.admin
      .get<{ templates: CatalogEntry[] }>("/api/admin/notification-templates")
      .then((d) => setCatalog(d.templates || []))
      .catch(() => undefined)
  }, [load])

  async function openNotifications(o: Order) {
    setPreviewOrder(o)
    setPreviewEvent(null)
    setAsReceived(null)
    setEventsLoading(true)
    try {
      const data = await api.admin.get<{ events: NotifEvent[] }>(`/api/admin/orders/${o.id}/notifications`)
      setEvents(data.events || [])
    } catch (err: any) {
      setEvents([])
      setNotice({ title: "Couldn't load notifications", body: err?.message || "Try again", tone: "error" })
    } finally {
      setEventsLoading(false)
    }
  }

  function claimParams(o: Order | null, ev?: NotifEvent | null): Record<string, string> {
    const base: Record<string, string> = {
      ITEM_TITLE: o?.itemTitle || "",
      REQUESTER_NAME: o?.requesterName || "there",
      FIRST_NAME: o?.giverName || o?.requesterName || "there",
      NAME: o?.requesterName || o?.giverName || "there",
      CLAIMER_NAME: o?.requesterName || "there",
    }
    return { ...base, ...(ev?.params || {}) }
  }

  async function openAsReceived(ev: NotifEvent, o: Order | null) {
    setPreviewEvent(ev)
    setAsReceived(null)
    setAsReceivedLoading(true)
    try {
      const channel = ev.channel === "sms" ? "sms" : "email"
      const data = await api.admin.post<AsReceivedPreview>("/api/admin/notification-templates/preview", {
        key: ev.templateKey,
        channel,
        claimId: o?.id || ev.claimId || undefined,
        params: claimParams(o, ev),
      })
      setAsReceived(data)
    } catch (err: any) {
      setAsReceived({
        key: ev.templateKey,
        label: templateLabel(ev.templateKey, catalog),
        channel: ev.channel,
        audience: ev.audience,
        subject: ev.subject,
        textBody: ev.previewBody,
        htmlBody: null,
        source: "fallback",
        providerTemplateId: null,
      })
      setNotice({
        title: "Couldn't load full template",
        body: err?.message || "Showing logged text only",
        tone: "warn",
      })
    } finally {
      setAsReceivedLoading(false)
    }
  }

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
    return [`PICKUP`, o.giverName || "Dropper", o.giverPhone || "—", o.pickupLocality || "—"].join("\n")
  }

  function dropBlock(o: Order): string {
    return [`DROP`, o.requesterName || "Claimer", o.requesterPhone || "—", o.requesterAddress || "—"].join("\n")
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

  async function patchOps(o: Order, opsStatus: "booked" | "out_for_delivery" | "delivered") {
    setActingOn(o.id)
    try {
      await api.admin.patch(`/api/admin/orders/${o.id}`, { opsStatus })
      await load()
      const titles: Record<string, string> = {
        booked: "Marked in process",
        out_for_delivery: "Marked out for delivery",
        delivered: "Marked delivered",
      }
      const bodies: Record<string, string> = {
        booked: "Dropper notified (rider coming — bag at gate).",
        out_for_delivery: "Claimer notified (order dispatched).",
        delivered: "Delivered notices + share-a-pic email sent to claimer where configured.",
      }
      setNotice({ title: titles[opsStatus], body: bodies[opsStatus], tone: "ok" })
      if (previewOrder?.id === o.id) {
        await openNotifications({ ...o, opsBookingStatus: opsStatus })
      }
    } catch (err: any) {
      setNotice({
        title: "Update failed",
        body: err?.message || "Couldn't update delivery",
        tone: "error",
      })
    } finally {
      setActingOn(null)
    }
  }

  const counts = useMemo(() => {
    const c = { ready: 0, in_process: 0, out_for_delivery: 0, delivered: 0 }
    for (const o of orders) {
      const s = stageOf(o)
      if (s !== "all") c[s] += 1
    }
    return c
  }, [orders])

  const visible = useMemo(() => {
    if (filter === "all") return orders
    return orders.filter((o) => stageOf(o) === filter)
  }, [orders, filter])

  const filters: { id: StageFilter; label: string; count: number; className: string }[] = [
    { id: "all", label: "All", count: orders.length, className: "bg-white" },
    { id: "ready", label: "Ready", count: counts.ready, className: "bg-accent-yellow" },
    { id: "in_process", label: "In process", count: counts.in_process, className: "bg-accent-blue text-white" },
    {
      id: "out_for_delivery",
      label: "Out for delivery",
      count: counts.out_for_delivery,
      className: "bg-accent-pink",
    },
    { id: "delivered", label: "Delivered", count: counts.delivered, className: "bg-accent-green/40" },
  ]

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full min-w-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Deliveries</h1>
          <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
            Book Porter offline, then advance stages: In process (dropper) → Out for delivery (claimer) → Delivered
            (both). Open Notifications to audit email/SMS sent for each claim.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 border-2 border-foreground text-xs font-black uppercase tracking-widest ${f.className} ${
              filter === f.id ? "ring-2 ring-offset-1 ring-foreground" : "opacity-80 hover:opacity-100"
            }`}
          >
            {f.label} {f.count}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-foreground-muted">
          {orders.length === 0
            ? "No deliveries yet. They appear when dropper and claimer agree a delivery time."
            : "Nothing in this stage."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map((o) => {
            const stage = stageOf(o)
            const chip = stageChip(stage)
            const img = firstImage(o)
            const summary = o.notificationSummary || { count: 0, lastAt: null, lastLabel: null }
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
                        {formatSlot(o.agreedSlotAt || o.proposedSlotAt)}
                      </p>
                      <p className="text-[11px] text-foreground-muted font-medium">
                        Delivery: {o.deliveryStatus || "—"} · Ops: {o.opsBookingStatus || "—"}
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

                  <div className="flex flex-wrap items-center gap-2 p-2.5 border-2 border-dashed border-foreground/40 bg-white">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted mr-1">
                      Notifications
                    </p>
                    <span className="text-xs font-bold tabular-nums">{summary.count} sent</span>
                    {summary.lastLabel && (
                      <span className="text-xs text-foreground-muted truncate max-w-[14rem]">
                        Last: {templateLabel(summary.lastLabel, catalog)}
                        {summary.lastAt ? ` · ${formatWhen(summary.lastAt)}` : ""}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      className="ml-auto"
                      onClick={() => void openNotifications(o)}
                    >
                      <Eye size={14} />
                      Preview
                    </Button>
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
                    {stage === "ready" && (
                      <Button
                        size="sm"
                        variant="cta"
                        type="button"
                        disabled={actingOn === o.id}
                        onClick={() => void patchOps(o, "booked")}
                      >
                        {actingOn === o.id ? "Saving…" : "Mark in process"}
                      </Button>
                    )}
                    {stage === "in_process" && (
                      <Button
                        size="sm"
                        variant="cta"
                        type="button"
                        disabled={actingOn === o.id}
                        onClick={() => void patchOps(o, "out_for_delivery")}
                      >
                        {actingOn === o.id ? "Saving…" : "Mark out for delivery"}
                      </Button>
                    )}
                    {(stage === "in_process" || stage === "out_for_delivery") && (
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

      {previewOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40">
          <div className="bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 border-b-2 border-foreground sticky top-0 bg-white">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Notifications</p>
                <p className="font-display font-black uppercase text-lg leading-tight break-words">
                  {previewOrder.itemTitle || "Claim"}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-foreground"
                aria-label="Close"
                onClick={() => {
                  setPreviewOrder(null)
                  setPreviewEvent(null)
                  setAsReceived(null)
                  setEvents([])
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-3">
              {eventsLoading ? (
                <p className="text-sm text-foreground-muted">Loading…</p>
              ) : events.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-foreground-muted">
                    No messages logged yet for this claim. History starts when stages are marked after deploy.
                  </p>
                  {catalog.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Template catalog
                      </p>
                      {catalog.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          className="text-left p-3 border-2 border-foreground hover:bg-[#F7F5F0]"
                          onClick={() =>
                            void openAsReceived(
                              {
                                id: `catalog:${t.key}`,
                                channel: t.channel,
                                templateKey: t.key,
                                audience: t.audience,
                                to: "—",
                                subject: t.subjectTemplate,
                                previewBody: t.bodyTemplate,
                                status: "catalog",
                                createdAt: null,
                              },
                              previewOrder
                            )
                          }
                        >
                          <p className="text-xs font-black uppercase tracking-widest">{t.label}</p>
                          <p className="text-[11px] text-foreground-muted mt-0.5">
                            {t.channel} · {t.audience} · {t.stage} · as received
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                events.map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    className="text-left p-3 border-2 border-foreground hover:bg-[#F7F5F0] flex flex-col gap-1"
                    onClick={() => void openAsReceived(ev, previewOrder)}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-black uppercase tracking-widest">
                        {templateLabel(ev.templateKey, catalog)}
                      </p>
                      <span
                        className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-foreground ${
                          ev.status === "sent"
                            ? "bg-accent-green/40"
                            : ev.status === "failed"
                              ? "bg-accent-red text-white"
                              : "bg-white"
                        }`}
                      >
                        {ev.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground-muted">
                      {ev.channel} → {ev.to} · {ev.audience} · {formatWhen(ev.createdAt)}
                    </p>
                    <p className="text-sm font-medium truncate">{ev.subject}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-accent-blue mt-1">
                      View as received →
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {previewEvent && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] w-full max-w-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 p-4 border-b-2 border-foreground sticky top-0 bg-white z-10">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                  As received · {previewEvent.channel}
                  {asReceived?.source ? ` · ${asReceived.source}` : ""}
                </p>
                <p className="font-display font-black uppercase leading-tight">
                  {templateLabel(previewEvent.templateKey, catalog)}
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-foreground"
                aria-label="Close preview"
                onClick={() => {
                  setPreviewEvent(null)
                  setAsReceived(null)
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3 text-sm">
              <p>
                <span className="font-black uppercase text-[10px] tracking-widest text-foreground-muted">To</span>
                <br />
                {previewEvent.to}
              </p>
              <p>
                <span className="font-black uppercase text-[10px] tracking-widest text-foreground-muted">
                  Subject
                </span>
                <br />
                {asReceived?.subject || previewEvent.subject}
              </p>

              {asReceivedLoading ? (
                <p className="text-foreground-muted">Loading template…</p>
              ) : previewEvent.channel === "sms" || asReceived?.channel === "sms" ? (
                <div>
                  <span className="font-black uppercase text-[10px] tracking-widest text-foreground-muted">
                    SMS as received
                  </span>
                  <div className="mt-2 mx-auto max-w-[320px] rounded-[28px] border-2 border-foreground bg-[#111] p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                    <div className="rounded-[20px] bg-[#1c1c1e] px-3 py-4 min-h-[160px]">
                      <p className="text-[10px] text-white/50 text-center mb-3 uppercase tracking-widest">Messages</p>
                      <div className="bg-[#3A3A3C] text-white text-[13px] leading-snug rounded-2xl rounded-bl-sm px-3 py-2.5 whitespace-pre-wrap">
                        {asReceived?.textBody || previewEvent.previewBody}
                      </div>
                      <p className="text-[10px] text-white/40 mt-2 text-right">Reloved Digital</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="font-black uppercase text-[10px] tracking-widest text-foreground-muted">
                    Email as received
                  </span>
                  {asReceived?.htmlBody ? (
                    <div className="mt-2 border-2 border-foreground bg-[#EBE7DF] overflow-hidden">
                      <iframe
                        title="Email preview"
                        sandbox=""
                        srcDoc={asReceived.htmlBody}
                        className="w-full min-h-[420px] bg-[#EBE7DF] border-0"
                      />
                    </div>
                  ) : (
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-sm border-2 border-foreground p-3 bg-[#F7F5F0]">
                      {asReceived?.textBody || previewEvent.previewBody}
                    </pre>
                  )}
                </div>
              )}

              {previewEvent.error && (
                <p className="text-accent-red text-xs font-medium">Error: {previewEvent.error}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {notice && <NoticeModal {...notice} onClose={() => setNotice(null)} />}
    </div>
  )
}
