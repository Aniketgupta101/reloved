import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, Copy, Check, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { Button } from "@/components/ui/Button"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"
import { normalizeBorzoTrackingUrl, isBrokenBorzoTestTrackUrl, copySelfServeCourierBooking, openBorzo, openPorter } from "@/lib/logisticsLinks"
import { SafeImage } from "@/components/ui/SafeImage"

interface Submission {
  id: string
  reference: string
  status: string
  submittedAt: string
  locality?: string | null
  address?: string | null
  items: {
    id: string
    slug: string
    title: string
    category: string
    status: string
    publicVisibility: boolean
    publicStatus?: string | null
    locality?: string | null
    images: { storagePath: string }[]
    claim?: {
      id: string
      status: string
      handoverStage?: string | null
      requesterName?: string | null
      requesterAddress?: string | null
      requesterPhone?: string | null
      addressSaved?: boolean
      giverLogistics?: string | null
      deliveryStatus?: string | null
      borzoTrackingUrl?: string | null
      borzoStatus?: string | null
      borzoCourier?: { name?: string; phone?: string } | null
    } | null
    delivery?: {
      deliveryStatus?: string | null
      borzoTrackingUrl?: string | null
      borzoStatus?: string | null
      borzoCourier?: { name?: string; phone?: string } | null
    } | null
  }[]
}

