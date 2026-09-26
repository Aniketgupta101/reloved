import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { SafeImage } from "@/components/ui/SafeImage"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { NoticeModal } from "@/components/ui/NoticeModal"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { CLAIM_DECLINE_SOFT_BODY, claimStatusLabel } from "@/lib/claimStatusCopy"
import {
  copySelfServeCourierBooking,
  openShiprocket,
  // openBorzo,
  // openPorter,
  RIDER_GATE_NOTE,
  normalizeBorzoTrackingUrl,
  isBrokenBorzoTestTrackUrl,
  extractIndiaPincode,
  withIndiaPincode,
} from "@/lib/logisticsLinks"
import { usesExternalCourier, usesHandoverSchedule, isGatePickupLogistics } from "@shared/taxonomy"
import { ScheduleHandoverPanel } from "@/components/handover/ScheduleHandoverPanel"
import { ReceivedSuccessModal } from "@/components/handover/ReceivedSuccessModal"

interface ItemRequest {
  id: string
  status: string
  handoverStage?: string | null
  giverLogistics?: string | null
  pickupLocality?: string | null
  createdAt: string
  requesterAddress?: string | null
  note?: string | null
  pickupAddressConfirmedByGiver?: boolean
  dropAddressConfirmedByClaimer?: boolean
  proposedSlotAt?: string | null
  proposedSlotBy?: string | null
  agreedSlotAt?: string | null
  opsBookingStatus?: string | null
  deliveryStatus?: "awaiting_pickup" | "rider_dispatched" | "picked_up" | "delivered" | "failed" | null
  borzoOrderId?: number | null
  borzoOrderName?: string | null
  borzoStatus?: string | null
  borzoDeliveryStatus?: string | null
  borzoTrackingUrl?: string | null
  borzoPaidBy?: "reloved_subsidy" | "receiver" | null
  borzoSubsidyIndex?: number | null
  courierBookedVia?: string | null
  shiprocketOrderId?: number | string | null
  shiprocketStatus?: string | null
  shiprocketAwb?: string | null
  shiprocketTrackingUrl?: string | null
  shiprocketPaymentMethod?: string | null
  shadowfaxOrderId?: string | null
  shadowfaxStatus?: string | null
  shadowfaxAwb?: string | null
  shadowfaxTrackingUrl?: string | null
  shadowfaxPaymentMethod?: string | null
  borzoCourier?: {
    courierId?: number
    name?: string
    surname?: string
    phone?: string
    photoUrl?: string
  } | null
  receivedPhotoUrl?: string | null
  receivedPhotoNote?: string | null
  receivedPhotoAt?: string | null
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
  const [deliveryPincode, setDeliveryPincode] = useState("")
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
  const [cancelling, setCancelling] = useState(false)
  const [showReceivedSuccess, setShowReceivedSuccess] = useState(false)
  const [uploadingReceivedPhoto, setUploadingReceivedPhoto] = useState(false)

  async function reloadClaim() {
    if (!id) return
    const data = await api.donor.get<{ request?: ItemRequest }>(`/api/donor/item-requests/${id}`)
    if (data.request) setRequest(data.request)
  }

