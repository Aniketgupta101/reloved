import * as React from "react"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string
  alt?: string
  className?: string
  fallbackSrc?: string
  /** Above-the-fold images (hero, logo) — skips lazy-loading and asks the browser to fetch it first. */
  priority?: boolean
}

// Images are hosted on a separate origin (cPanel, see lib/assets.ts) rather
// than bundled with the app, so a real network round-trip happens on every
// first view. Two things soften that: lazy-loading so offscreen images
// don't compete with what's actually visible, and a pulsing placeholder +
// fade-in so a slow fetch reads as "loading" instead of a blank gap that
// suddenly pops.
export function SafeImage({ src, alt, className, fallbackSrc, priority, loading, decoding, onLoad, onError, ...props }: SafeImageProps) {
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [error, setError] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    setError(false)
    // A cached image is already `complete` by the time this effect runs, so
    // the browser never fires a fresh `load` event — without this check
    // `loaded` gets stuck false forever and the pulse animation (which
    // itself animates opacity) just loops on top of an already-visible
    // image instead of ever settling.
    setLoaded(imgRef.current?.complete ?? false)
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
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      className={cn(className, !loaded && "bg-surface-muted animate-pulse", "transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0")}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding={decoding ?? "async"}
      fetchPriority={priority ? "high" : undefined}
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      onError={(e) => {
        setError(true)
        onError?.(e)
      }}
      {...props}
    />
  )
}
