import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { SafeImage } from "@/components/ui/SafeImage"
import { api } from "@/lib/api"
import { Heart } from "lucide-react"

const KIDS_HAPPY_IMAGES = [
  "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=800&auto=format&fit=crop&q=80", // Happy child holding athletic gear/shoes
  "https://images.unsplash.com/photo-1509062522246-3755977927d7?w=800&auto=format&fit=crop&q=80", // Smiling student with learning books
  "https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?w=800&auto=format&fit=crop&q=80", // Joyful child wearing warm clothes
  "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?w=800&auto=format&fit=crop&q=80", // Kid with backpack/toys outdoors
  "https://images.unsplash.com/photo-1542810634-71277d95dcbb?w=800&auto=format&fit=crop&q=80", // Happy kids group with gifts
  "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=800&auto=format&fit=crop&q=80"  // Joyful smiling child
]

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

  return (
    <div className="relative min-h-screen overflow-hidden py-16 px-4">
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
        ) : donors.length === 0 ? (
          <div className="p-16 text-center bg-white/90 border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
            <h3 className="text-2xl font-display font-black uppercase text-foreground">Nothing here yet.</h3>
            <p className="text-foreground-muted mt-2">Once items are reloved into new homes, they'll show up here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {donors.map((donor, idx) => {
              const kidImage = KIDS_HAPPY_IMAGES[idx % KIDS_HAPPY_IMAGES.length]

              return (
                <motion.div
                  key={donor.id || idx}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="bg-white border-2 border-foreground p-4 shadow-[6px_6px_0px_rgba(0,0,0,1)] relative flex flex-col justify-between group hover:translate-y-[-4px] transition-transform"
                >
                  <Tape className="-top-3 left-1/2 -translate-x-1/2 rotate-1" />
                  <FreeStamp className="absolute -bottom-3 -right-3 scale-75 z-20" />

                  <div>
                    <div className="relative aspect-square border-2 border-foreground mb-3 overflow-hidden bg-surface-muted">
                      <SafeImage
                        src={kidImage}
                        alt={`Happy recipient of ${donor.title}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute top-2 right-2 bg-accent-pink text-foreground font-black text-[10px] px-2 py-0.5 border border-foreground uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                        RELOVED &bull; GIFTED
                      </div>
                    </div>

                    <h3 className="font-display font-black text-lg uppercase leading-tight mb-1">
                      {donor.title}
                    </h3>
                    <p className="text-xs font-bold text-accent-blue uppercase tracking-wider mb-2">
                      Gifted with love in {donor.locality || "Mumbai"}
                    </p>
                  </div>

                  <div className="pt-3 border-t-2 border-foreground/10 mt-2 flex justify-between items-center text-[10px] font-mono text-foreground-muted uppercase font-bold">
                    <span>Donor Recognized</span>
                    <span className="text-accent-green font-black">100% FREE</span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