  async function startSelfServeCourier(carrier: "shiprocket" | "borzo" | "porter" = "shiprocket") {
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
        body: "Dropper pickup building isn't on this claim yet. Message Reloved chat and try again.",
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
      openShiprocket()

      await api.donor.post(`/api/donor/item-requests/${request.id}/courier/self-booked`, { carrier })
      await reloadClaim()

      setNotice({
        title: "Shiprocket opening",
        body: "Pickup + drop are copied. Paste into Shiprocket Quick / Instant Delivery (manual book).",
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

  async function bookShiprocketApi() {
    // Payment / API booking paused — always use manual Open Shiprocket.
    void startSelfServeCourier("shiprocket")
  }

  async function bookShadowfaxApi() {
    void startSelfServeCourier("shiprocket")
  }

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login", { replace: true, state: { redirect: `/account/claims/${id}` } })
      return
    }
    if (!id) return
    setLoading(true)
    setError(null)
    api.donor
      .get<{
        role?: string
        giftHref?: string
        request?: ItemRequest
        error?: string
      }>(`/api/donor/item-requests/${id}`)
      .then((data) => {
        if (data.role === "giver" && data.giftHref) {
          navigate(data.giftHref, { replace: true })
          return
        }
        if (data.request) {
          setRequest(data.request)
          return
        }
        setError("This claim wasn't found on your account.")
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
        <p className="text-sm text-foreground-muted">
          If you just dropped an item, open your profile → Drops. Claims are only for items you requested from the Wall.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link to="/account?tab=giving" className="text-sm font-black uppercase tracking-widest underline">
            My drops
          </Link>
          <Link to="/account" className="text-sm font-black uppercase tracking-widest underline">
            Back to account
          </Link>
          <Link to="/drop" className="text-sm font-black uppercase tracking-widest underline">
            Browse the Wall
          </Link>
          <Link to="/give" className="text-sm font-black uppercase tracking-widest underline">
            Drop an item
          </Link>
        </div>
      </div>
    )
  }

  const approved = request.status === "approved"
  const stage = String(request.handoverStage || "")
  const delivery = String(request.deliveryStatus || "")
  const hasActiveCourier =
    Boolean(request.borzoOrderId) && String(request.borzoStatus || "") !== "canceled"
  const canCancelClaim =
    (request.status === "pending" || request.status === "approved") &&
    stage !== "handed_over" &&
    stage !== "received" &&
    !["rider_dispatched", "picked_up", "delivered"].includes(delivery) &&
    !hasActiveCourier
  const statusLabel = claimStatusLabel({
    status: request.status,
    handoverStage: request.handoverStage,
  })
  const images = Array.isArray(request.item.images) ? request.item.images : []
  const activeImage = images[Math.min(photoIndex, Math.max(0, images.length - 1))] || images[0]
  const imageSrc = resolveImageUrl(activeImage?.storagePath)

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 flex flex-col gap-5 sm:gap-6 min-w-0">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border border-foreground sm:border-2 shadow-[3px_3px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden min-w-0">
        <div
          className="relative h-[240px] sm:h-[360px] border-b border-foreground sm:border-b-2 bg-[#f0eee8] touch-pan-y"
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

        <div className="p-4 sm:p-8 flex flex-col gap-4 sm:gap-5 min-w-0">
          <div className="flex gap-3 sm:gap-4 items-start min-w-0">
            <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 border border-foreground sm:border-2 bg-white overflow-hidden">
              <SafeImage
                src={imageSrc}
                alt=""
                showSkeleton={false}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span
                className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit max-w-full border border-foreground/20 break-words ${
                  approved
                    ? "bg-accent-green/20 text-accent-green"
                    : request.status === "rejected" || request.status === "cancelled"
                      ? "bg-foreground/10 text-foreground-muted"
                      : "bg-accent-pink/10 text-accent-pink"
                }`}
              >
                {statusLabel}
              </span>
              <h1 className="text-xl sm:text-3xl font-display font-black uppercase tracking-tight leading-tight text-balance break-words">
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
                      {usesExternalCourier(request.giverLogistics)
                        ? "Confirm your delivery building. The dropper will share when they’re free — then confirm you’ll be present (at least 2 days ahead). Reloved books the courier."
                        : isGatePickupLogistics(request.giverLogistics)
                        ? "The dropper will share a preferred pickup time at their building gate — then confirm you’ll collect. No Reloved courier."
                        : request.giverLogistics === "personal_driver"
                        ? "Confirm your delivery building if needed. The dropper shares a handover time — their personal driver brings it."
                        : request.giverLogistics === "giver_sends"
                        ? "Confirm your delivery building if needed. The dropper shares a handover time — they send it themselves."
                        : "Handover details will show here once logistics are confirmed. Chat Reloved if you need help."}
                    </span>
                  </p>

                  {isGatePickupLogistics(request.giverLogistics) && request.pickupLocality && (
                    <div className="p-4 border-2 border-foreground bg-[#F7F5F0]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Pickup location</p>
                      <p className="text-sm font-bold mt-1">{request.pickupLocality}</p>
                    </div>
                  )}

                  {usesHandoverSchedule(request.giverLogistics) && (
                    <ScheduleHandoverPanel
                      role="claimer"
                      claim={request}
                      dropHint={request.requesterAddress}
                      pickupHint={request.pickupLocality}
                      onUpdated={() => reloadClaim()}
                      onError={(message) => setNotice({ title: "Couldn't update", body: message, tone: "error" })}
                    />
                  )}

                  {/* Address-only form kept for legacy claims without schedule UI */}
                  {!usesHandoverSchedule(request.giverLogistics) &&
                    (request.giverLogistics === "giver_sends" ||
                      request.giverLogistics === "personal_driver") &&
                    request.handoverStage !== "received" && (
                    <div className="flex flex-col gap-2 p-4 border-2 border-foreground">
                      <label className="text-xs font-black uppercase tracking-widest">Delivery building / landmark</label>
                      {request.requesterAddress && extractIndiaPincode(request.requesterAddress) ? (
                        <p className="text-sm font-medium">{request.requesterAddress}</p>
                      ) : (
                        <>
                          {request.requesterAddress && !extractIndiaPincode(request.requesterAddress) && (
                            <p className="text-xs font-bold text-accent-red leading-snug">
                              Your saved building is missing a 6-digit pincode. Enter it in the pincode box below, then tap Update.
                            </p>
                          )}
                          <AddressAutocomplete
                            value={deliveryAddress || request.requesterAddress || ""}
                            onChange={setDeliveryAddress}
                            onSelect={(val, _coords, postcode) => {
                              setDeliveryAddress(val)
                              if (postcode) {
                                const pin = String(postcode).replace(/\D/g, "").slice(0, 6)
                                if (pin.length === 6) setDeliveryPincode(pin)
                              }
                            }}
                            placeholder="Building or landmark — no flat or wing"
                            className="rounded-none border-2 border-foreground"
                          />
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                              Pincode *
                            </label>
                            <Input
                              inputMode="numeric"
                              maxLength={6}
                              value={deliveryPincode}
                              onChange={(e) => setDeliveryPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              placeholder="e.g. 400053"
                              className="rounded-none border-2 border-foreground h-11"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="cta"
                            className="w-full"
                            disabled={
                              savingAddress ||
                              (deliveryAddress || request.requesterAddress || "").trim().length < 2 ||
                              !(
                                extractIndiaPincode(deliveryAddress || request.requesterAddress || "") ||
                                deliveryPincode.length === 6
                              )
                            }
                            onClick={async () => {
                              const building = (deliveryAddress || request.requesterAddress || "").trim()
                              const merged = withIndiaPincode(building, deliveryPincode)
                              if (!extractIndiaPincode(merged)) {
                                setNotice({
                                  title: "Pincode required",
                                  body: "Enter your 6-digit pincode (e.g. 400053), then update.",
                                  tone: "warn",
                                })
                                return
                              }
                              setSavingAddress(true)
                              try {
                                await api.donor.post(`/api/donor/item-requests/${id}/delivery-address`, {
                                  address: merged,
                                })
                                setDeliveryPincode("")
                                await reloadClaim()
                              } catch (err: any) {
                                setNotice({ title: "Couldn't save", body: err?.message || "Couldn't save address", tone: "error" })
                              } finally {
                                setSavingAddress(false)
                              }
                            }}
                          >
                            {savingAddress ? "Saving..." : request.requesterAddress ? "Update address" : "Share address"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}

                  {request.handoverStage === "handed_over" && (
                    <Button
                      type="button"
                      variant="cta"
                      className="w-full"
                      disabled={confirming}
                      onClick={async () => {
                        setConfirming(true)
                        try {
                          await api.donor.post(`/api/donor/item-requests/${id}/received`, {})
                          await reloadClaim()
                          // Both sides done (dropper Handed over + claimer Received) → celebrate.
                          setShowReceivedSuccess(true)
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
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-black uppercase tracking-widest text-accent-pink">RELOVED ❤️</p>
                        <p className="text-sm font-medium text-foreground-muted">
                          Congratulations, you have benefited from someone&apos;s goodness. Don&apos;t forget to pay it forward.
                        </p>
                      </div>
                      {request.receivedPhotoUrl ? (
                        <div className="border-2 border-foreground bg-[#F7F5F0] overflow-hidden">
                          <img
                            src={resolveImageUrl(request.receivedPhotoUrl)}
                            alt="Your Reloved moment"
                            className="w-full max-h-56 object-contain"
                          />
                          {request.receivedPhotoNote && (
                            <p className="text-xs font-medium p-3 border-t-2 border-foreground">
                              {request.receivedPhotoNote}
                            </p>
                          )}
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowReceivedSuccess(true)}
                        >
                          Share a Reloved photo
                        </Button>
                      )}
                    </div>
                  )}

                  {usesExternalCourier(request.giverLogistics) ? (
                    <p className="text-sm font-medium text-foreground-muted">
                      Item is <span className="font-black text-foreground">₹0 free</span>. Reloved books the courier after you agree a time — no self-booking.
                    </p>
                  ) : request.giverLogistics === "receiver_collects" ? (
                    <p className="text-sm font-medium text-foreground-muted">
                      Item is <span className="font-black text-foreground">₹0 free</span>. Collect from the dropper’s building gate — no courier booking needed.
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-foreground-muted">
                      Item is <span className="font-black text-foreground">₹0 free</span>. The dropper will send it their way — no courier booking required.
                    </p>
                  )}

                  {/* Self-serve courier buttons removed — Reloved ops books manually. */}
                  {false && usesExternalCourier(request.giverLogistics) &&
                    Boolean(request.borzoOrderId || request.courierBookedVia) && (
                  <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-[#F7F5F0]">
                    <p className="text-sm font-medium text-foreground-muted">Courier booking is handled by Reloved.</p>
                  </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-foreground-muted font-medium">
                  Waiting for the dropper to respond.
                  You’ll be notified when they accept or decline.
                </p>
              )}

              <DualChatOptions
                relovedType="claim"
                relovedSubjectId={request.id}
                peerClaimId={request.id}
                peerEnabled={approved}
                peerLabel="Chat with dropper"
              />

              {canCancelClaim && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={cancelling}
                  onClick={() => {
                    setNotice({
                      title: "Cancel this claim?",
                      body: approved
                        ? "This will cancel your match. The item goes back on the Wall for someone else."
                        : "This will withdraw your request. The item stays on the Wall for others.",
                      tone: "warn",
                      primaryLabel: "Cancel claim",
                      secondaryLabel: "Keep claim",
                      onSecondary: () => setNotice(null),
                      onPrimary: () => {
                        void (async () => {
                          setCancelling(true)
                          setNotice(null)
                          try {
                            await api.donor.post(`/api/donor/item-requests/${request.id}/cancel`, {})
                            await reloadClaim()
                            setNotice({
                              title: "Claim cancelled",
                              body: "Done. The item is available on the Wall again.",
                              tone: "ok",
                              primaryLabel: "Back to Claiming",
                              onPrimary: () => navigate("/account?tab=claiming"),
                            })
                          } catch (err: any) {
                            setNotice({
                              title: "Couldn't cancel",
                              body: err?.message || "Couldn't cancel claim",
                              tone: "error",
                            })
                          } finally {
                            setCancelling(false)
                          }
                        })()
                      },
                    })
                  }}
                >
                  {cancelling ? "Cancelling…" : "Cancel claim"}
                </Button>
              )}
            </div>
          )}

          {request.status === "cancelled" && (
            <div className="flex flex-col gap-2 border-2 border-foreground bg-surface-muted px-3 py-2.5">
              <p className="text-sm text-foreground font-medium">You cancelled this claim. The item is back on the Wall.</p>
              <Link to="/drop" className="text-xs font-black uppercase tracking-widest underline">
                Browse the Wall
              </Link>
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

      {showReceivedSuccess && request && (
        <ReceivedSuccessModal
          itemTitle={request.item.title}
          uploading={uploadingReceivedPhoto}
          onClose={() => setShowReceivedSuccess(false)}
          onSkip={() => setShowReceivedSuccess(false)}
          onUpload={async (file, note) => {
            if (!id) return
            setUploadingReceivedPhoto(true)
            try {
              const form = new FormData()
              form.append("photo", file)
              if (note) form.append("note", note)
              await api.donor.postForm(`/api/donor/item-requests/${id}/received-photo`, form)
              await reloadClaim()
              setShowReceivedSuccess(false)
              setNotice({
                title: "Thanks for sharing",
                body: "Your Reloved moment is saved. Feel free to share it on Instagram too.",
                tone: "ok",
              })
            } finally {
              setUploadingReceivedPhoto(false)
            }
          }}
        />
      )}
    </div>
  )
}
