import { useParams, useLocation, useNavigate, Link } from "react-router-dom"
import { useEffect, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { Textarea } from "@/components/ui/Textarea"
import { SafeImage } from "@/components/ui/SafeImage"
import { LegalAccept } from "@/components/ui/LegalAccept"
import { ArrowLeft, ShieldCheck, HeartHandshake, X, Clock, LifeBuoy, CheckCircle2 } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"

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
  const [monthlyUsed, setMonthlyUsed] = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState(3)
  const [resetsAt, setResetsAt] = useState<string | null>(null)

  async function fetchItem() {
    setLoading(true)
    try {
      const { item } = await api.get<{ item: any }>(`/api/items/${slug}`)
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
        monthlyUsed?: number
        monthlyLimit?: number
        resetsAt?: string
      }>("/api/donor/item-requests")
      setMonthlyUsed(data.monthlyUsed ?? 0)
      setMonthlyLimit(data.monthlyLimit ?? 3)
      setResetsAt(data.resetsAt ?? null)
    } catch {
      // ignore - guest / expired
    }
  }

  useEffect(() => {
    if (slug) fetchItem()
  }, [slug])

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
    if (!getDonorToken()) {
      navigate(`/account/login?redirect=${encodeURIComponent(location.pathname)}`)
      return
    }
    if (monthlyUsed >= monthlyLimit) return
    setShowTakeModal(true)
  }

  if (loading) {
    return <div className="w-full max-w-5xl mx-auto px-4 py-32 animate-pulse h-96 bg-surface-muted border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]" />
  }

  if (!item) {
    return (
      <div className="w-full max-w-2xl mx-auto px-4 py-32 text-center bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] mt-16">
        <h1 className="text-4xl font-display font-black uppercase">Item not found.</h1>
        <p className="text-foreground-muted mt-4 mb-8 font-medium">This item may have been removed or is no longer available.</p>
        <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "item_not_found" })}>
          <Button className="font-bold uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">Back to the Wall</Button>
        </Link>
      </div>
    )
  }

  const atClaimLimit = getDonorToken() ? monthlyUsed >= monthlyLimit : false
  const takeable = item.publicStatus === "available" && !atClaimLimit
  const remainingClaims = Math.max(0, monthlyLimit - monthlyUsed)

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-16">
      <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "item_detail_back" })} className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-accent-blue mb-8 transition-colors">
        <ArrowLeft size={16} /> Back to the Wall
      </Link>

      <div className="flex flex-col lg:flex-row gap-16">
        {/* Gallery */}
        <div className="w-full lg:w-1/2 overflow-hidden aspect-square relative border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] bg-white">
          <SafeImage
            src={resolveImageUrl(item.images?.[0]?.storagePath, { full: true })}
            alt={item.title}
            className="w-full h-full object-contain bg-white"
          />
          <div className="absolute top-6 left-6 bg-white border-2 border-foreground px-4 py-2 font-bold uppercase tracking-widest text-sm shadow-[2px_2px_0px_rgba(0,0,0,1)]">
            {(item.publicStatus || "available").replace(/_/g, " ")}
          </div>
        </div>

        {/* Details */}
        <div className="w-full lg:w-1/2 flex flex-col items-start gap-8">
          <div>
            <div className="flex items-center gap-4 mb-4">
              {(() => {
                const status = (item.publicStatus || "available").toLowerCase()
                if (status === "being_matched") {
                  return (
                    <span className="text-sm font-black text-accent-blue bg-white px-3 py-1 uppercase tracking-widest border-2 border-accent-blue shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      Being matched
                    </span>
                  )
                }
                if (status === "reloved") {
                  return (
                    <span className="text-sm font-black text-accent-pink bg-white px-3 py-1 uppercase tracking-widest border-2 border-accent-pink shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      Reloved
                    </span>
                  )
                }
                if (status === "claimed") {
                  return (
                    <span className="text-sm font-black text-foreground bg-accent-green px-3 py-1 uppercase tracking-widest border border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      Claimed
                    </span>
                  )
                }
                return (
                  <span className="text-sm font-black text-foreground bg-accent-green px-3 py-1 uppercase tracking-widest border border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                    ₹0 FREE
                  </span>
                )
              })()}
              <span className="text-sm text-foreground-muted font-black uppercase tracking-widest">{item.category}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-display font-black leading-tight uppercase tracking-tight">{item.title}</h1>
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
                  : item.publicStatus === "being_matched"
                    ? "Being matched"
                    : item.publicStatus === "reloved"
                      ? "Already reloved"
                      : "Not available"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-foreground leading-relaxed whitespace-pre-wrap font-medium">{item.description}</p>
          </div>

          <div className="w-full flex flex-col gap-4 mt-auto pt-8">
            {getDonorToken() && (
              <div className="text-xs font-bold border-2 border-foreground bg-surface-muted px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                <span className="uppercase tracking-widest">
                  Claims this month: {monthlyUsed}/{monthlyLimit}
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
              className="w-full h-14 text-base font-black uppercase tracking-widest disabled:opacity-50 disabled:hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] disabled:hover:translate-x-0 disabled:hover:translate-y-0"
              onClick={openTakeFlow}
              disabled={!takeable}
            >
              {atClaimLimit && item.publicStatus === "available"
                ? "Monthly claim limit reached"
                : item.publicStatus === "available"
                  ? "Claim this item"
                  : item.publicStatus === "being_matched"
                    ? "Already requested"
                    : "No longer available"}
            </Button>

            <Button
              className="w-full h-11 text-xs font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] bg-accent-green text-foreground hover:bg-accent-green"
              onClick={() => setShowHelpModal(true)}
            >
              <LifeBuoy size={14} className="mr-1.5" /> Need help?
            </Button>

            <div className="text-xs text-foreground-muted max-w-md leading-relaxed border-l-2 border-foreground pl-3 py-1 font-medium">
              <span className="font-bold text-foreground block uppercase tracking-widest mb-1">How claiming works:</span>
              Sign in, tell us who you are and where to reach you, and our team reviews and approves every request by hand - usually within 24-48 hours - before it's confirmed as yours.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border-2 border-foreground max-w-md w-full p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col items-center gap-5 text-center">
            <button
              onClick={() => setShowSuccessModal(false)}
              className="absolute top-4 right-4 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            >
              <X size={20} />
            </button>
            <div className="w-16 h-16 bg-accent-green border-2 border-foreground flex items-center justify-center text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <Clock size={32} />
            </div>
            <h3 className="text-2xl font-display font-black uppercase">Request sent!</h3>
            <p className="text-sm font-medium text-foreground/80 leading-relaxed">
              Our team will review your request and approve it within <strong className="text-foreground">24-48 hours</strong>. We'll reach out on the phone number you gave us to arrange handover.
            </p>
            <div className="flex gap-3 w-full pt-2">
              <Link to="/account" className="flex-1" onClick={() => track(AnalyticsEvent.navAccount, { source: "claim_success" })}>
                <Button className="w-full h-11 text-xs font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]">
                  View my requests
                </Button>
              </Link>
              <Button
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 h-11 text-xs font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] bg-accent-green text-foreground hover:bg-accent-green"
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
                <strong className="text-foreground">This is separate from claiming an item yourself.</strong> Individuals can already request items directly on this page - that request is reviewed and approved by our team.
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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [personalUse, setPersonalUse] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [prefilled, setPrefilled] = useState(false)

  useEffect(() => {
    api.donor
      .get<{ profile: { name: string | null; phone: string | null; address: string | null } | null }>("/api/donor/profile")
      .then(({ profile }) => {
        if (profile) {
          setName(profile.name || "")
          setPhone(profile.phone || "")
          setAddress(profile.address || "")
        }
      })
      .catch(() => {})
      .finally(() => setPrefilled(true))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (step === 1) {
      if (!name.trim() || !/^[6-9]\d{9}$/.test(phone) || !address.trim()) {
        setError("Please fill name, a valid 10-digit mobile, and address.")
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
      <div className="bg-white border-2 border-foreground max-w-lg w-full p-6 md:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-5 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-surface-muted border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
        >
          <X size={20} />
        </button>

        <div>
          <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block">
            {step === 1 ? "Requesting" : "Confirm before claim"}
          </span>
          <h3 className="text-2xl font-display font-black uppercase">{item.title}</h3>
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
                <label className="text-xs font-bold uppercase tracking-widest">Mobile number</label>
                <Input type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required disabled={!prefilled} className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Address for handover</label>
                <AddressAutocomplete value={address} onChange={setAddress} required disabled={!prefilled} placeholder="e.g. Bandra West, Mumbai" className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Why do you need this? (optional)</label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="A short note helps our team review faster" className="text-sm" />
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

          <div className="flex gap-3">
            {step === 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex-1 h-12 text-sm font-black uppercase tracking-widest border-2 border-foreground rounded-none"
              >
                Back
              </Button>
            )}
            <Button
              type="submit"
              variant="cta"
              disabled={submitting || !prefilled || (step === 2 && (!acceptedTerms || !personalUse))}
              className="flex-1 h-12 text-sm font-black uppercase tracking-widest"
            >
              {submitting ? "Sending..." : step === 1 ? "Continue" : "I Accept - Send request"}
            </Button>
          </div>
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
      <div className="bg-white border-2 border-foreground max-w-lg w-full p-6 md:p-8 shadow-[12px_12px_0px_rgba(0,0,0,1)] relative flex flex-col gap-5 my-8">
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
              <div className="w-12 h-12 bg-accent-blue border-2 border-foreground flex items-center justify-center text-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
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
