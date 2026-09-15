import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { openPorter } from "@/lib/logisticsLinks"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { SafeImage } from "@/components/ui/SafeImage"
import { Button } from "@/components/ui/Button"
import { NoticeModal } from "@/components/ui/NoticeModal"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"

interface ItemRequest {
  id: string
  status: string
  handoverStage?: string | null
  giverLogistics?: string | null
  pickupLocality?: string | null
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
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [savingAddress, setSavingAddress] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<{
    title: string
    body: string
    tone?: "ok" | "warn" | "error"
    primaryLabel?: string
    onPrimary?: () => void
    secondaryLabel?: string
    onSecondary?: () => void
  } | null>(null)

  async function reloadClaim() {
    if (!id) return
    const { requests } = await api.donor.get<{ requests: ItemRequest[] }>("/api/donor/item-requests")
    const found = (requests || []).find((r) => r.id === id) || null
    if (found) setRequest(found)
  }

  async function handleEstimate() {
    if (!id) return
    setEstimating(true)
    try {
      const res = await api.donor.post<{
        ok: boolean
        paymentAmount: string | null
        deliveryFeeAmount: string | null
        pickupArea?: string
        dropArea?: string
        pickupAddress?: string
        dropAddress?: string
        addressHidden?: boolean
      }>(`/api/donor/item-requests/${id}/borzo/estimate`)
      const fee = res.paymentAmount || res.deliveryFeeAmount || "Calculated"
      setEstimate({
        fee: `₹${fee}`,
        pickup: res.pickupArea || "Giver area (hidden)",
        drop: res.dropArea || "Your area (hidden)",
      })
    } catch (err: any) {
      setNotice({ title: "Estimate failed", body: err?.message || "Failed to estimate delivery fee", tone: "error" })
    } finally {
      setEstimating(false)
    }
  }

  function handleBookBorzo() {
    if (!id || !request) return
    setNotice({
      title: "Book Borzo?",
      body: `Book delivery for "${request.item.title}"?\n\nA rider will collect from the giver's building main gate security and deliver to your gate.\n\nYou (the receiver) pay Borzo once (typically ₹40–80). Reloved takes no cut.`,
      tone: "warn",
      primaryLabel: "Confirm book",
      onPrimary: () => void runBookBorzo(),
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
    })
  }

