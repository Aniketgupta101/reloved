import React from "react"
import { cn } from "@/lib/utils"

export function Tape({ className }: { className?: string }) {
  return (
    <div className={cn("absolute w-10 h-3 bg-white/70 backdrop-blur-sm border border-black/10 shadow-sm opacity-90", className)} />
  )
}

/** Frosted outline stamp — same shell for FREE / status labels; pass `tone` for color. */
export function FreeStamp({
  className,
  label = "FREE",
  shortLabel,
  tone = "border-accent-red text-accent-red",
}: {
  className?: string
  label?: string
  /** Compact label on narrow cards (mobile); falls back to `label`. */
  shortLabel?: string
  tone?: string
}) {
  return (
    <div
      className={cn(
        "border border-current sm:border-2 font-display font-black uppercase",
        "text-[7px] leading-none tracking-wide px-1 py-0.5",
        "sm:text-[10px] sm:tracking-widest sm:px-2 sm:py-0.5",
        "md:text-xs",
        "rounded-sm bg-white/50 backdrop-blur-sm shadow-sm whitespace-nowrap max-w-full",
        tone,
        className
      )}
    >
      {shortLabel ? (
        <>
          <span className="sm:hidden">{shortLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </div>
  )
}

export function GraffitiMarks({ className }: { className?: string }) {
  return (
    <svg className={cn("opacity-20 pointer-events-none text-foreground", className)} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 150 C 40 130, 60 160, 80 140 C 100 120, 120 170, 140 130 C 160 90, 180 110, 190 80" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 80 L 60 40 L 80 90" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="150" cy="50" r="8" fill="currentColor" />
      <circle cx="160" cy="70" r="4" fill="currentColor" />
      <circle cx="135" cy="65" r="5" fill="currentColor" />
    </svg>
  )
}
