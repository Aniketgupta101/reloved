import { assetUrl } from "@/lib/assets"
import { cn } from "@/lib/utils"

type RelovedBadgeVariant = "default" | "onDark"

/**
 * Official Reloved circular mark — fills its container edge-to-edge.
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
  const src =
    variant === "onDark"
      ? `${assetUrl("/images/reloved-logo-on-dark.jpg")}?v=5`
      : `${assetUrl("/images/reloved-logo.png")}?v=5`

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
