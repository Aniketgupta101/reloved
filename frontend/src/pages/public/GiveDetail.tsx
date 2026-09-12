import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { openBorzo, openPorter } from "@/lib/logisticsLinks"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
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
    images: { storagePath: string }[]
    delivery?: {
      deliveryStatus?: string | null
      borzoTrackingUrl?: string | null
      borzoStatus?: string | null
      borzoCourier?: {
        name?: string
        phone?: string
      } | null
    } | null
  }[]
}

export function GiveDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-blue/10 text-accent-blue">
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
              {approved ? (
                <p className="text-sm leading-snug font-bold text-foreground border-2 border-foreground bg-accent-pink/10 px-3 py-2.5">
                  When someone claims this: giver - Borzo - claimer. You pay Borzo once (about Rs 40-80). Reloved takes no
                  cut. Leave the bag at main gate security - chat us below anytime.
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
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-accent-blue text-white border border-foreground">
                        Borzo: {activeDelivery.borzoStatus}
                      </span>
                    )}
                  </div>

                  {activeDelivery.borzoCourier?.name && (
                    <p className="text-xs font-medium">
                      Assigned Rider: <span className="font-bold">{activeDelivery.borzoCourier.name}</span>
                      {activeDelivery.borzoCourier.phone ? ` • ${activeDelivery.borzoCourier.phone}` : ""}
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
              <div className="pt-2 flex flex-col gap-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                  Two-way chat with Reloved
                </p>
                <OrderChatThread subjectType="donation" subjectId={submission.id} client="donor" defaultOpen />
              </div>
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
