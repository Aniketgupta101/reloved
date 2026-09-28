import { useEffect } from "react"
import { useLocation, useParams, useSearchParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { AlertTriangle, CheckCircle2 } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { getGiveSuccessFeedback, type PartialGiveResult } from "@/lib/userFacingErrors"

export function GiveSuccess() {
  const { reference } = useParams()
  const location = useLocation()
  const [params] = useSearchParams()
  const logistics = params.get("logistics") || ""
  const partialSubmission = (
    location.state as { partialSubmission?: PartialGiveResult } | null
  )?.partialSubmission
  const feedback = getGiveSuccessFeedback(partialSubmission)
  const isPartial = feedback.kind === "partial"

  useEffect(() => {
    if (reference) {
      track(AnalyticsEvent.donationCompleted, { reference })
    }
  }, [reference])

  return (
    <div className="public-give-success">
      <div className={`public-give-success-mark flex items-center justify-center text-foreground shrink-0 ${isPartial ? "bg-accent-yellow" : "bg-accent-green"}`}>
        {isPartial ? (
          <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12" aria-hidden="true" />
        )}
      </div>

      <h1 className="text-3xl sm:text-4xl md:text-6xl font-display font-black uppercase tracking-tight text-balance px-1">
        {feedback.title}
      </h1>

      <p className="text-base sm:text-lg text-foreground-muted font-medium text-pretty">
        {feedback.message}
      </p>

      <div className="public-give-reference bg-white p-4 sm:p-8 border border-foreground sm:border-2 shadow-[3px_3px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-3 sm:gap-4 w-full min-w-0">
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-foreground-muted">
          {feedback.referenceLabel}
        </p>
        <span className="w-full max-w-full text-lg sm:text-3xl md:text-4xl font-display font-black tracking-wide sm:tracking-widest bg-accent-pink/10 px-2 sm:px-4 py-2 border border-foreground sm:border-2 break-all text-center">
          {reference}
        </span>
        <p className="text-[10px] sm:text-xs font-bold text-foreground-muted uppercase tracking-wide sm:tracking-widest mt-1 text-pretty">
          Save this to track your request
        </p>
      </div>

      {logistics === "porter_arranged" && (
        <div className="bg-white border border-foreground sm:border-2 p-4 sm:p-6 shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left w-full min-w-0 flex flex-col gap-3">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest">What happens next — courier</p>
          <ol className="list-decimal pl-5 text-sm font-medium space-y-2 text-foreground/90">
            <li>Your drop was submitted. Check Your Drops for its current status.</li>
            <li>A claimer requests it — you Accept or Decline from your gift page.</li>
            <li>After Accept, Reloved books a courier gate to gate once you both agree timing.</li>
            <li>Leave the item in a bag with building security — pickup at the main gate only.</li>
            <li>
              Item stays <span className="font-black">₹0 free</span>. Reloved covers courier for early rides; after that the claimer may pay courier COD.
            </li>
          </ol>
        </div>
      )}
      {(logistics === "giver_sends" || logistics === "receiver_collects") && (
        <div className="bg-white border border-foreground sm:border-2 p-4 sm:p-6 shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left w-full min-w-0 flex flex-col gap-3">
          <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest">What happens next</p>
          <ol className="list-decimal pl-5 text-sm font-medium space-y-2 text-foreground/90">
            <li>Your drop was submitted. Check Your Drops for its current status.</li>
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

      <div className="public-give-success-actions">
        <Link to={feedback.recovery.href} className="w-full sm:w-auto min-w-0" onClick={() => track(AnalyticsEvent.navAccount, { source: "give_success" })}>
          <Button variant="cta" className="w-full font-bold uppercase tracking-wide sm:tracking-widest">
            {feedback.recovery.label}
          </Button>
        </Link>
        <Link to="/drop" className="w-full sm:w-auto min-w-0" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "give_success" })}>
          <Button variant="outline" className="w-full font-bold uppercase tracking-wide sm:tracking-widest">
            Explore the Wall
          </Button>
        </Link>
      </div>
    </div>
  )
}
