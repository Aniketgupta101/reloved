import { KindnessMap } from "@/components/sections/KindnessMap"
import { MapPin, Sparkles } from "lucide-react"

export function MapPage() {
  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-16">
      <div className="mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white text-xs font-black uppercase tracking-widest mb-4 border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          <MapPin size={14} className="text-accent-pink" />
          <span>MUMBAI COMMUNITY GEOGRAPHY</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-display font-black uppercase leading-none mb-4">
          Community Impact Map
        </h1>
        <p className="text-lg md:text-xl text-foreground-muted font-medium max-w-2xl leading-relaxed">
          Explore broad localities, active partner hubs, and verified drop points across Mumbai where preloved items are in active circulation.
        </p>
      </div>

      <div className="bg-white border-2 border-foreground p-6 md:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        <KindnessMap />
      </div>
    </div>
  )
}
