import * as React from "react"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  buildWallFillObjectUrl,
  getCachedWallFill,
  wallFillDisplayUrl,
} from "@/lib/wallProductImage"

type Props = {
  src?: string | null
  alt: string
  className?: string
  priority?: boolean
  /** Dim/gray while drop image is still processing. */
  muted?: boolean
}

/**
 * Wall card product photo: trims uneven studio padding per image, then fills
 * a square so tees and wide shirts read at the same large size.
 */
export function ProductFillImage({ src, alt, className, priority, muted }: Props) {
  const [displaySrc, setDisplaySrc] = React.useState<string>(() => {
    if (!src) return ""
    return getCachedWallFill(src) || wallFillDisplayUrl(src)
  })
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    if (!src) {
      setDisplaySrc("")
      setError(true)
      return
    }

    let cancelled = false
    setError(false)
    setLoaded(false)

    const cached = getCachedWallFill(src)
    if (cached) {
      setDisplaySrc(cached)
      return
    }

    // Instant CDN trim so the grid isn't empty while canvas analyzes.
    setDisplaySrc(wallFillDisplayUrl(src))

    void buildWallFillObjectUrl(src)
      .then((url) => {
        if (!cancelled) setDisplaySrc(url)
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(wallFillDisplayUrl(src))
      })

    return () => {
      cancelled = true
    }
  }, [src])

  if (error || !displaySrc) {
    return (
      <div
        className={cn(
          "bg-surface-muted flex flex-col items-center justify-center p-4 text-foreground-muted",
          className,
        )}
      >
        <Package size={28} className="mb-2 text-foreground/40" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-center">
          {alt || "Preloved Item"}
        </span>
      </div>
    )
  }

  return (
    <span className="relative block h-full w-full overflow-hidden bg-white">
      {!loaded && (
        <span aria-hidden className="absolute inset-0 z-[1] animate-pulse bg-surface-muted pointer-events-none" />
      )}
      <img
        src={displaySrc}
        alt={alt}
        className={cn(
          "absolute inset-0 m-auto h-full w-full object-contain object-center bg-white transition-opacity duration-300",
          !loaded ? "opacity-0" : muted ? "opacity-40 grayscale" : "opacity-100",
          className,
        )}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (src && displaySrc !== src) {
            setDisplaySrc(src)
            return
          }
          setError(true)
        }}
      />
    </span>
  )
}
