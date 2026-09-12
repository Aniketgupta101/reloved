import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import { SafeImage } from "@/components/ui/SafeImage"
import { Button } from "@/components/ui/Button"

interface ItemRequest {
  id: string
  status: string
  createdAt: string
  requesterAddress?: string | null
  note?: string | null
  deliveryStatus?: "awaiting_pickup" | "rider_dispatched" | "picked_up" | "delivered" | "failed" | null
  borzoOrderId?: number | null
  borzoOrderName?: string | null
  borzoStatus?: string | null
  borzoDeliveryStatus?: string | null
  borzoTrackingUrl?: string | null
  borzoCourier?: {
    courierId?: number
    name?: string
    surname?: string
    phone?: string
    photoUrl?: string
  } | null
  item: { id: string; slug: string; title: string; images: { storagePath: string }[] }
}

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [request, setRequest] = useState<ItemRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [booking, setBooking] = useState(false)
  const [estimate, setEstimate] = useState<{ fee: string; pickup: string; drop: string } | null>(null)

  async function handleEstimate() {
    if (!id) return
    setEstimating(true)
    try {
      const res = await api.donor.post<{
        ok: boolean
        paymentAmount: string | null
        deliveryFeeAmount: string | null
        pickupAddress: string
        dropAddress: string
      }>(`/api/donor/item-requests/${id}/borzo/estimate`)
      const fee = res.paymentAmount || res.deliveryFeeAmount || "Calculated"
      setEstimate({ fee: `₹${fee}`, pickup: res.pickupAddress, drop: res.dropAddress })
    } catch (err: any) {
      window.alert(err?.message || "Failed to estimate delivery fee")
    } finally {
      setEstimating(false)
    }
  }

  async function handleBookBorzo() {
    if (!id || !request) return
    if (
      !window.confirm(
        `Book Borzo delivery for "${request.item.title}"?\n\nA rider will be dispatched to collect the item from the giver's building main gate security and deliver directly to your gate.`
      )
    ) {
      return
    }
    setBooking(true)
    try {
      const res = await api.donor.post<{ ok: boolean; order: any; request: any }>(
        `/api/donor/item-requests/${id}/borzo/book`
      )
      window.alert(
        `Borzo Order #${res.order?.orderName || res.order?.orderId} created! Rider will be dispatched.`
      )
      const { requests } = await api.donor.get<{ requests: ItemRequest[] }>("/api/donor/item-requests")
      const found = (requests || []).find((r) => r.id === id) || null
      if (found) setRequest(found)
    } catch (err: any) {
      window.alert(err?.message || "Failed to book Borzo order")
    } finally {
      setBooking(false)
    }
  }

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login", { replace: true, state: { redirect: `/account/claims/${id}` } })
      return
    }
    if (!id) return
    setLoading(true)
    api.donor
      .get<{ requests: ItemRequest[] }>("/api/donor/item-requests")
      .then(({ requests }) => {
        const found = (requests || []).find((r) => r.id === id) || null
        if (!found) setError("This claim wasn't found on your account.")
        setRequest(found)
      })
      .catch((err: any) => setError(err?.message || "Couldn't load claim"))
      .finally(() => setLoading(false))
  }, [id, navigate])

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 h-64 bg-surface-muted border-2 border-foreground animate-pulse" />
  }

  if (error || !request) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-4">
        <p className="font-bold text-accent-red">{error || "Not found"}</p>
        <Link to="/account" className="text-sm font-black uppercase tracking-widest underline">
          Back to account
        </Link>
      </div>
    )
  }

  const approved = request.status === "approved"
  const statusLabel =
    request.status === "pending" ? "Awaiting review (24-48h)" : request.status.replace(/_/g, " ")
  const imageSrc = resolveImageUrl(request.item.images?.[0]?.storagePath)

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 flex flex-col gap-6">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div className="relative h-[280px] sm:h-[360px] border-b-2 border-foreground bg-[#f0eee8]">
          <SafeImage
            src={imageSrc}
            alt={request.item.title}
            priority
            className="absolute inset-0 w-full h-full object-contain p-4 sm:p-6"
          />
        </div>

        <div className="p-5 sm:p-8 flex flex-col gap-5">
          <div className="flex gap-4 items-start">
            <div className="w-16 h-16 shrink-0 border-2 border-foreground bg-surface-muted overflow-hidden">
              <SafeImage
                src={imageSrc}
                alt=""
                showSkeleton={false}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span
                className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 ${
                  approved
                    ? "bg-accent-green/20 text-accent-green"
                    : request.status === "rejected"
                      ? "bg-accent-red/10 text-accent-red"
                      : "bg-accent-blue/10 text-accent-blue"
                }`}
              >
                {statusLabel}
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight leading-tight">
                {request.item.title}
              </h1>
              {request.createdAt && (
                <p className="text-xs text-foreground-muted font-medium">
                  Requested{" "}
                  {new Date(request.createdAt).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              )}
            </div>
          </div>

          {request.requesterAddress && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Delivery building</p>
              <p className="text-sm font-medium">{request.requesterAddress}</p>
            </div>
          )}

          {request.note && (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Your note</p>
              <p className="text-sm font-medium">{request.note}</p>
            </div>
          )}

          {(approved || request.status === "pending") && (
            <div className="flex flex-col gap-4 pt-2 border-t-2 border-foreground/10">
              {approved ? (
                <>
                  <p className="text-sm font-medium text-foreground-muted">
                    Item is <span className="font-black text-foreground">Rs 0 free</span> - including delivery.
                  </p>
                  <p className="text-sm leading-snug font-bold text-foreground border-2 border-foreground bg-accent-pink/10 px-3 py-2.5">
                    Flow: giver - Borzo - you. The giver pays Borzo once (about Rs 40-80). Reloved takes no cut. Our team
                    coordinates pickup from their building gate to yours - chat us anytime below.
                  </p>

                  <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-[#F7F5F0]">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Bike size={16} className="text-foreground" />
                        <span className="text-xs font-black uppercase tracking-wider font-display">
                          Delivery Status: {(request.deliveryStatus || "awaiting_pickup").replace(/_/g, " ")}
                        </span>
                      </div>
                      {request.borzoOrderName && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-white border border-foreground">
                          #{request.borzoOrderName}
                        </span>
                      )}
                    </div>

                    {request.borzoOrderId ? (
                      <div className="flex flex-col gap-2.5">
                        {request.borzoCourier?.name && (
                          <p className="text-xs font-medium">
                            Rider: <span className="font-bold">{request.borzoCourier.name}</span>
                            {request.borzoCourier.phone ? ` • ${request.borzoCourier.phone}` : ""}
                          </p>
                        )}

                        {request.borzoTrackingUrl ? (
                          <a
                            href={request.borzoTrackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background font-display font-black text-xs uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                          >
                            <ExternalLink size={14} />
                            Track Rider Live on Borzo
                          </a>
                        ) : (
                          <p className="text-[11px] text-foreground-muted font-medium">
                            Rider is being assigned. Live tracking link will appear shortly.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 pt-1">
                        {estimate && (
                          <div className="p-3 bg-white border-2 border-foreground text-xs flex flex-col gap-1 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <div className="flex items-center justify-between">
                              <span className="font-black uppercase tracking-wider">Estimated Borzo Fare:</span>
                              <span className="font-display font-black text-sm text-foreground">
                                {estimate.fee}
                              </span>
                            </div>
                            <p className="text-[11px] text-foreground-muted truncate">
                              <strong>Pickup Gate:</strong> {estimate.pickup}
                            </p>
                            <p className="text-[11px] text-foreground-muted truncate">
                              <strong>Drop Gate:</strong> {estimate.drop}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={estimating}
                            onClick={handleEstimate}
                          >
                            {estimating ? "Estimating…" : "Estimate Borzo Fee"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="cta"
                            disabled={booking}
                            onClick={handleBookBorzo}
                          >
                            <Bike size={14} />
                            {booking ? "Booking Borzo…" : "Book Borzo Delivery"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-foreground-muted font-medium">
                          Rider collects directly from giver's building security gate and delivers to yours.
                        </p>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
                  Our team is reviewing this request (24-48h). You can message Reloved below anytime.
                </p>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                  Two-way chat with Reloved
                </p>
                <OrderChatThread subjectType="claim" subjectId={request.id} client="donor" defaultOpen />
              </div>
            </div>
          )}

          {request.status === "rejected" && (
            <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
              This claim was not approved. Browse the Wall for other items.
            </p>
          )}

          <Link
            to={`/items/${request.item.slug}`}
            className="text-xs font-black uppercase tracking-widest underline w-fit"
          >
            View on Wall
          </Link>
        </div>
      </div>
    </div>
  )
}
