import { useState } from "react"
import { assetUrl } from "@/lib/assets"
import { cn } from "@/lib/utils"

type RelovedBadgeVariant = "default" | "onDark"

/**
 * Official Reloved signature badge (Direction_1 primary mark):
 * black disc + white RELOVED wordmark + neon kindness ring.
 * Served via assetUrl (VITE_ASSET_BASE / Firebase Hosting CDN).
 */
export function RelovedBadge({
  className = "",
  variant: _variant = "default",
}: {
  className?: string
  /** Kept for API compatibility; both variants use the primary black badge. */
  variant?: RelovedBadgeVariant
}) {
  const [imgSrc, setImgSrc] = useState(() => `${assetUrl("/images/reloved-logo.webp")}?v=12`)
  const [hasError, setHasError] = useState(false)

  return (
    <div className={cn("relative aspect-square overflow-hidden rounded-full shrink-0 bg-black flex items-center justify-center", className)}>
      {!hasError ? (
        <img
          src={imgSrc}
          alt="reloved"
          loading="eager"
          decoding="async"
          onError={() => {
            if (imgSrc.includes(".webp")) {
              setImgSrc(`${assetUrl("/images/reloved-logo.png")}?v=12`)
            } else if (!imgSrc.includes("reloved-digital.web.app")) {
              setImgSrc("https://reloved-digital.web.app/images/reloved-logo.png?v=12")
            } else {
              setHasError(true)
            }
          }}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : (
        <div className="w-full h-full rounded-full bg-black flex items-center justify-center p-1 border-2 border-accent-pink">
          <span className="font-['Bebas_Neue',sans-serif] text-[10px] sm:text-xs text-white uppercase tracking-wider">
            reloved
          </span>
        </div>
      )}
    </div>
  )
}
