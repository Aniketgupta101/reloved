import * as React from "react"
import { Package } from "lucide-react"

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string
  alt?: string
  className?: string
  fallbackSrc?: string
}

export function SafeImage({ src, alt, className, fallbackSrc, ...props }: SafeImageProps) {
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    setError(false)
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
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      {...props}
    />
  )
}
