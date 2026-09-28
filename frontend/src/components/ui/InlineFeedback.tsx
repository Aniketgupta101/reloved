import { useEffect, useRef } from "react"
import type { UserFacingFeedback } from "@/lib/userFacingErrors"

export function InlineFeedback({ feedback }: { feedback: UserFacingFeedback }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isWarning = feedback.tone === "warn"

  useEffect(() => {
    containerRef.current?.focus({ preventScroll: false })
  }, [])

  return (
    <div
      ref={containerRef}
      role="alert"
      aria-live="assertive"
      tabIndex={-1}
      data-feedback-kind={feedback.kind}
      className={`mt-6 border-2 p-4 text-sm focus:outline-none ${
        isWarning
          ? "border-foreground bg-accent-yellow/25 text-foreground"
          : "border-accent-red bg-accent-red/10 text-foreground"
      }`}
    >
      <h3 className="font-display font-black uppercase tracking-tight text-base">{feedback.title}</h3>
      <p className="mt-1 font-medium leading-relaxed">{feedback.message}</p>
      {feedback.recovery && (
        <a
          href={feedback.recovery.href}
          target={feedback.recovery.openInNewTab ? "_blank" : undefined}
          rel={feedback.recovery.openInNewTab ? "noreferrer" : undefined}
          className="mt-3 inline-flex font-black uppercase tracking-widest underline underline-offset-4"
        >
          {feedback.recovery.label}
        </a>
      )}
    </div>
  )
}
