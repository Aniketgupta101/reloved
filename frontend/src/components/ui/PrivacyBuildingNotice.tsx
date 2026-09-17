import { AlertTriangle } from "lucide-react"
import type { ReactNode } from "react"

/**
 * Shared privacy rule for Give / Claim / onboarding address fields.
 * `extraNote` folds a second, related line (e.g. review time, distance
 * matching) into the same card instead of stacking a separate box next to it.
 */
export function PrivacyBuildingNotice({ className = "", extraNote }: { className?: string; extraNote?: ReactNode }) {
  return (
    <div
      className={`flex gap-3 border-2 border-foreground bg-accent-pink/15 px-3 py-3 text-sm leading-snug ${className}`}
      role="note"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
      <div className="flex flex-col gap-2">
        <div>
          <p className="font-black uppercase tracking-widest text-xs mb-1">Important privacy rule</p>
          <p className="text-foreground">
            To protect your anonymity, do <span className="font-bold">not</span> enter your flat number or wing.
            Only select your <span className="font-bold">building name</span> from the map search,
            and hand the item to your building&apos;s security guard in a <span className="font-bold">bag</span>.
          </p>
        </div>
        {extraNote && (
          <p className="text-foreground text-xs border-t border-foreground/20 pt-2">{extraNote}</p>
        )}
      </div>
    </div>
  )
}

const PRIVATE_DETAIL = /\b(flat|wing|apt\.?|apartment|floor\s*\d|#\s*\d+)\b/i

/** Soft check — returns a warning string if the user may have typed private housing detail. */
export function privacyAddressWarning(value: string): string | null {
  if (!value.trim()) return null
  if (PRIVATE_DETAIL.test(value)) {
    return "Please remove flat / wing / apartment details. Use building or landmark name only."
  }
  return null
}
