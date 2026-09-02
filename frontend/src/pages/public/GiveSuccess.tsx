import { useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/Button"
import { CheckCircle2, Copy } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function GiveSuccess() {
  const { reference } = useParams()

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
        Your item has been submitted for review. We will notify you once it has been matched with a community partner.
      </p>

      <div className="bg-white p-8 border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col items-center gap-4 w-full">
        <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submission Reference</p>
        <div className="flex items-center gap-4">
          <span className="text-4xl font-display font-black tracking-widest bg-accent-blue/10 px-4 py-2 border-2 border-foreground">{reference}</span>
          <button onClick={copyRef} className="p-4 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-surface-muted">
            <Copy size={24} />
          </button>
        </div>
        <p className="text-xs font-bold text-foreground-muted uppercase tracking-widest mt-2">Save this reference to track your donation.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 mt-8 w-full sm:w-auto">
        <Link to="/account" className="w-full sm:w-auto" onClick={() => track(AnalyticsEvent.navAccount, { source: "give_success" })}>
          <Button variant="cta" className="w-full font-bold uppercase tracking-widest">
            View my profile
          </Button>
        </Link>
        <Link to={`/track/${reference}`} className="w-full sm:w-auto" onClick={() => track(AnalyticsEvent.trackLookup, { reference: reference || "", source: "give_success" })}>
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
