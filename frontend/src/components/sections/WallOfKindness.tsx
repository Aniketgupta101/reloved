import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { closetWallItems, isCutoutPath } from "@/lib/closetItems"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { api, resolveImageUrl } from "@/lib/api"
import { BackdropSwitcher, useSectionBackdrop } from "@/components/ui/SectionBackdrop"

// Real, verified photo options — swap live with the switcher instead of
// guessing which one reads best. "Beige" in the switcher's Colors group
// covers the "keep it uniform with the hero" request without needing its
// own photo entry any more.
const BACKDROP_OPTIONS = [
  // Default — red brick wall, confirmed as the keeper.
  {
    key: "brick-d",
    label: "Brick Wall D (default)",
    url: "https://images.unsplash.com/photo-1552240390-5aec540311b4?w=2400&q=75&auto=format&fit=crop",
  },
  {
    key: "warm-brick",
    label: "Brick Wall A",
    url: "https://images.unsplash.com/photo-1479670612349-3b5dba5179c7?w=2400&q=75&auto=format&fit=crop",
  },
  {
    key: "brick-b",
    label: "Brick Wall B",
    url: "https://images.unsplash.com/photo-1495578942200-c5f5d2137def?w=2400&q=75&auto=format&fit=crop",
  },
  {
    key: "brick-c",
    label: "Brick Wall C (weathered)",
    url: "https://images.unsplash.com/photo-1749705932447-420386f770fc?w=2400&q=75&auto=format&fit=crop",
  },
  {
    key: "courtyard",
    label: "Courtyard (real, matches hero)",
    url: "/images/hero-bg-desktop.png",
  },
  {
    key: "vine-wall",
    label: "Photo B",
    url: "https://images.unsplash.com/photo-1642466181428-84006edef2ec?w=2400&q=75&auto=format&fit=crop",
  },
  {
    key: "clean-stucco",
    label: "Photo C",
    url: "https://images.unsplash.com/photo-1523878288860-7ad281611901?w=2400&q=75&auto=format&fit=crop",
  },
] as const

const EASE = [0.32, 0.72, 0, 1] as const

export function WallOfKindnessSection({ flushWithHero = false }: { flushWithHero?: boolean }) {
  const closetPreview: WallItem[] = closetWallItems()
  const [items, setItems] = useState<WallItem[]>(closetPreview)
  const prefersReducedMotion = useReducedMotion()
  // Defaults to beige to match the catalogue reference. White stays in the switcher.
  const backdrop = useSectionBackdrop(BACKDROP_OPTIONS, "color", "beige")

  useEffect(() => {
    async function fetchItems() {
      try {
        const { items: data } = await api.get<{ items: any[] }>("/api/items")
        const live = data.filter((item) =>
          (item.images || []).some((img: { storagePath?: string }) => isCutoutPath(img.storagePath))
        )
        if (live.length > 0) {
          setItems(
            live.map((item) => ({
              ...item,
              public_status: item.publicStatus,
              item_images: (item.images || []).map((img: { storagePath?: string }) => ({
                storage_path: resolveImageUrl(img.storagePath),
              })),
            }))
          )
        }
      } catch (err) {
        console.warn("Failed to load live Wall of Kindness preview:", err)
      }
    }
    fetchItems()
  }, [])

  const isPhotoBackdrop = backdrop.mode === "photo"

  return (
    <section
      className={`relative z-0 overflow-hidden border-b-2 border-foreground min-h-[100vh] md:min-h-[85vh] flex flex-col bg-background ${
        flushWithHero ? "" : "-mt-[4.5vh]"
      }`}
    >
      {/* Dev-only backdrop switcher — always a dropdown. */}
      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">
        <BackdropSwitcher label="Wall of Kindness backdrop" photos={BACKDROP_OPTIONS} state={backdrop} dark={isPhotoBackdrop} />
      </div>

      <motion.div
        key={backdrop.mode === "color" ? backdrop.colorKey : backdrop.photoKey}
        className="absolute inset-0"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {backdrop.mode === "color" ? (
          <div className={`w-full h-full ${backdrop.activeColor.className}`} />
        ) : (
          <img src={backdrop.activePhoto.url} alt="" className="w-full h-full object-cover" />
        )}
        {isPhotoBackdrop && (
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(20,12,8,0.62) 0%, rgba(20,12,8,0.32) 35%, rgba(20,12,8,0.68) 100%)" }}
          />
        )}
      </motion.div>

      <motion.div
        className="relative z-10 flex-1 flex flex-col justify-center py-16 md:py-20"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4, ease: EASE, delay: 0.08 }}
      >
        <div className="container px-4 mx-auto">
          <div className={`flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4 border-b-2 pb-6 ${isPhotoBackdrop ? "border-white/30" : "border-foreground"}`}>
            <div>
              <span className={`text-xs font-black uppercase tracking-widest block mb-1 ${isPhotoBackdrop ? "text-white/80" : "text-foreground-muted"}`}>
                LIVE PRELOVED CIRCULATION
              </span>
              <h2 className={`text-4xl md:text-6xl font-display font-black leading-tight uppercase ${isPhotoBackdrop ? "text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,0.9)]" : "text-foreground"}`}>
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
