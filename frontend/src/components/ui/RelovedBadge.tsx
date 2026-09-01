import { cn } from "@/lib/utils"

type RelovedBadgeVariant = "default" | "onDark"

/** Bundled in frontend/public/images — always same-origin, never via external CDN. */
const LOGO_SRC = {
  default: "/images/reloved-logo.webp",
  onDark: "/images/reloved-logo-on-dark.webp",
} as const

/**
 * Official Reloved circular mark - fills its container edge-to-edge.
 * - default: white disk + black wordmark (navbar, light surfaces)
 * - onDark: white wordmark + neon ring (photo / dark sections)
 */
export function RelovedBadge({
  className = "",
  variant = "default",
}: {
  className?: string
  variant?: RelovedBadgeVariant
}) {
  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-full shrink-0 bg-transparent", className)}>
      <img
        src={LOGO_SRC[variant]}
        alt="reloved"
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  )
}
