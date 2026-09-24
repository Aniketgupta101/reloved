import { useParams, useLocation, useNavigate, Link } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { SafeImage } from "@/components/ui/SafeImage"
import { LegalAccept, LegalReadMore } from "@/components/ui/LegalAccept"
import { privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"
import { ArrowLeft, ShieldCheck, HeartHandshake, X, Clock, LifeBuoy, CheckCircle2 } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { wallStatusTagLabel } from "@/lib/wallStatusLabels"

export function ItemDetail() {
  const { slug } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [item, setItem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showPartnerModal, setShowPartnerModal] = useState(false)
  const [showTakeModal, setShowTakeModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [showHelpModal, setShowHelpModal] = useState(false)
  const [weeklyUsed, setWeeklyUsed] = useState(0)
  const [weeklyLimit, setWeeklyLimit] = useState(2)
  const [resetsAt, setResetsAt] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  async function fetchItem() {
    setLoading(true)
    try {
      const path = `/api/items/${slug}`
      const { item } = getDonorToken()
        ? await api.donor.get<{ item: any }>(path)
        : await api.get<{ item: any }>(path)
      setItem(item)
    } catch (e) {
      console.error(e)
      setItem(null)
    }
    setLoading(false)
  }

  async function fetchQuota() {
    if (!getDonorToken()) return
    try {
      const data = await api.donor.get<{
        weeklyUsed?: number
        weeklyLimit?: number
        monthlyUsed?: number
        monthlyLimit?: number
        resetsAt?: string
      }>("/api/donor/item-requests")
      setWeeklyUsed(data.weeklyUsed ?? data.monthlyUsed ?? 0)
      setWeeklyLimit(data.weeklyLimit ?? data.monthlyLimit ?? 2)
      setResetsAt(data.resetsAt ?? null)
    } catch {
      // ignore - guest / expired
    }
  }

  useEffect(() => {
    if (slug) fetchItem()
  }, [slug])

  useEffect(() => {
    if (item?.title) {
      document.title = `reloved | ${item.title}`
    }
  }, [item?.title])

  useEffect(() => {
    fetchQuota()
  }, [])

  useEffect(() => {
    if (item?.slug) {
      track(AnalyticsEvent.itemViewed, {
        slug: item.slug,
        title: item.title,
        category: item.category,
        status: item.publicStatus,
      })
    }
  }, [item?.slug])

  function openTakeFlow() {
    track(AnalyticsEvent.claimStarted, {
      slug: item?.slug || slug || "",
      logged_in: Boolean(getDonorToken()),
    })
    if (item?.isOwnListing) return
    if (!getDonorToken()) {
      navigate(`/account/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    void (async () => {
      try {
        const { profile } = await api.donor.get<{
          profile: { onboardedAt: string | null } | null
        }>("/api/donor/profile")
        if (!profile?.onboardedAt) {
          navigate(`/account/onboarding?redirect=${encodeURIComponent(location.pathname)}`)
          return
        }
      } catch {
        navigate(`/account/login?redirect=${encodeURIComponent(location.pathname)}`)
        return
      }
      if (weeklyUsed >= weeklyLimit) return
      setShowTakeModal(true)
    })()
  }

  if (loading) {
    return <div className="w-full max-w-5xl mx-auto px-4 py-32 animate-pulse h-96 bg-surface-muted border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]" />
  }

  if (!item) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-16 sm:py-24 text-center bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase">Item not found.</h1>
        <p className="text-foreground-muted mt-4 mb-8 font-medium">This item may have been removed or is no longer available.</p>
        <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "item_not_found" })}>
          <Button className="font-bold uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">Back to the Wall</Button>
        </Link>
      </div>
    )
  }

  const atClaimLimit = getDonorToken() ? weeklyUsed >= weeklyLimit : false
  const isOwnListing = Boolean(item?.isOwnListing)
  const takeable = item.publicStatus === "available" && !atClaimLimit && !isOwnListing
  const remainingClaims = Math.max(0, weeklyLimit - weeklyUsed)
  const images = Array.isArray(item.images) ? item.images : []
  const activeImage = images[Math.min(photoIndex, Math.max(0, images.length - 1))] || images[0]
  const logistics = String(item.giverLogistics || "")
  const logisticsLabel =
    logistics === "porter_arranged"
      ? "Giver prefers courier (gate to gate · item stays free)"
      : logistics === "giver_sends"
        ? "Giver can send within ~3 km (area-level only)"
        : logistics === "personal_driver"
          ? "Giver's personal driver will deliver"
          : logistics === "receiver_collects"
            ? "Collect from giver's building gate"
            : null

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "item_detail_back" })} className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-accent-pink mb-6 sm:mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to the Wall
      </Link>

      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16">
        {/* Gallery */}
        <div
          className="w-full lg:w-1/2 overflow-hidden aspect-square relative border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white touch-pan-y min-w-0"
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
            src={resolveImageUrl(activeImage?.storagePath, { full: true })}
            alt={item.title}
            className="w-full h-full object-contain bg-white"
          />
          {images.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 bg-white border-2 border-foreground px-2 py-1 font-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                onClick={() => setPhotoIndex((i) => (i - 1 + images.length) % images.length)}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next photo"
                className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 bg-white border-2 border-foreground px-2 py-1 font-black shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                onClick={() => setPhotoIndex((i) => (i + 1) % images.length)}
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {images.map((_: unknown, idx: number) => (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Photo ${idx + 1}`}
                    onClick={() => setPhotoIndex(idx)}
                    className={`w-2.5 h-2.5 border-2 border-foreground ${idx === photoIndex ? "bg-accent-pink" : "bg-white"}`}
                  />
                ))}
              </div>
              <p className="absolute bottom-12 sm:top-3 sm:bottom-auto right-3 bg-foreground text-background text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground">
                {photoIndex + 1}/{images.length} · swipe
              </p>
            </>
          )}
          <div className="absolute top-3 left-3 sm:top-6 sm:left-6 bg-white border-2 border-foreground px-2.5 sm:px-4 py-1.5 sm:py-2 font-bold uppercase tracking-widest text-[10px] sm:text-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            {wallStatusTagLabel(item.publicStatus)}
          </div>
        </div>

        {/* Details */}
        <div className="w-full lg:w-1/2 flex flex-col items-start gap-6 sm:gap-8 min-w-0">
          <div className="w-full min-w-0">
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mb-4">
              {(() => {
                const status = (item.publicStatus || "available").toLowerCase()
                const label = wallStatusTagLabel(status)
                if (status === "being_matched") {
                  return (
                    <span className="text-xs sm:text-sm font-black text-foreground bg-accent-yellow px-3 py-1 uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      {label}
                    </span>
                  )
                }
                if (status === "claimed" || status === "reloved") {
                  return (
                    <span className="text-xs sm:text-sm font-black text-accent-pink bg-white px-3 py-1 uppercase tracking-widest border-2 border-accent-pink shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      {label}
                    </span>
                  )
                }
                return (
                  <span className="text-xs sm:text-sm font-black text-accent-red bg-white px-3 py-1 uppercase tracking-widest border-2 border-accent-red shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    Available
                  </span>
                )
              })()}
              <span className="text-xs sm:text-sm text-foreground-muted font-black uppercase tracking-widest">{item.category}</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black leading-tight uppercase tracking-tight break-words">{item.title}</h1>
          </div>

          <div className="w-full border-t-2 border-b-2 border-foreground/10 py-6 grid grid-cols-2 gap-y-6">
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-foreground-muted mb-1">Condition</p>
              <p className="font-bold">{item.condition}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-foreground-muted mb-1">Locality</p>
              <p className="font-bold">{item.locality}</p>
            </div>
            {item.size && (
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-foreground-muted mb-1">Size</p>
                <p className="font-bold">{item.size}</p>
              </div>
            )}
            {item.gender && (
              <div>
                <p className="text-xs uppercase tracking-widest font-black text-foreground-muted mb-1">For</p>
                <p className="font-bold capitalize">{item.gender === "kids" ? "Kids" : item.gender}</p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-widest font-black text-foreground-muted mb-1">Quantity</p>
              <p className="font-bold">
                {item.publicStatus === "available"
                  ? `${item.quantity} available`
                  : item.publicStatus === "being_matched" || item.publicStatus === "claimed"
                    ? "Matched"
                    : item.publicStatus === "reloved"
                      ? "Already reloved"
                      : "Not available"}
              </p>
            </div>
          </div>

          {logisticsLabel && (
            <div className="w-full border-2 border-foreground bg-accent-green/15 px-4 py-3 text-sm font-bold">
              Delivery preference: {logisticsLabel}
            </div>
          )}

          <div>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap font-medium">{item.description}</p>
          </div>

          <div className="w-full flex flex-col gap-4 mt-auto pt-8">
            {getDonorToken() && (
              <div className="text-xs font-bold border-2 border-foreground bg-surface-muted px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="uppercase tracking-widest">
                  Claims this week: {weeklyUsed}/{weeklyLimit}
                  {remainingClaims > 0 ? ` · ${remainingClaims} left` : " · limit reached"}
                </span>
                {resetsAt && (
                  <span className="uppercase tracking-widest text-foreground-muted">
                    Resets {new Date(resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            )}
            <Button
              variant="cta"
              className="w-full min-h-12 sm:h-14 text-xs sm:text-base font-black uppercase tracking-wide sm:tracking-widest disabled:opacity-50 disabled:hover:shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:disabled:hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] disabled:hover:translate-x-0 disabled:hover:translate-y-0"
              onClick={openTakeFlow}
              disabled={!takeable}
            >
              {isOwnListing
                ? "This is your listing"
                : atClaimLimit && item.publicStatus === "available"
                  ? "Weekly claim limit reached"
                  : item.publicStatus === "available"
                    ? "Claim this item"
                    : item.publicStatus === "being_matched" || item.publicStatus === "claimed"
                      ? "Already matched"
                      : "No longer available"}
            </Button>
            {isOwnListing && (
              <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest">
                You gave this item — you can&apos;t claim your own listing.
              </p>
            )}
            {!isOwnListing &&
              (item.publicStatus === "being_matched" || item.publicStatus === "claimed") && (
                <p className="text-sm font-bold text-foreground border-2 border-foreground bg-accent-pink/15 px-3 py-2">
                  This item has already been matched. You can&apos;t claim it.
                </p>
              )}

            <Button
              className="w-full h-11 text-xs font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] bg-accent-green text-foreground hover:bg-accent-green"
              onClick={() => setShowHelpModal(true)}
            >
              <LifeBuoy size={14} className="mr-1.5" /> Need help?
            </Button>

            <div className="text-xs text-foreground-muted max-w-md leading-relaxed border-l-2 border-foreground pl-3 py-1 font-medium">
              <span className="font-bold text-foreground block uppercase tracking-widest mb-1">How claiming works:</span>
              Sign in and send a request. The giver gets a notification and can Accept or Decline. If they Accept, you&apos;re Matched and arrange handover together (collect, they send, or Reloved-booked courier).
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16 pt-6 border-t-2 border-foreground/10 text-center">
        <button
          onClick={() => setShowPartnerModal(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-foreground-muted hover:text-foreground underline underline-offset-4"
        >
          <HeartHandshake size={14} /> Are you an NGO or delivery partner?
        </button>
      </div>

      {showTakeModal && (
        <TakeItemModal
          item={item}
          onClose={() => setShowTakeModal(false)}
          onSuccess={() => {
            setShowTakeModal(false)
            setShowSuccessModal(true)
            fetchItem()
            fetchQuota()
          }}
        />
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm overflow-x-hidden">
          <div className="bg-white border-2 border-foreground w-full max-w-md p-4 sm:p-8 shadow-[6px_6px_0px_rgba(0,0,0,1)] sm:shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col items-center gap-4 text-center max-h-[90dvh] overflow-y-auto overflow-x-hidden box-border">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-3 right-3 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]"
            >
              <X size={20} />
            </button>
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-accent-green border-2 border-foreground flex items-center justify-center text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Clock size={28} />
            </div>
            <h3 className="text-xl sm:text-2xl font-display font-black uppercase px-8">Request sent!</h3>
            <p className="text-sm font-medium text-foreground/80 leading-relaxed">
              Your request has been received. We will notify you once there is a response.
            </p>
            <div className="w-full text-left bg-surface-muted border-2 border-foreground p-3 sm:p-4 text-xs font-medium leading-relaxed box-border">
              <p className="font-black uppercase tracking-wide mb-2">If handover uses courier</p>
              <p>
                The item stays <strong>₹0 free</strong>. Reloved books an <strong>external courier</strong> gate to gate after you both agree timing.
                Early rides: Reloved pays. After that, you may pay courier COD (~₹40–80).
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full min-w-0 pt-1">
              <Link
                to="/account"
                className="block w-full min-w-0"
                onClick={() => track(AnalyticsEvent.navAccount, { source: "claim_success" })}
              >
                <Button className="w-full max-w-full text-[11px] sm:text-xs tracking-wide">
                  <span className="sm:hidden">My requests</span>
                  <span className="hidden sm:inline">View my requests</span>
                </Button>
              </Link>
              <Button
                onClick={() => setShowSuccessModal(false)}
                variant="secondary"
                className="w-full max-w-full text-[11px] sm:text-xs tracking-wide"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && <HelpModal item={item} onClose={() => setShowHelpModal(false)} />}

      {/* Explanatory Partner Allocation Modal */}
      {showPartnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border-2 border-foreground max-w-xl w-full p-6 md:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-6">
            <button
              onClick={() => setShowPartnerModal(false)}
              className="absolute top-4 right-4 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-accent-pink border-2 border-foreground flex items-center justify-center text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <HeartHandshake size={28} />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block">For organisations</span>
                <h3 className="text-2xl font-display font-black uppercase">Partner &amp; Delivery Orgs</h3>
              </div>
            </div>

            <div className="space-y-4 text-sm font-medium text-foreground/80 leading-relaxed bg-surface-muted p-4 border-2 border-foreground">
              <p>
                <strong className="text-foreground">This is separate from claiming an item yourself.</strong> Individuals request items on this page — the <strong className="text-foreground">giver Accepts or Declines</strong> each request.
              </p>
              <p>
                Community partners are <strong className="text-foreground">verified NGOs, schools, shelters, and delivery organisations</strong> that help us run bulk distribution and logistics across Mumbai, on top of individual requests.
              </p>
              <div className="flex items-center gap-2 font-bold text-foreground pt-2 border-t border-foreground/10">
                <ShieldCheck className="text-accent-green" size={20} />
                <span>Verified Organisations &bull; Bulk Distribution &bull; Logistics Support</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link to="/partner" className="flex-1" onClick={() => { setShowPartnerModal(false); track(AnalyticsEvent.partnerApplyCta, { source: "item_detail" }) }}>
                <Button variant="cta" className="w-full h-12 text-sm font-black uppercase tracking-widest">
                  Apply as a Partner Org
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => setShowPartnerModal(false)}
                className="flex-1 h-12 text-sm font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
              >
                Close Window
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TakeItemModal({ item, onClose, onSuccess }: { item: any; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [note, setNote] = useState("")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [personalUse, setPersonalUse] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  useEffect(() => {
    api.donor
      .get<{ profile: { name: string | null; phone: string | null; email?: string | null; address: string | null; latitude?: number | null; longitude?: number | null } | null }>("/api/donor/profile")
      .then(({ profile }) => {
        if (profile) {
          setName(profile.name || "")
          setPhone(profile.phone || "")
          setAddress(profile.address || "")
          if (profile.latitude != null && profile.longitude != null) {
            setCoords({ lat: Number(profile.latitude), lng: Number(profile.longitude) })
          }
        }
      })
      .catch(() => {})
      .finally(() => setPrefilled(true))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) {
      const needsGeo = item.giverLogistics === "giver_sends"
      const phoneOk = /^[6-9]\d{9}$/.test(phone)
      if (!name.trim()) {
        setError("Please enter your name.")
        return
      }
      // Phone optional when profile already has contact via email login.
      if (phone.trim() && !phoneOk) {
        setError("Enter a valid 10-digit mobile, or leave it blank.")
        return
      }
      if (needsGeo && !address.trim()) {
        setError("This giver only sends within 3 km. Add your building / landmark.")
        return
      }
      if (!needsGeo && !address.trim()) {
        setError("Please add a building / landmark so the giver can arrange handover.")
        return
      }
      setError(null)
      setStep(2)
      return
    }
    if (!acceptedTerms || !personalUse) {
      setError("Please confirm personal use and accept the Terms & Privacy Policy.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await api.donor.post("/api/donor/item-requests", {
        itemId: item.id,
        requesterName: name,
        requesterPhone: phone,
        requesterAddress: address,
        note: note || "",
        acceptedTerms: true,
        personalUse: true,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      track(AnalyticsEvent.claimSubmitted, {
        slug: item.slug,
        item_id: item.id,
      })
      onSuccess()
    } catch (err: any) {
      const msg = err?.message
      track(AnalyticsEvent.claimFailed, {
        slug: item?.slug,
        message: typeof msg === "string" ? msg : "unknown",
      })
      setError(typeof msg === "string" ? msg : "Couldn't send your request. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border-2 border-foreground max-w-lg w-full min-w-0 p-5 sm:p-6 md:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-5 my-8 overflow-x-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <X size={20} />
        </button>

        <div className="pr-12 min-w-0">
          <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block">
            {step === 1 ? "Requesting" : "Confirm before claim"}
          </span>
          <h3 className="text-xl sm:text-2xl font-display font-black uppercase break-words leading-tight">
            {item.title}
          </h3>
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted mt-1">Step {step} of 2</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {step === 1 ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Full name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required disabled={!prefilled} className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Mobile number (optional)</label>
                <Input type="tel" name="tel" autoComplete="tel-national" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} disabled={!prefilled} className="rounded-none border-2 border-foreground" />
                <p className="text-xs text-foreground-muted">Prefilled from your account when available.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Building / landmark for handover</label>
                <AddressAutocomplete
                  value={address}
                  onChange={setAddress}
                  onSelect={(val, next) => {
                    setAddress(val)
                    if (next) setCoords(next)
                  }}
                  required
                  disabled={!prefilled}
                  placeholder="Search building or landmark — no flat or wing"
                  className="rounded-none border-2 border-foreground"
                />
                {privacyAddressWarning(address) && (
                  <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(address)}</p>
                )}
                <p className="text-[11px] text-foreground-muted font-medium">
                  Building or landmark only — please don’t include flat or wing.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Address for delivery (optional)</label>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Street / area for courier booking — still no flat or wing"
                  className="text-sm"
                />
                <p className="text-[11px] text-foreground-muted font-medium">
                  Building/landmark stays anonymous for the rider. Add street or area here so our team can book delivery.
                </p>
              </div>
            </>
          ) : (
            <LegalAccept
              idPrefix="claim"
              accepted={acceptedTerms}
              onAcceptedChange={setAcceptedTerms}
              showPersonalUse
              personalUse={personalUse}
              onPersonalUseChange={setPersonalUse}
            />
          )}

          {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

          {step === 1 && (
            <div className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3 py-1">
              Next you’ll confirm personal use (not for sale) and accept Reloved Terms.
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3">
            {step === 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full sm:flex-1 h-12 text-sm font-black uppercase tracking-widest border-2 border-foreground rounded-none"
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              variant="cta"
              disabled={submitting || !prefilled || (step === 2 && (!acceptedTerms || !personalUse))}
              className="w-full sm:flex-1 h-12 text-sm font-black uppercase tracking-widest whitespace-normal leading-tight px-3"
            >
              {submitting ? "Sending..." : step === 1 ? "Continue" : "I Accept - Send request"}
            </Button>
          </div>
          {step === 2 && <LegalReadMore />}
        </form>
      </div>
    </div>
  )
}

function HelpModal({ item, onClose }: { item: any; onClose: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.post("/api/contact", {
        name,
        email,
        phone,
        subject: `Help with item: ${item.title}`,
        message,
      })
      setSent(true)
    } catch (err: any) {
      setError(err?.message || "Couldn't send your message. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border-2 border-foreground max-w-lg w-full min-w-0 p-5 sm:p-6 md:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-5 my-8 overflow-x-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <X size={20} />
        </button>

        {sent ? (
          <div className="flex flex-col items-center text-center gap-4 py-6">
            <div className="w-14 h-14 bg-accent-green border-2 border-foreground flex items-center justify-center text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <CheckCircle2 size={28} />
            </div>
            <h3 className="text-xl font-display font-black uppercase">We've got your message</h3>
            <p className="text-sm text-foreground-muted">Our team will reach out to you shortly.</p>
            <Button onClick={onClose} className="mt-2 h-11 px-8 text-xs font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-accent-pink border-2 border-foreground flex items-center justify-center text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <LifeBuoy size={26} />
              </div>
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block">Outreach</span>
                <h3 className="text-2xl font-display font-black uppercase">Need help?</h3>
              </div>
            </div>
            <p className="text-sm text-foreground-muted -mt-2">Trouble taking this item, or need support some other way? Tell us and our team will reach out.</p>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Your name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Phone (optional)</label>
                <Input type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">How can we help?</label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} required rows={3} className="text-sm" />
              </div>

              {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

              <Button
                type="submit"
                variant="cta"
                disabled={submitting}
                className="w-full h-12 text-sm font-black uppercase tracking-widest"
              >
                {submitting ? "Sending..." : "Send message"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
