import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { MOCK_ITEMS } from "@/lib/seed"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { api, resolveImageUrl } from "@/lib/api"

// Three real, verified backdrop options — swap live with the test buttons
// below instead of guessing which one reads best.
const BACKDROP_OPTIONS = [
  {
    key: "warm-brick",
    label: "Backdrop A",
    url: "https://images.unsplash.com/photo-1727840732819-bf9116432beb?w=2400&q=75&auto=format&fit=crop",
    note: "Warm cream brick, dappled leaf-shadow light — closest match to the hero's courtyard + vines.",
  },
  {
    key: "vine-wall",
    label: "Backdrop B",
    url: "https://images.unsplash.com/photo-1642466181428-84006edef2ec?w=2400&q=75&auto=format&fit=crop",
    note: "Weathered grey/terracotta brick with a real hanging vine growing across it — more literal, more textured.",
  },
  {
    key: "clean-stucco",
    label: "Backdrop C",
    url: "https://images.unsplash.com/photo-1523878288860-7ad281611901?w=2400&q=75&auto=format&fit=crop",
    note: "Plain warm-white stucco, minimal — quietest option, lets the item cards do all the talking.",
  },
  {
    key: "uniform-beige",
    label: "Backdrop D",
    url: "/images/hero-bg-desktop.png",
    note: "Client feedback: keep the background uniform — same beige courtyard wall as the hero, no brick switch.",
  },
] as const

const EASE = [0.32, 0.72, 0, 1] as const

export function WallOfKindnessSection({ flushWithHero = false }: { flushWithHero?: boolean }) {
  const [items, setItems] = useState<WallItem[]>(MOCK_ITEMS.slice(0, 12) as unknown as WallItem[])
  const [backdropKey, setBackdropKey] = useState<(typeof BACKDROP_OPTIONS)[number]["key"]>("uniform-beige")
  const prefersReducedMotion = useReducedMotion()
  const activeBackdrop = BACKDROP_OPTIONS.find((b) => b.key === backdropKey) ?? BACKDROP_OPTIONS[0]

  useEffect(() => {
    async function fetchItems() {
      try {
        const { items: data } = await api.get<{ items: any[] }>("/api/items")
        if (data.length > 0) {
          setItems(
            data.slice(0, 12).map((item) => ({
              ...item,
              public_status: item.publicStatus,
              item_images: (item.images || []).map((img: any) => ({ storage_path: resolveImageUrl(img.storagePath) })),
            }))
          )
        }
      } catch (err) {
        console.warn("Failed to load live Wall of Kindness preview:", err)
      }
    }
    fetchItems()
  }, [])

  return (
    <section
      className={`relative z-0 overflow-hidden border-b-2 border-foreground min-h-[100vh] md:min-h-[85vh] flex flex-col bg-background ${
        flushWithHero ? "" : "-mt-[4.5vh]"
      }`}
    >
      {/* Dev-only backdrop switcher — pick a background before committing.
          A dropdown on mobile, buttons from sm up. */}
      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">
        <select
          aria-label="Wall of Kindness backdrop"
          value={backdropKey}
          onChange={(e) => setBackdropKey(e.target.value as (typeof BACKDROP_OPTIONS)[number]["key"])}
          className="sm:hidden text-[10px] font-black uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white text-foreground px-2 py-1.5 max-w-[42vw]"
        >
          {BACKDROP_OPTIONS.map((b) => (
            <option key={b.key} value={b.key}>{b.label}</option>
          ))}
        </select>

        <div className="hidden sm:flex flex-col gap-2">
          {BACKDROP_OPTIONS.map((b) => (
            <button
              key={b.key}
              onClick={() => setBackdropKey(b.key)}
              title={b.note}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all ${
                backdropKey === b.key ? "bg-foreground text-white" : "bg-white text-foreground hover:bg-accent-yellow"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <motion.div
        key={activeBackdrop.key}
        className="absolute inset-0"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <img src={activeBackdrop.url} alt="" className="w-full h-full object-cover" />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(20,12,8,0.62) 0%, rgba(20,12,8,0.32) 35%, rgba(20,12,8,0.68) 100%)" }}
        />
      </motion.div>

      <motion.div
        className="relative z-10 flex-1 flex flex-col justify-center py-16 md:py-20"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.08 }}
      >
        <div className="container px-4 mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4 border-b-2 border-white/30 pb-6">
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-white/80 block mb-1">
                LIVE PRELOVED CIRCULATION
              </span>
              <h2 className="text-4xl md:text-6xl font-display font-black leading-tight uppercase text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,0.9)]">
                Wall of Kindness
              </h2>
            </div>

            <Link to="/drop" className="inline-flex items-center gap-2 font-black uppercase text-sm px-4 py-2 bg-accent-yellow border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all">
              <span>Explore the full wall</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <WallOfKindness items={items} />
        </div>
      </motion.div>
    </section>
  )
}
