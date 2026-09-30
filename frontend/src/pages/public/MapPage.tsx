import { lazy, Suspense } from "react"
import { MapPin } from "lucide-react"

const KindnessMap = lazy(async () => {
  const module = await import("@/components/sections/KindnessMap")
  return { default: module.KindnessMap }
})

export function MapPage() {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="mb-10 sm:mb-12 min-w-0">
        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 bg-black text-white text-[10px] sm:text-xs font-black uppercase tracking-widest mb-4 border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] max-w-full">
          <MapPin size={14} className="text-accent-pink shrink-0" />
          <span>MUMBAI COMMUNITY GEOGRAPHY</span>
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black uppercase leading-none mb-4 text-balance">
          Community Impact Map
        </h1>
        <p className="text-base sm:text-lg md:text-xl text-foreground-muted font-medium max-w-2xl leading-relaxed">
          Explore broad localities, active partner hubs, and verified drop points across Mumbai where preloved items are in active circulation.
        </p>
      </div>

      <div className="bg-white border-2 border-foreground p-3 sm:p-6 md:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] min-w-0 overflow-hidden">
        <Suspense fallback={<div className="min-h-[420px] grid place-items-center font-bold text-foreground-muted" role="status">Loading impact map…</div>}>
          <KindnessMap />
        </Suspense>
      </div>
    </div>
  )
}
