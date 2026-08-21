import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { GraffitiWallBackground } from "@/components/sections/GraffitiWallBackground"
import { SafeImage } from "@/components/ui/SafeImage"
import { api, resolveImageUrl } from "@/lib/api"
import { Sparkles, Heart } from "lucide-react"

export function Love() {
  const [donors, setDonors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchCompletedDonors() {
      setLoading(true)
      try {
        const { items } = await api.get<{ items: any[] }>("/api/items?status=reloved")
        setDonors(items)
      } catch (e) {
        console.error("Error fetching completed donors:", e)
        setDonors([])
      } finally {
        setLoading(false)
      }
    }
    fetchCompletedDonors()
  }, [])

  const sampleRecognitionCards = [
    { title: "Athletic Running Shoes", donor: "Priya S.", locality: "Colaba", category: "Footwear", note: "Pass on with warmth!" },
    { title: "Warm Winter Sweaters", donor: "Rahul M.", locality: "Malad", category: "Clothing", note: "Glad these keep another family warm." },
    { title: "Study Desk Lamp", donor: "Anonymous Donor", locality: "Bandra", category: "Home", note: "Given freely with kindness." },
    { title: "Children's Book Collection", donor: "Aarav K.", locality: "Juhu", category: "Books & Learning", note: "Ready for young readers." }
  ]

  return (
    <div className="relative min-h-screen bg-surface-muted overflow-hidden py-16 px-4">
      {/* Graffiti Art Wall Background (Ref: User Screenshot) */}
      <GraffitiWallBackground />

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 bg-black text-white text-xs font-black uppercase tracking-widest mb-4 border border-black shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            <Heart size={14} className="text-accent-red fill-accent-red" />
            <span>COMMUNITY DONOR RECOGNITION</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-display font-black uppercase leading-none mb-4 text-foreground">
            Wall of Love
          </h1>
          
          <p className="text-xl md:text-2xl text-foreground font-medium mb-6">
            Honoring the individuals who keep preloved items in active community circulation.
          </p>

          <div className="bg-white/95 backdrop-blur-sm border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] mb-8">
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
              Donor Recognition Preferences
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold uppercase tracking-wider">
              <li className="flex items-center gap-2 bg-surface-muted p-2.5 border border-foreground/20">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-blue" />
                Show my first name
              </li>
              <li className="flex items-center gap-2 bg-surface-muted p-2.5 border border-foreground/20">
                <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
                Recognise me anonymously
              </li>
              <li className="flex items-center gap-2 bg-surface-muted p-2.5 border border-foreground/20">
                <span className="w-2.5 h-2.5 rounded-full bg-foreground" />
                Do not show me publicly
              </li>
            </ul>
          </div>
        </div>

        {/* Gallery Wall Grid */}
        {loading ? (
          <div className="p-12 text-center font-mono text-sm uppercase tracking-widest font-bold bg-white/80 border-2 border-foreground">
            Loading Wall of Love...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {donors.map((donor, idx) => (
              <motion.div
                key={donor.id || idx}
                initial={{ opacity: 0, scale: 0.9, rotate: (idx % 2 === 0 ? -2 : 2) }}
                animate={{ opacity: 1, scale: 1, rotate: (idx % 2 === 0 ? -1 : 1) }}
                className="bg-white border-2 border-foreground p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between group hover:translate-y-[-4px] transition-transform"
              >
                <Tape className="-top-3 left-1/2 -translate-x-1/2 rotate-1" />
                <FreeStamp className="absolute -bottom-3 -right-3 scale-75 z-20" />
                
                <div>
                  <div className="relative aspect-square border-2 border-foreground mb-3 overflow-hidden bg-surface-muted">
                    <SafeImage
                      src={resolveImageUrl(donor.images?.[0]?.storagePath)}
                      alt={donor.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2 bg-accent-green text-foreground font-black text-[10px] px-2 py-0.5 border border-foreground uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      RELOVED
                    </div>
                  </div>

                  <span className="text-lg font-display font-black uppercase tracking-wide text-foreground block mb-1">
                    {donor.donorRecognition || "Anonymous Donor"}
                  </span>
                  
                  <p className="text-xs font-bold text-accent-blue uppercase tracking-wider mb-2">
                    Reloved: {donor.title}
                  </p>
                </div>

                <div className="pt-3 border-t-2 border-foreground/10 mt-2 flex justify-between items-center text-[10px] font-mono text-foreground-muted uppercase font-bold">
                  <span>{donor.locality || "Mumbai"}</span>
                  <span className="text-accent-green font-black">₹0 FREE</span>
                </div>
              </motion.div>
            ))}

            {sampleRecognitionCards.map((card, idx) => (
              <motion.div
                key={`sample-${idx}`}
                initial={{ opacity: 0, scale: 0.9, rotate: (idx % 2 === 0 ? 2 : -2) }}
                animate={{ opacity: 1, scale: 1, rotate: (idx % 2 === 0 ? 1 : -1) }}
                className="bg-accent-yellow/20 border-2 border-foreground p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between"
              >
                <Tape className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
                <div>
                  <div className="flex items-center gap-2 text-accent-red mb-2">
                    <Heart size={16} className="fill-accent-red" />
                    <span className="text-xs font-black uppercase tracking-widest">Community Love</span>
                  </div>
                  <p className="font-display font-black text-base uppercase text-foreground mb-2">
                    “{card.note}”
                  </p>
                  <p className="text-xs font-bold text-foreground-muted">
                    {card.title} &bull; {card.locality}
                  </p>
                </div>

                <div className="pt-3 border-t-2 border-foreground/10 mt-4 flex justify-between items-center text-[10px] font-mono font-bold uppercase">
                  <span>Donor: {card.donor}</span>
                  <span className="bg-foreground text-white px-1.5 py-0.5">Completed</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