export function GiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [booking, setBooking] = useState(false)
  const [copiedBooking, setCopiedBooking] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [declineReason, setDeclineReason] = useState("too_far")
  const [notice, setNotice] = useState<NoticeState | null>(null)

  async function reload() {
    if (!id) return
    const { submissions } = await api.donor.get<{ submissions: Submission[] }>("/api/donor/submissions")
    const found = (submissions || []).find((s) => s.id === id) || null
    setSubmission(found)
  }

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login", { replace: true, state: { redirect: `/account/gifts/${id}` } })
      return
    }
    if (!id) return
    setLoading(true)
    api.donor
      .get<{ submissions: Submission[] }>("/api/donor/submissions")
      .then(({ submissions }) => {
        const found = (submissions || []).find((s) => s.id === id) || null
        if (!found) setError("This donation wasn't found on your account.")
        setSubmission(found)
      })
      .catch((err: any) => setError(err?.message || "Couldn't load donation"))
      .finally(() => setLoading(false))
  }, [id, navigate])

  useEffect(() => {
    const title = submission?.items?.[0]?.title
    if (title) document.title = `reloved | ${title}`
    else if (submission) document.title = "reloved | Your gift"
  }, [submission])

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 h-64 bg-surface-muted border-2 border-foreground animate-pulse" />
  }

  if (error || !submission) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col gap-4">
        <p className="font-bold text-accent-red">{error || "Not found"}</p>
        <Link to="/account" className="text-sm font-black uppercase tracking-widest underline">
          Back to account
        </Link>
      </div>
    )
  }

  const approved = submission.status === "approved"
  const hero = submission.items[0]
  const imageSrc = hero ? resolveImageUrl(hero.images?.[0]?.storagePath) : undefined
  const activeDelivery = submission.items.map((i) => i.delivery).find(Boolean)
  const claims = submission.items.map((i) => i.claim).filter(Boolean) as NonNullable<(typeof submission.items)[0]["claim"]>[]
  const liveClaim = claims.find((c) => c.status === "approved") || claims.find((c) => c.status === "pending") || null
  const rawTrackUrl = activeDelivery?.borzoTrackingUrl || null
  const trackUrl = normalizeBorzoTrackingUrl(rawTrackUrl)
  const trackBroken = isBrokenBorzoTestTrackUrl(rawTrackUrl)
  const pickupBuilding =
    String(hero?.locality || submission.locality || submission.address || "").trim() ||
    "Your building main gate (use your Reloved pickup building)"
  const dropBuilding = String(liveClaim?.requesterAddress || "").trim()

  async function copyText(label: string, value: string) {
    const text = String(value || "").trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(label)
      window.setTimeout(() => setCopiedField(null), 2000)
    } catch {
      setNotice({ title: "Couldn't copy", body: "Long-press the text to copy instead.", tone: "warn" })
    }
  }

  async function copyAllClaimerDetails() {
    const lines = [
      liveClaim?.requesterName ? `Name: ${liveClaim.requesterName}` : null,
      liveClaim?.requesterPhone ? `Phone: ${liveClaim.requesterPhone}` : null,
      liveClaim?.requesterAddress ? `Address: ${liveClaim.requesterAddress}` : null,
      "Rider note: Collect from building main gate security. Do not call flat.",
    ].filter(Boolean)
    if (lines.length === 0) return
    await copyText("all", lines.join("\n"))
  }

  async function openCourierApp(carrier: "borzo" | "porter") {
    setBooking(true)
    try {
      await copySelfServeCourierBooking({
        pickupBuilding,
        dropBuilding: dropBuilding || "Receiver building gate (confirm area in chat — exact flat stays private)",
        itemTitle: hero?.title,
        reference: submission.reference,
      })
      setCopiedBooking(true)
      window.setTimeout(() => setCopiedBooking(false), 2500)
      if (carrier === "porter") openPorter()
      else openBorzo()
      setNotice({
        title: carrier === "porter" ? "Porter app opening" : "Borzo app opening",
        body: "Pickup + drop are copied. Paste in the app. Prefer gate / landmark on the rider note.",
        tone: "ok",
      })
    } catch (err: any) {
      setNotice({
        title: "Couldn't open courier",
        body: err?.message || "Try again, or open Borzo/Porter and enter addresses manually.",
        tone: "error",
      })
    } finally {
      setBooking(false)
    }
  }

  async function giverDecision(decision: "accept" | "decline", reason?: string) {
    if (!liveClaim) return
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${liveClaim.id}/giver-decision`, {
        decision,
        ...(decision === "decline" ? { reason: reason || declineReason } : {}),
      })
      setDeclineOpen(false)
      await reload()
    } catch (err: any) {
      setNotice({ title: "Couldn't save", body: err?.message || "Couldn't save decision", tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function markHandedOver() {
    if (!liveClaim) return
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${liveClaim.id}/handed-over`, {})
      await reload()
    } catch (err: any) {
      setNotice({ title: "Couldn't update", body: err?.message || "Couldn't mark handed over", tone: "error" })
    } finally {
      setBusy(false)
    }
  }

  async function removeListing() {
    const onWall = approved
    const pendingReview =
      submission.status === "pending" ||
      submission.status === "pending_review" ||
      submission.status === "submitted" ||
      submission.status === "under_review"
    setNotice({
      title: onWall ? "Remove from Wall?" : "Remove listing?",
      body: onWall
        ? "Tell us why you're taking this off the Wall. If someone already claimed it, that claim will be cancelled."
        : pendingReview
          ? "This is still awaiting review. Tell us why you want to remove it."
          : "Tell us why you're removing this listing.",
      tone: "warn",
      primaryLabel: "Remove",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      promptLabel: "Reason for removing",
      promptPlaceholder: "e.g. Kept it, wrong photos, changed my mind…",
      promptRequired: true,
      onPrimary: (reason) => {
        void (async () => {
          setBusy(true)
          try {
            await api.donor.delete(`/api/donor/submissions/${submission.id}`, { reason: reason || "" })
            navigate("/account?tab=giving")
          } catch (err: any) {
            setNotice({ title: "Couldn't remove", body: err?.message || "Couldn't remove listing", tone: "error" })
          } finally {
            setBusy(false)
          }
        })()
      },
    })
  }

  function requestBookBorzo() {
    if (!liveClaim?.id) return
    if (!(liveClaim.addressSaved || liveClaim.requesterAddress)) {
      setNotice({
        title: "Address needed",
        body: "Wait for the receiver's building to be saved. Prefer: ask them to Book Borzo from their claim page (they pay; addresses stay private).",
        tone: "warn",
      })
      return
    }
    setNotice({
      title: "Book Borzo? (fallback)",
      body: "Normally the receiver books Borzo after you Accept.\n\nFallback: you can book using their saved building — Reloved never shows you their exact address. Rider collects from your gate. Receiver pays once (~₹40–80).",
      tone: "warn",
      primaryLabel: "Confirm book",
      onPrimary: () => void runBookBorzo(),
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
    })
  }

  async function runBookBorzo() {
    if (!liveClaim?.id) return
    setBooking(true)
    try {
      const res = await api.donor.post<{ ok: boolean; order: { orderName?: string; orderId?: string; trackingUrl?: string | null } }>(
        `/api/donor/item-requests/${liveClaim.id}/borzo/book`
      )
      const orderRef = res.order?.orderName || res.order?.orderId || ""
      await reload()
      setNotice({
        title: "Borzo booked",
        body: `Order #${orderRef} created.\n\nLeave the bag at main gate security — the rider will collect.`,
        tone: "ok",
        primaryLabel: res.order?.trackingUrl ? "Track rider" : "Done",
        onPrimary: res.order?.trackingUrl
          ? () => window.open(res.order.trackingUrl!, "_blank", "noopener,noreferrer")
          : undefined,
      })
    } catch (err: any) {
      setNotice({ title: "Booking failed", body: err?.message || "Failed to book Borzo", tone: "error" })
    } finally {
      setBooking(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 pt-4 sm:pt-6 pb-16 flex flex-col gap-6 min-w-0">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden min-w-0">
        {hero && (
          <div className="relative h-[280px] sm:h-[360px] border-b-2 border-foreground bg-[#f0eee8]">
            <SafeImage
              src={imageSrc}
              alt={hero.title}
              priority
              className="absolute inset-0 w-full h-full object-contain p-4 sm:p-6"
            />
          </div>
        )}

        <div className="p-5 sm:p-8 flex flex-col gap-5">
          <div className="flex gap-4 items-start">
            {hero && (
              <div className="w-16 h-16 shrink-0 border-2 border-foreground bg-white overflow-hidden">
                <SafeImage
                  src={imageSrc}
                  alt=""
                  showSkeleton={false}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <span className="text-xs font-mono font-bold bg-surface-muted px-2 py-1 border border-foreground/20 w-fit">
                {submission.reference}
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/10 text-accent-pink">
                {submission.status.replace(/_/g, " ")}
              </span>
              <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight leading-tight break-words">
                {hero?.title || "Your donation"}
              </h1>
            </div>
          </div>

          {submission.items.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {submission.items.map((item) => (
                <div key={item.id} className="border-2 border-foreground bg-white overflow-hidden aspect-square">
                  <SafeImage
                    src={resolveImageUrl(item.images?.[0]?.storagePath)}
                    alt={item.title}
                    className="w-full h-full object-contain"
                  />
                </div>
              ))}
            </div>
          )}

          {(approved || submission.status === "pending") && (
            <div className="flex flex-col gap-4 pt-2 border-t-2 border-foreground/10">
              {liveClaim?.status === "pending" && (
                <div className="flex flex-col gap-3 p-3 sm:p-4 border-2 border-foreground bg-accent-pink/10 min-w-0 overflow-hidden">
                  <p className="text-sm font-bold break-words">
                    Someone wants to Relove your {hero?.title || "item"} 💗
                  </p>
                  {liveClaim.requesterName && (
                    <p className="text-xs font-medium">From Receiver</p>
                  )}
                  <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full min-w-0">
                    <Button
                      type="button"
                      variant="cta"
                      disabled={busy}
                      onClick={() => giverDecision("accept")}
                      className="w-full sm:w-auto"
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setDeclineOpen(true)}
                      className="w-full sm:w-auto"
                    >
                      Decline
                    </Button>
                  </div>
                  <p className="text-xs text-foreground-muted border-t border-foreground/15 pt-2">
                    After Accept: <span className="font-bold text-foreground">you never book the courier</span> (you
                    don&apos;t see their exact address). The receiver books Borzo/Porter on their claim page and pays.
                    You only leave the bag at your building gate.
                  </p>
                  {declineOpen && (
                    <div className="flex flex-col gap-2 pt-2 border-t border-foreground/15 min-w-0">
                      <label className="text-[10px] font-black uppercase tracking-widest">
                        Why this match doesn&apos;t work for you
                      </label>
                      <p className="text-[11px] text-foreground-muted font-medium leading-relaxed">
                        You don&apos;t need to know the claimer. Pick a reason about distance, timing, or that
                        you&apos;re already matching someone else. They only see a soft “couldn&apos;t match” —
                        not your exact reason wording.
                      </p>
                      <select
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        className="h-11 w-full max-w-full bg-background px-3 text-sm font-medium border-2 border-foreground"
                      >
                        <option value="too_far">Too far / outside my handover zone</option>
                        <option value="timing">Timing doesn&apos;t work for me</option>
                        <option value="already_promised">Already matching someone else</option>
                        <option value="other">Other (prefer not to say)</option>
                      </select>
                      <div className="flex flex-col gap-2 w-full min-w-0">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setDeclineOpen(false)}
                          className="w-full"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="cta"
                          disabled={busy}
                          onClick={() => giverDecision("decline", declineReason)}
                          className="w-full whitespace-normal leading-tight"
                        >
                          Confirm — couldn&apos;t match
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {liveClaim?.status === "approved" && (
                <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-accent-green/15">
                  <p className="text-[10px] font-black uppercase tracking-widest">Matched</p>
                  {liveClaim.addressSaved || liveClaim.requesterAddress ? (
                    <p className="text-sm font-bold">Delivery area ready (exact flat hidden).</p>
                  ) : (
                    <p className="text-sm font-medium">Waiting for the receiver to save a delivery building.</p>
                  )}

                  {(liveClaim.requesterName || liveClaim.requesterPhone || liveClaim.requesterAddress) && (
                    <div className="flex flex-col gap-2 p-3 bg-white border-2 border-foreground text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                          Claimer details (tap to copy)
                        </p>
                        <button
                          type="button"
                          className="text-[10px] font-black uppercase tracking-widest underline"
                          onClick={() => void copyAllClaimerDetails()}
                        >
                          {copiedField === "all" ? "Copied all" : "Copy all"}
                        </button>
                      </div>
                      {liveClaim.requesterName && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("name", liveClaim.requesterName || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Name</span>
                            <span className="font-bold">{liveClaim.requesterName}</span>
                          </span>
                          {copiedField === "name" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      {liveClaim.requesterAddress && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("address", liveClaim.requesterAddress || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Address</span>
                            <span className="font-medium">{liveClaim.requesterAddress}</span>
                          </span>
                          {copiedField === "address" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      {liveClaim.requesterPhone && (
                        <button
                          type="button"
                          className="flex items-start justify-between gap-2 text-left w-full group"
                          onClick={() => void copyText("phone", liveClaim.requesterPhone || "")}
                        >
                          <span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted block">Phone</span>
                            <span className="font-bold">{liveClaim.requesterPhone}</span>
                          </span>
                          {copiedField === "phone" ? <Check size={14} className="shrink-0 mt-1" /> : <Copy size={14} className="shrink-0 mt-1 opacity-50 group-hover:opacity-100" />}
                        </button>
                      )}
                      <p className="text-[10px] text-foreground-muted">
                        Fallback: paste into Borzo/Porter or share with a delivery partner. Prefer gate / landmark — not flat number on the rider note.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="cta"
                      disabled={booking}
                      className="font-black uppercase tracking-widest w-full sm:w-auto"
                      onClick={() => void openCourierApp("borzo")}
                    >
                      <Bike size={14} />
                      {booking ? "Opening…" : copiedBooking ? "Copied · Borzo website" : "Open Borzo website"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={booking}
                      className="font-black uppercase tracking-widest w-full sm:w-auto"
                      onClick={() => void openCourierApp("porter")}
                    >
                      {booking ? "Opening…" : copiedBooking ? "Copied · Porter website" : "Open Porter website"}
                    </Button>
                  </div>
                  {trackUrl && !trackBroken && (
                    <a
                      href={trackUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-background font-display font-black text-xs uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                    >
                      <ExternalLink size={14} />
                      Track rider live
                    </a>
                  )}
                  <p className="text-[11px] text-foreground-muted font-medium">
                    Tap Borzo/Porter to copy pickup + drop and open the app. Or copy claimer details above for any delivery partner.
                  </p>
                  {liveClaim.handoverStage !== "handed_over" && liveClaim.handoverStage !== "received" && (
                    <Button type="button" variant="cta" disabled={busy || liveClaim.handoverStage === "awaiting_delivery_address"} onClick={markHandedOver}>
                      Handed over
                    </Button>
                  )}
                  {liveClaim.handoverStage === "handed_over" && (
                    <p className="text-sm font-bold">Waiting for the receiver to confirm Received.</p>
                  )}
                  {liveClaim.handoverStage === "received" && (
                    <p className="text-sm font-black uppercase tracking-widest text-accent-pink">RELOVED ❤️</p>
                  )}
                </div>
              )}
              {!approved && (
                <p className="text-sm text-foreground-muted font-medium">
                  Under review. You can message Reloved below anytime.
                </p>
              )}
              {approved && !liveClaim && (
                <p className="text-sm text-foreground-muted font-medium">
                  Live on the Wall — you'll see requests here as they come in.
                </p>
              )}
              {(submission.status === "pending" ||
                submission.status === "pending_review" ||
                submission.status === "submitted" ||
                submission.status === "under_review" ||
                submission.status === "rejected" ||
                (approved &&
                  liveClaim?.status !== "approved" &&
                  !activeDelivery &&
                  liveClaim?.handoverStage !== "handed_over" &&
                  liveClaim?.handoverStage !== "received")) && (
                <Button type="button" variant="outline" disabled={busy} onClick={removeListing}>
                  {approved ? "Remove from Wall" : "Remove listing"}
                </Button>
              )}
              <DualChatOptions
                relovedType="donation"
                relovedSubjectId={submission.id}
                peerClaimId={liveClaim?.id}
                peerEnabled={liveClaim?.status === "approved"}
                peerLabel="Chat with receiver"
              />
            </div>
          )}

          {submission.status === "rejected" && (
            <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
              This drop didn&apos;t go live on the Wall. You can drop again anytime with clearer photos or details — Reloved is happy to help.
            </p>
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
          promptLabel={notice.promptLabel}
          promptPlaceholder={notice.promptPlaceholder}
          promptRequired={notice.promptRequired}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
