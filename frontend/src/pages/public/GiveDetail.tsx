import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { openBorzo, openPorter } from "@/lib/logisticsLinks"
import { DualChatOptions } from "@/components/chat/DualChatOptions"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"

interface Submission {
  id: string
  reference: string
  status: string
  submittedAt: string
  items: {
    id: string
    slug: string
    title: string
    category: string
    status: string
    publicVisibility: boolean
    publicStatus?: string | null
    images: { storagePath: string }[]
    claim?: {
      id: string
      status: string
      handoverStage?: string | null
      requesterName?: string | null
      requesterAddress?: string | null
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
  const liveClaim = submission.items.map((i) => i.claim).find((c) => c && (c.status === "pending" || c.status === "approved"))

  async function giverDecision(decision: "accept" | "decline") {
    if (!liveClaim) return
    setBusy(true)
    try {
      await api.donor.post(`/api/donor/item-requests/${liveClaim.id}/giver-decision`, { decision })
      await reload()
    } catch (err: any) {
      window.alert(err?.message || "Couldn't save decision")
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
      window.alert(err?.message || "Couldn't mark handed over")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pt-6 pb-16 flex flex-col gap-6">
      <Link
        to="/account"
        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest w-fit"
      >
        <ArrowLeft size={14} /> Back to account
      </Link>

      <div className="bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
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
              <div className="w-16 h-16 shrink-0 border-2 border-foreground bg-surface-muted overflow-hidden">
                <SafeImage
                  src={imageSrc}
                  alt=""
                  showSkeleton={false}
                  className="w-full h-full object-cover"
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
              <h1 className="text-2xl sm:text-3xl font-display font-black uppercase tracking-tight leading-tight">
                {hero?.title || "Your donation"}
              </h1>
            </div>
          </div>

          {submission.items.length > 1 && (
            <div className="grid grid-cols-3 gap-2">
              {submission.items.map((item) => (
                <div key={item.id} className="border-2 border-foreground bg-surface-muted overflow-hidden aspect-square">
                  <SafeImage
                    src={resolveImageUrl(item.images?.[0]?.storagePath)}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          {(approved || submission.status === "pending") && (
            <div className="flex flex-col gap-4 pt-2 border-t-2 border-foreground/10">
              {liveClaim?.status === "pending" && (
                <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-accent-pink/10">
                  <p className="text-sm font-bold">
                    Someone wants to Relove your {hero?.title || "item"} 💗
                  </p>
                  {liveClaim.requesterName && (
                    <p className="text-xs font-medium">From {liveClaim.requesterName}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="cta" disabled={busy} onClick={() => giverDecision("accept")}>
                      Accept
                    </Button>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => giverDecision("decline")}>
                      Decline
                    </Button>
                  </div>
                </div>
              )}
              {liveClaim?.status === "approved" && (
                <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-accent-green/15">
                  <p className="text-[10px] font-black uppercase tracking-widest">Matched</p>
                  {liveClaim.requesterAddress ? (
                    <p className="text-sm font-bold">
                      Delivery details received 📍
                      <span className="block font-medium mt-1">{liveClaim.requesterAddress}</span>
                      Please arrange the handover.
                    </p>
                  ) : (
                    <p className="text-sm font-medium">Waiting for the receiver to share a delivery address.</p>
                  )}
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
              {approved ? (
                <p className="text-sm leading-snug font-bold text-foreground border-2 border-foreground bg-accent-pink/10 px-3 py-2.5">
                  After you Accept: arrange handover yourself (collect, you send, or open Porter/Borzo). Reloved matches —
                  it does not run the courier. If you use Borzo, you pay once (about ₹40–80). Leave the bag at main gate
                  security. Chat us below anytime.
                </p>
              ) : (
                <p className="text-sm text-foreground-muted font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5">
                  Under review. You can message Reloved below anytime.
                </p>
              )}
              {approved && activeDelivery && (
                <div className="flex flex-col gap-3 p-4 border-2 border-foreground bg-[#F7F5F0]">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Bike size={16} className="text-foreground" />
                      <span className="text-xs font-black uppercase tracking-wider font-display">
                        Courier Pickup: {(activeDelivery.deliveryStatus || "awaiting_pickup").replace(/_/g, " ")}
                      </span>
                    </div>
                    {activeDelivery.borzoStatus && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-accent-pink text-foreground border border-foreground">
                        Borzo: {activeDelivery.borzoStatus}
                      </span>
                    )}
                  </div>

                  {activeDelivery.borzoCourier?.name && (
                    <p className="text-xs font-medium">
                      Assigned Rider: <span className="font-bold">{activeDelivery.borzoCourier.name}</span>
                      <span className="text-foreground-muted"> · contact via Borzo tracking (phone masked)</span>
                    </p>
                  )}

                  <p className="text-xs text-foreground-muted font-medium">
                    Please leave the preloved item at your building main gate security. The Borzo rider will collect it directly.
                  </p>

                  {activeDelivery.borzoTrackingUrl && (
                    <a
                      href={activeDelivery.borzoTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-background font-display font-black text-xs uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
                    >
                      <ExternalLink size={14} />
                      Track Borzo Rider Live
                    </a>
                  )}
                </div>
              )}

              {approved && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="font-black uppercase tracking-widest w-full sm:w-auto"
                    onClick={openBorzo}
                  >
                    Open Borzo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="font-black uppercase tracking-widest w-full sm:w-auto"
                    onClick={openPorter}
                  >
                    Open Porter
                  </Button>
                </div>
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
              This donation was not approved.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
