import { Link } from "react-router-dom"
import { Mail, HelpCircle } from "lucide-react"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function HelpCta({ source = "help_cta" }: { source?: string }) {
  return (
    <div className="border-2 border-foreground bg-white p-6 md:p-8 shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 shrink-0 bg-accent-pink border-2 border-foreground flex items-center justify-center">
          <HelpCircle size={20} className="stroke-[3]" />
        </div>
        <div>
          <p className="font-display font-black uppercase text-lg leading-tight">Still stuck?</p>
          <p className="text-sm text-foreground-muted font-medium">Our community team replies within 24-48 hours.</p>
        </div>
      </div>
      <Link
        to="/contact"
        onClick={() => track(source === "faq" ? AnalyticsEvent.faqContactCta : AnalyticsEvent.helpContactCta, { source })}
        className="shrink-0 h-11 px-6 flex items-center gap-2 border-2 border-foreground rounded-none font-black uppercase text-xs tracking-widest shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-green text-foreground"
      >
        <Mail size={14} className="stroke-[3]" />
        Contact Us
      </Link>
    </div>
  )
}
