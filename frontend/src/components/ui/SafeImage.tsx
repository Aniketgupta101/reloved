import * as React from "react"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string
  alt?: string
  className?: string
  fallbackSrc?: string
  /** Above-the-fold / wall grid - skips lazy-loading so cards aren't blank while scrolling. */
  priority?: boolean
  /** Optional pulse placeholder (off by default - looked like faded/blank tiles). */
  showSkeleton?: boolean
}

/**
 * Image always stays fully opaque (opacity-100). Lazy + skeleton caused
 * white empty cards on scroll; wall thumbs are small enough to load eagerly.
 */
export function SafeImage({
  src,
  alt,
  className,
  fallbackSrc,
  priority,
  showSkeleton = false,
  loading,
  decoding,
  onLoad,
  onError,
  ...props
}: SafeImageProps) {
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [error, setError] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    setError(false)
    const el = imgRef.current
    setLoaded(Boolean(el?.complete && (el.naturalWidth || 0) > 0))
  }, [src])

  if (error || !src) {
    return (
      <div className={`bg-surface-muted flex flex-col items-center justify-center p-4 border border-foreground/10 text-foreground-muted ${className || ""}`}>
        <Package size={28} className="mb-2 text-foreground/40" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-center">{alt || "Preloved Item"}</span>
      </div>
    )
  }

  return (
    <span className="relative block w-full h-full overflow-hidden bg-white">
      {showSkeleton && !loaded && (
        <span
          aria-hidden
          className="absolute inset-0 z-[1] bg-surface-muted/40 pointer-events-none"
        />
      )}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={cn("opacity-100", className)}
        loading={loading ?? (priority ? "eager" : "lazy")}
        decoding={decoding ?? "async"}
        fetchPriority={priority ? "high" : "auto"}
        onLoad={(e) => {
          setLoaded(true)
          onLoad?.(e)
        }}
        onError={(e) => {
          if (fallbackSrc && src !== fallbackSrc) {
            ;(e.currentTarget as HTMLImageElement).src = fallbackSrc
            return
          }
          setError(true)
          onError?.(e)
        }}
        {...props}
      />
    </span>
  )
}
