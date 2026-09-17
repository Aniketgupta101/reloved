import { useEffect } from "react"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { CheckCircle2, Copy } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function GiveSuccess() {
  const { reference } = useParams()
  const [params] = useSearchParams()
  const logistics = params.get("logistics") || ""

  useEffect(() => {
    if (reference) {
      track(AnalyticsEvent.donationCompleted, { reference })
    }
  }, [reference])

  const copyRef = () => {
    if (reference) navigator.clipboard.writeText(reference)
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-32 flex flex-col items-center text-center gap-8">
      <div className="w-24 h-24 bg-accent-green border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex items-center justify-center text-foreground">
        <CheckCircle2 size={48} />
      </div>

      <h1 className="text-4xl md:text-6xl font-display font-black uppercase tracking-tight">Thank you for giving.</h1>

      <p className="text-lg text-foreground-muted font-medium">
        Your item has been submitted for review. Once it&apos;s live on the Wall, claimers can request it — you Accept or Decline from your profile.
      </p>

      <div className="bg-white p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-4 w-full">
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submission Reference</p>
        <div className="flex items-center gap-4">
          <span className="text-4xl font-display font-black tracking-widest bg-accent-pink/10 px-4 py-2 border-2 border-foreground">
            {reference}
          </span>
          <button
            onClick={copyRef}
            className="p-4 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-surface-muted"
          >
            <Copy size={24} />
          </button>
        </div>
        <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest mt-2">
          Save this reference to track your donation.
        </p>
      </div>

      {logistics === "porter_arranged" && (
        <div className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left w-full flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-widest">What happens next — Borzo</p>
          <ol className="list-decimal pl-5 text-sm font-medium space-y-2 text-foreground/90">
            <li>Admin reviews your drop, then it goes live on the Wall.</li>
            <li>A claimer requests it — you Accept or Decline from your gift page.</li>
            <li>After Accept, the claimer books prepaid Borzo (gate to gate). Reloved does not run the courier.</li>
            <li>Rider collects from building main gate security — leave the item in a bag with security.</li>
            <li>
              Item stays <span className="font-black">₹0 free</span>. First 500 rides:{" "}
              <span className="font-black">Reloved pays</span>. After that, receiver reimburses Reloved once (~₹40–80). No COD.
            </li>
          </ol>
        </div>
      )}
      {(logistics === "giver_sends" || logistics === "receiver_collects") && (
        <div className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left w-full flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-widest">What happens next</p>
          <ol className="list-decimal pl-5 text-sm font-medium space-y-2 text-foreground/90">
            <li>Admin reviews your drop, then it goes live on the Wall.</li>
            <li>When someone claims it, you get a notification — Accept or Decline.</li>
            <li>
              {logistics === "giver_sends"
                ? "On Accept, the claimer shares a delivery address (nearby, within 3 km). You arrange the send."
                : "On Accept, share the minimum pickup info so the claimer can collect from your building gate."}
            </li>
            <li>Mark Handed over when it leaves you; they confirm Received — status becomes RELOVED.</li>
          </ol>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6 mt-8 w-full sm:w-auto">
        <Link to="/account" className="w-full sm:w-auto" onClick={() => track(AnalyticsEvent.navAccount, { source: "give_success" })}>
          <Button variant="cta" className="w-full font-bold uppercase tracking-widest">
            View my profile
          </Button>
        </Link>
        <Link
          to={`/track/${reference}`}
          className="w-full sm:w-auto"
          onClick={() => track(AnalyticsEvent.trackLookup, { reference: reference || "", source: "give_success" })}
        >
          <Button variant="cta" className="w-full font-bold uppercase tracking-widest">
            Track Submission
          </Button>
        </Link>
        <Link to="/drop" className="w-full sm:w-auto" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "give_success" })}>
          <Button variant="cta" className="w-full font-bold uppercase tracking-widest">
            Explore the Wall
          </Button>
        </Link>
      </div>
    </div>
  )
}
