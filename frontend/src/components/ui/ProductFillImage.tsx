import * as React from "react"
import { Package } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  buildWallFillObjectUrl,
  getCachedWallFill,
  wallFillDisplayUrl,
} from "@/lib/wallProductImage"
import { persistFillUrl, prefetchImage, readPersistedFillUrl } from "@/lib/imageCache"

type Props = {
  src?: string | null
  alt: string
  className?: string
  priority?: boolean
  /**
   * Start loading as soon as mounted (no IntersectionObserver wait).
   * Use for the first row(s) of a grid so cards don't stay blank while on-screen.
   */
  immediate?: boolean
  /** Dim/gray while drop image is still processing. */
  muted?: boolean
}

const REVEAL_MS = 750
const REVEAL_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const LOAD_FALLBACK_MS = 7000

/** Clear loading plate so empty cards never look like a finished white tile. */
function ImageLoadingSkeleton() {
  return (
    <span
      aria-hidden
      data-testid="wall-image-skeleton"
      className="absolute inset-0 z-[1] pointer-events-none overflow-hidden bg-[#e8e2d8]"
    >
      <span className="absolute inset-0 animate-pulse bg-[#d4cdc2]" />
      <span className="absolute left-[18%] right-[18%] top-[22%] h-3 rounded-sm bg-black/10" />
      <span className="absolute left-[28%] right-[28%] top-[38%] h-2.5 rounded-sm bg-black/10" />
      <span className="absolute left-[22%] right-[22%] bottom-[20%] h-3 rounded-sm bg-black/10" />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-[0.18em] text-foreground/35">
        Loading
      </span>
    </span>
  )
}

/**
 * Wall card photo: visible shimmer skeleton until bytes land, then soft wipe.
 */
export function ProductFillImage({
  src,
  alt,
  className,
  priority,
  immediate,
  muted,
}: Props) {
  const rootRef = React.useRef<HTMLSpanElement | null>(null)
  const imgRef = React.useRef<HTMLImageElement | null>(null)
  const [inView, setInView] = React.useState(Boolean(priority || immediate))
  const [displaySrc, setDisplaySrc] = React.useState("")
  const [imgReady, setImgReady] = React.useState(false)
  const [wipeOpen, setWipeOpen] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState(false)
  const [reduceMotion, setReduceMotion] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener?.("change", onChange)
    return () => mq.removeEventListener?.("change", onChange)
  }, [])

  React.useEffect(() => {
    setImgReady(false)
    setWipeOpen(false)
    setDone(false)
    setError(false)
    // Prefer cached/persisted URL immediately so returning visitors don't flash blank.
    if (src) {
      const warm = getCachedWallFill(src) || readPersistedFillUrl(src) || wallFillDisplayUrl(src)
      setDisplaySrc(warm)
    } else {
      setDisplaySrc("")
    }
    if (priority || immediate) setInView(true)
  }, [src, priority, immediate])

  React.useEffect(() => {
    if (priority || immediate || inView) return
    const node = rootRef.current
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setInView(true)
        observer.disconnect()
      },
      { root: null, rootMargin: "400px 0px", threshold: 0.01 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [priority, immediate, inView])

  React.useEffect(() => {
    if (!inView) return
    if (!src) {
      setDisplaySrc("")
      setError(true)
      return
    }

    setError(false)
    setImgReady(false)
    setWipeOpen(false)
    setDone(false)

    const cached = getCachedWallFill(src)
    const persisted = readPersistedFillUrl(src)
    const preferred = cached || persisted || wallFillDisplayUrl(src)
    setDisplaySrc(preferred)
    persistFillUrl(src, preferred)
    void prefetchImage(src)
    void prefetchImage(preferred)

    const fallbackTimer = window.setTimeout(() => {
      setDisplaySrc((current) => (current === src ? current : src))
    }, LOAD_FALLBACK_MS)

    if (!cached) {
      void buildWallFillObjectUrl(src)
        .then((url) => {
          persistFillUrl(src, url.startsWith("blob:") ? preferred : url)
        })
        .catch(() => {
          /* keep display url */
        })
    }

    return () => window.clearTimeout(fallbackTimer)
  }, [src, inView])

  const beginReveal = React.useCallback(() => {
    setImgReady((prev) => (prev ? prev : true))
  }, [])

  React.useEffect(() => {
    if (!imgReady || done) return
    if (reduceMotion) {
      setWipeOpen(true)
      setDone(true)
      return
    }
    let cancelled = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setWipeOpen(true)
      })
    })
    const t = window.setTimeout(() => {
      if (!cancelled) setDone(true)
    }, REVEAL_MS + 48)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [imgReady, done, reduceMotion])

  React.useEffect(() => {
    if (!displaySrc || !inView) return
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) beginReveal()
  }, [displaySrc, inView, beginReveal])

  if (error || (inView && !displaySrc && !src)) {
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

  const showSkeleton = !imgReady

  return (
    <span
      ref={rootRef}
      className="relative block h-full w-full overflow-hidden bg-[#e8e2d8]"
      aria-busy={showSkeleton}
    >
      {inView && displaySrc ? (
        <img
          ref={imgRef}
          src={displaySrc}
          alt={alt}
          className={cn(
            "absolute inset-0 m-auto h-full w-full object-contain object-center bg-white",
            imgReady ? (muted ? "opacity-40 grayscale" : "opacity-100") : "opacity-0",
            className,
          )}
          loading={priority || immediate ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : "auto"}
          onLoad={beginReveal}
          onError={() => {
            if (src && displaySrc !== src) {
              setDisplaySrc(src)
              return
            }
            setError(true)
          }}
        />
      ) : null}

      {showSkeleton ? <ImageLoadingSkeleton /> : null}

      {imgReady && !done && (
        <span
          aria-hidden
          data-testid="wall-image-curtain"
          className="absolute inset-0 z-[2] pointer-events-none bg-[#e8e2d8]"
          style={{
            transform: wipeOpen ? "translateY(100%)" : "translateY(0%)",
            transition: reduceMotion ? "none" : `transform ${REVEAL_MS}ms ${REVEAL_EASE}`,
          }}
        />
      )}
    </span>
  )
}
