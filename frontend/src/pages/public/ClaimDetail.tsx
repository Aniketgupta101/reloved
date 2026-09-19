import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { SafeImage } from "@/components/ui/SafeImage"
import { Button } from "@/components/ui/Button"
import { NoticeModal } from "@/components/ui/NoticeModal"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { CLAIM_DECLINE_SOFT_BODY, claimStatusLabel } from "@/lib/claimStatusCopy"
import {
  copySelfServeCourierBooking,
  openBorzo,
  openPorter,
  RIDER_GATE_NOTE,
  normalizeBorzoTrackingUrl,
  isBrokenBorzoTestTrackUrl,
} from "@/lib/logisticsLinks"

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
  borzoPaidBy?: "reloved_subsidy" | "receiver" | null
  borzoSubsidyIndex?: number | null
  courierBookedVia?: string | null
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
  const [booking, setBooking] = useState(false)
  const [copiedBooking, setCopiedBooking] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState("")
  const [savingAddress, setSavingAddress] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
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

  async function startSelfServeCourier(carrier: "borzo" | "porter") {
    if (!request) return
    const pickup = String(request.pickupLocality || "").trim()
    const drop = String(request.requesterAddress || "").trim()
    if (!drop) {
      setNotice({
        title: "Add your building first",
        body: "Save your delivery building / landmark below, then book the courier.",
        tone: "warn",
      })
      return
    }
    if (!pickup) {
      setNotice({
        title: "Pickup missing",
        body: "Giver pickup building isn't on this claim yet. Message Reloved chat and try again.",
        tone: "warn",
      })
      return
    }

    setBooking(true)
    try {
      await copySelfServeCourierBooking({
        pickupBuilding: pickup,
        dropBuilding: drop,
        itemTitle: request.item.title,
        reference: request.id.slice(0, 8),
      })
      setCopiedBooking(true)
      window.setTimeout(() => setCopiedBooking(false), 2500)
      if (carrier === "porter") openPorter()
      else openBorzo()

      await api.donor.post(`/api/donor/item-requests/${request.id}/courier/self-booked`, { carrier })
      await reloadClaim()

      setNotice({
        title: carrier === "porter" ? "Porter website opening" : "Borzo website opening",
        body: "Pickup + drop are copied to your clipboard. Paste them on the website (fields won't auto-fill). No app download required — chat Reloved if you need help with the ride.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({
        title: "Couldn't start booking",
        body: err?.message || "Try again, or copy the addresses manually below.",
        tone: "error",
      })
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
  const statusLabel = claimStatusLabel({
    status: request.status,
    handoverStage: request.handoverStage,
  })
  const images = Array.isArray(request.item.images) ? request.item.images : []
  const activeImage = images[Math.min(photoIndex, Math.max(0, images.length - 1))] || images[0]
  const imageSrc = resolveImageUrl(activeImage?.storagePath)

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 flex flex-col gap-6">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
        <div
          className="relative h-[280px] sm:h-[360px] border-b-2 border-foreground bg-[#f0eee8] touch-pan-y"
          onTouchStart={(e) => {
            touchStartX.current = e.changedTouches[0]?.clientX ?? null
          }}
          onTouchEnd={(e) => {
            if (images.length < 2 || touchStartX.current == null) return
            const endX = e.changedTouches[0]?.clientX ?? touchStartX.current
            const delta = endX - touchStartX.current
            touchStartX.current = null
            if (Math.abs(delta) < 40) return
            setPhotoIndex((i) =>
              delta < 0 ? (i + 1) % images.length : (i - 1 + images.length) % images.length,
            )
          }}
        >
          <SafeImage
            src={imageSrc}
            alt={request.item.title}
            priority
            className="absolute inset-0 w-full h-full object-contain p-4 sm:p-6"
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 bg-white border-2 border-foreground px-2 py-1 font-black"
                onClick={() => setPhotoIndex((i) => (i - 1 + images.length) % images.length)}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 bg-white border-2 border-foreground px-2 py-1 font-black"
                onClick={() => setPhotoIndex((i) => (i + 1) % images.length)}
              >
                ›
              </button>
              <p className="absolute top-3 right-3 z-10 bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-2 py-1">
                {photoIndex + 1}/{images.length}
              </p>
            </>
          )}
        </div>

        <div className="p-5 sm:p-8 flex flex-col gap-5">
          <div className="flex gap-4 items-start">
            <div className="w-16 h-16 shrink-0 border-2 border-foreground bg-white overflow-hidden">
              <SafeImage
                src={imageSrc}
                alt=""
                showSkeleton={false}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span
                className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 ${
                  approved
                    ? "bg-accent-green/20 text-accent-green"
                    : request.status === "rejected"
                      ? "bg-foreground/10 text-foreground-muted"
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
                  <p className="text-sm leading-snug font-bold text-foreground">
                    Your item has been accepted! ❤️
                    <span className="block font-medium text-foreground-muted mt-0.5">
                      {request.giverLogistics === "porter_arranged"
                        ? "Book Borzo/Porter on their website — Reloved uses your saved building; the giver never sees it."
                        : request.giverLogistics === "giver_sends"
                        ? "Confirm your delivery building if needed (area only is shared)."
                        : "You can pick it up — the giver’s pickup location is below."}
                    </span>
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
                    Item is <span className="font-black text-foreground">₹0 free</span>. Courier is arranged via Borzo/Porter website — Reloved covers pilot rides; chat Reloved if you need help.
                  </p>

                  {(request.giverLogistics === "porter_arranged" ||
                    request.giverLogistics === "giver_sends" ||
                    !request.giverLogistics) && (
                  <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-[#F7F5F0]">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Bike size={16} className="text-foreground" />
                        <span className="text-xs font-black uppercase tracking-wider font-display">
                          Book courier on the website
                        </span>
                      </div>
                      {(request.courierBookedVia || request.borzoStatus === "self_booked") && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-accent-green/30 border border-foreground">
                          Self-booked
                        </span>
                      )}
                      {request.borzoOrderName && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-white border border-foreground">
                          #{request.borzoOrderName}
                        </span>
                      )}
                    </div>

                    {request.borzoOrderId &&
                    request.borzoTrackingUrl &&
                    !isBrokenBorzoTestTrackUrl(request.borzoTrackingUrl) ? (
                      <div className="flex flex-col gap-2.5">
                        {request.borzoCourier?.name && (
                          <p className="text-xs font-medium">
                            Rider: <span className="font-bold">{request.borzoCourier.name}</span>
                            <span className="text-foreground-muted"> · track in Borzo</span>
                          </p>
                        )}
                        <a
                          href={normalizeBorzoTrackingUrl(request.borzoTrackingUrl) || request.borzoTrackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-foreground text-background font-display font-black text-xs uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                        >
                          <ExternalLink size={14} />
                          Track Rider Live on Borzo
                        </a>
                      </div>
                    ) : (request.courierBookedVia || request.borzoStatus === "self_booked") ? (
                      <p className="text-[11px] font-medium text-foreground-muted leading-relaxed">
                        You already started a self-serve booking
                        {request.courierBookedVia ? ` (${request.courierBookedVia})` : ""}. Track the rider on the Borzo or Porter website — Reloved doesn&apos;t show a live link for self-booked trips yet.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 pt-1">
                        <p className="text-[11px] text-foreground-muted font-medium leading-relaxed">
                          Addresses are ready — open the Borzo or Porter website (no app download), paste pickup + drop, and book.
                          Chat Reloved if you need help with the ride.
                        </p>

                        <div className="p-3 bg-white border-2 border-foreground text-xs flex flex-col gap-2 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pickup (giver gate)</p>
                            <p className="font-bold mt-0.5">{request.pickupLocality || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Drop (your gate)</p>
                            <p className="font-bold mt-0.5">{request.requesterAddress || "Save your building below first"}</p>
                          </div>
                          <p className="text-[10px] text-foreground-muted">{RIDER_GATE_NOTE}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="cta"
                            disabled={booking}
                            onClick={() => void startSelfServeCourier("borzo")}
                          >
                            <Bike size={14} />
                            {booking
                              ? "Opening…"
                              : copiedBooking
                                ? "Copied · Borzo website"
                                : "Open Borzo website"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={booking}
                            onClick={() => void startSelfServeCourier("porter")}
                          >
                            {booking
                              ? "Opening…"
                              : copiedBooking
                                ? "Copied · Porter website"
                                : "Open Porter website"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-foreground-muted font-medium">
                          Tap a button → addresses copy → Borzo/Porter website opens → paste pickup &amp; drop → book. Websites can&apos;t auto-fill; paste is required. No app download needed.
                        </p>
                      </div>
                    )}
                  </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground-muted font-medium">
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
            <div className="flex flex-col gap-2 border-2 border-foreground bg-accent-pink/10 px-3 py-2.5">
              <p className="text-sm text-foreground font-medium">{CLAIM_DECLINE_SOFT_BODY}</p>
              <p className="text-xs text-foreground-muted font-medium">
                This isn&apos;t a rejection of you — sometimes distance or timing just doesn&apos;t line up. Browse the Wall for something nearby.
              </p>
            </div>
          )}
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
