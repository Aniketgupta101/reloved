import { useEffect } from "react"
import { useParams, useSearchParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { CheckCircle2 } from "lucide-react"
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

  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-16 sm:py-24 flex flex-col items-center text-center gap-6 sm:gap-8">
      <div className="w-20 h-20 sm:w-24 sm:h-24 bg-accent-green border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex items-center justify-center text-foreground">
        <CheckCircle2 size={48} />
      </div>

      <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-black uppercase tracking-tight text-balance">Thank you for giving.</h1>

      <p className="text-lg text-foreground-muted font-medium">
        Your item is live on the Wall of Kindness. Claimers can request it — you Accept or Decline from your profile.
      </p>

      <div className="bg-white p-5 sm:p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-3 sm:gap-4 w-full min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submission Reference</p>
        <span className="w-full max-w-full text-xl sm:text-3xl md:text-4xl font-display font-black tracking-wide sm:tracking-widest bg-accent-pink/10 px-3 sm:px-4 py-2 border-2 border-foreground whitespace-nowrap overflow-x-auto text-center">
          {reference}
        </span>
        <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest mt-1 whitespace-nowrap overflow-x-auto max-w-full">
          Save this to track your request
        </p>
      </div>

      {logistics === "porter_arranged" && (
        <div className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left w-full flex flex-col gap-3">
          <p className="text-xs font-black uppercase tracking-widest">What happens next — Borzo</p>
          <ol className="list-decimal pl-5 text-sm font-medium space-y-2 text-foreground/90">
            <li>Your drop is live on the Wall of Kindness.</li>
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
            <li>Your drop is live on the Wall of Kindness.</li>
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
        <Link to="/drop" className="w-full sm:w-auto" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "give_success" })}>
          <Button variant="outline" className="w-full font-bold uppercase tracking-widest">
            Explore the Wall
          </Button>
        </Link>
      </div>
    </div>
  )
}