  async function runBookBorzo() {
    if (!id) return
    setBooking(true)
    try {
      const res = await api.donor.post<{ ok: boolean; order: any; request: any }>(
        `/api/donor/item-requests/${id}/borzo/book`
      )
      await reloadClaim()
      setNotice({
        title: "Borzo booked",
        body: `Order #${res.order?.orderName || res.order?.orderId} created. Rider will be dispatched.`,
        tone: "ok",
        primaryLabel: res.order?.trackingUrl ? "Track rider" : "Done",
        onPrimary: res.order?.trackingUrl
          ? () => window.open(res.order.trackingUrl, "_blank", "noopener,noreferrer")
          : undefined,
      })
    } catch (err: any) {
      setNotice({ title: "Booking failed", body: err?.message || "Failed to book Borzo order", tone: "error" })
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
    request.handoverStage === "received" || request.status === "reloved"
      ? "Reloved"
      : request.handoverStage === "handed_over"
        ? "Delivered — confirm received"
        : request.status === "pending"
          ? "Awaiting giver"
          : request.status === "approved"
            ? "Matched"
            : request.status.replace(/_/g, " ")
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
                        : "bg-accent-pink/10 text-accent-pink"
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
                  <p className="text-sm leading-snug font-bold text-foreground border-2 border-foreground bg-accent-pink/10 px-3 py-2.5">
                    Your item has been accepted! ❤️
                    {request.giverLogistics === "porter_arranged"
                      ? " You book Borzo/Porter — Reloved uses your saved building; the giver never sees it."
                      : request.giverLogistics === "giver_sends"
                      ? " Confirm your delivery building if needed (area only is shared)."
                      : " You can pick it up — the giver’s pickup location is below."}
                  </p>

                  {request.giverLogistics === "receiver_collects" && request.pickupLocality && (
                    <div className="p-4 border-2 border-foreground bg-[#F7F5F0]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pickup location</p>
                      <p className="text-sm font-bold mt-1">{request.pickupLocality}</p>
                    </div>
                  )}

                  {(request.giverLogistics === "giver_sends" || request.giverLogistics === "porter_arranged") &&
                    request.handoverStage !== "received" && (
                    <div className="flex flex-col gap-2 p-4 border-2 border-foreground">
                      <label className="text-xs font-black uppercase tracking-widest">Delivery building / landmark</label>
                      {request.requesterAddress ? (
                        <p className="text-sm font-medium">{request.requesterAddress}</p>
                      ) : (
                        <>
                          <AddressAutocomplete
                            value={deliveryAddress}
                            onChange={setDeliveryAddress}
                            placeholder="Search building or landmark"
                            className="rounded-none border-2 border-foreground"
                          />
                          <Button
                            type="button"
                            variant="cta"
                            disabled={savingAddress || deliveryAddress.trim().length < 2}
                            onClick={async () => {
                              setSavingAddress(true)
                              try {
                                await api.donor.post(`/api/donor/item-requests/${id}/delivery-address`, {
                                  address: deliveryAddress,
                                })
                                await reloadClaim()
                              } catch (err: any) {
                                setNotice({ title: "Couldn't save", body: err?.message || "Couldn't save address", tone: "error" })
                              } finally {
                                setSavingAddress(false)
                              }
                            }}
                          >
                            {savingAddress ? "Saving..." : "Share address"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {request.handoverStage === "handed_over" && (
                    <Button
                      type="button"
                      variant="cta"
                      disabled={confirming}
                      onClick={async () => {
                        setConfirming(true)
                        try {
                          await api.donor.post(`/api/donor/item-requests/${id}/received`, {})
                          await reloadClaim()
                        } catch (err: any) {
                          setNotice({ title: "Couldn't confirm", body: err?.message || "Couldn't confirm received", tone: "error" })
                        } finally {
                          setConfirming(false)
                        }
                      }}
                    >
                      {confirming ? "Confirming..." : "Received"}
                    </Button>
                  )}
                  {request.handoverStage === "received" && (
                    <p className="text-sm font-black uppercase tracking-widest text-accent-pink">RELOVED ❤️</p>
                  )}

                  <p className="text-sm font-medium text-foreground-muted">
                    Item is <span className="font-black text-foreground">Rs 0 free</span> - including delivery.
                  </p>

                  {request.giverLogistics === "porter_arranged" && (
                  <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-[#F7F5F0]">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Bike size={16} className="text-foreground" />
                        <span className="text-xs font-black uppercase tracking-wider font-display">
                          External courier (Porter / Borzo) — Reloved does not deliver
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
                            <span className="text-foreground-muted"> · contact via Borzo tracking (phone masked)</span>
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
                              <strong>Pickup area:</strong> {estimate.pickup}
                            </p>
                            <p className="text-[11px] text-foreground-muted truncate">
                              <strong>Drop area:</strong> {estimate.drop}
                            </p>
                            <p className="text-[10px] text-foreground-muted">Exact buildings stay private — only Borzo sees the gate.</p>
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
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={openPorter}
                            title="Opens Porter app on mobile if installed"
                          >
                            Book Porter
                          </Button>
                        </div>
                        <p className="text-[11px] text-foreground-muted font-medium">
                          After Accept, you book here. Reloved uses your saved building — the giver never sees it. Rider collects from their gate to yours. You pay Borzo once (~₹40–80).
                        </p>
                      </div>
                    )}
                  </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
                  Waiting for the giver to Accept or Decline. You’ll be notified as soon as they decide.
                </p>
              )}

              <DualChatOptions
                relovedType="claim"
                relovedSubjectId={request.id}
                peerClaimId={request.id}
                peerEnabled={approved}
                peerLabel="Chat with giver"
              />
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
