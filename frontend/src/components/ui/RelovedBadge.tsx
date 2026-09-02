import { cn } from "@/lib/utils"

type RelovedBadgeVariant = "default" | "onDark"

/**
 * Official Reloved signature badge (Direction_1 primary mark):
 * black disc + white RELOVED wordmark + neon kindness ring.
 * Same-origin `/images/...` so CDN waitlist HTML cannot replace the asset.
 */
export function RelovedBadge({
  className = "",
  variant: _variant = "default",
}: {
  className?: string
  /** Kept for API compatibility; both variants use the primary black badge. */
  variant?: RelovedBadgeVariant
}) {
  const src = "/images/reloved-logo.webp?v=11"

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-full shrink-0 bg-transparent", className)}>
      <img
        src={src}
        alt="reloved"
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  )
}
