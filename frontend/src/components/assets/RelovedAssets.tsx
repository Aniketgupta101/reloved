import React from "react"
import { cn } from "@/lib/utils"

export function Tape({ className }: { className?: string }) {
  return (
    <div className={cn("absolute w-10 h-3 bg-white/70 backdrop-blur-sm border border-black/10 shadow-sm opacity-90", className)} />
  )
}

export function FreeStamp({ className }: { className?: string }) {
  return (
    <div className={cn("border-2 border-accent-red text-accent-red font-display font-black uppercase tracking-widest px-2 py-0.5 rounded-sm bg-white/50 backdrop-blur-sm shadow-sm", className)}>
      FREE
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
