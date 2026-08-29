import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, useReducedMotion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { api, resolveImageUrl } from "@/lib/api"
import { useSectionBackdrop } from "@/components/ui/SectionBackdrop"
import { assetUrl, COURTYARD_CONTINUE_BG } from "@/lib/assets"
import { courtyardAisleClass } from "@/components/assets/CourtyardWallBackground"
import { getDonorPrefs, getDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { sortByGenderMatch } from "@/lib/genderMatch"

// Real, verified photo options - swap live with the switcher instead of
// guessing which one reads best. "Beige" in the switcher's Colors group
// covers the "keep it uniform with the hero" request without needing its
// own photo entry any more.
const BACKDROP_OPTIONS = [
  {
    key: "courtyard-continue",
    label: "Courtyard continue",
    url: COURTYARD_CONTINUE_BG,
  },
  // Default - red brick wall, confirmed as the keeper.
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
    url: assetUrl("/images/hero-bg-desktop.webp"),
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
  const [items, setItems] = useState<WallItem[]>([])
  const [preferGender, setPreferGender] = useState<string | null>(() => getDonorPrefs()?.gender ?? null)
  const prefersReducedMotion = useReducedMotion()
  // Defaults to beige to match the catalogue reference. White stays in the switcher.
  const backdrop = useSectionBackdrop(BACKDROP_OPTIONS, "off")

  useEffect(() => {
    async function fetchItems() {
      try {
        let pref = getDonorPrefs()?.gender ?? null
        if (getDonorToken()) {
          try {
            const { profile } = await api.donor.get<{
              profile: { username?: string | null; gender?: string | null } | null
            }>("/api/donor/profile")
            if (profile?.gender) {
              pref = profile.gender
              setPreferGender(profile.gender)
              setDonorPrefs({ username: profile.username, gender: profile.gender })
            }
          } catch {
            // ignore - guest preview
          }
        }

        const { items: data } = await api.get<{ items: any[] }>("/api/items?status=wall")
        const live = data.filter(
          (item) =>
            item.publicStatus === "available" &&
            (item.images || []).some(
              (img: { storagePath?: string }) =>
                Boolean(img.storagePath) && !String(img.storagePath).includes("unsplash.com"),
            ),
        )
        const mapped = live.map((item) => ({
          ...item,
          public_status: item.publicStatus,
          gender: item.gender,
          item_images: (item.images || []).map((img: { storagePath?: string }) => ({
            storage_path: resolveImageUrl(img.storagePath),
          })),
        }))
        setItems(sortByGenderMatch(mapped, pref))
      } catch (err) {
        console.warn("Failed to load live Wall of Kindness preview:", err)
        setItems([])
      }
    }
    fetchItems()
  }, [])

  const isPhotoBackdrop = backdrop.mode === "photo"

  return (
    <section
      className={`relative z-0 overflow-hidden border-b-2 border-foreground min-h-[100vh] md:min-h-[85vh] flex flex-col bg-transparent ${
        flushWithHero ? "" : "-mt-[4.5vh]"
      }`}
    >
      {/* Backdrop test switcher hidden */}
      {/* {isClientPreviewHost() && (
      <div className="absolute top-8 sm:top-10 right-2 sm:right-3 md:right-4 z-40 print:hidden">
        <BackdropSwitcher label="Wall of Kindness backdrop" photos={BACKDROP_OPTIONS} state={backdrop} dark={isPhotoBackdrop} />
      </div>
      )} */}

      <motion.div
        key={backdrop.mode === "color" ? backdrop.colorKey : backdrop.photoKey}
        className="absolute inset-0"
        initial={prefersReducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {backdrop.mode === "color" ? (
          <div className={`w-full h-full ${backdrop.activeColor.className}`} />
        ) : backdrop.mode === "photo" ? (
          <img src={backdrop.activePhoto.url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : null}
        {isPhotoBackdrop && backdrop.photoKey !== "courtyard-continue" && backdrop.photoKey !== "courtyard" && (
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
        <div className={`${courtyardAisleClass} relative z-10`}>
          <div className={`flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-4 border-b-2 pb-6 ${isPhotoBackdrop ? "border-white/30" : "border-foreground"}`}>
            <div>
              <span className={`text-xs font-black uppercase tracking-widest block mb-1 ${isPhotoBackdrop ? "text-white/80" : "text-foreground-muted"}`}>
                LIVE PRELOVED CIRCULATION
              </span>
              <h2 className={`text-4xl md:text-6xl font-display font-black leading-tight uppercase ${isPhotoBackdrop ? "text-white drop-shadow-[3px_3px_0px_rgba(0,0,0,0.9)]" : "text-foreground"}`}>
                Wall of Kindness
              </h2>
            </div>

            <Link to="/drop" className="inline-flex items-center gap-2 font-black uppercase text-sm px-4 py-2 bg-accent-pink border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all">
              <span>Explore the full wall</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <WallOfKindness items={items} preferGender={preferGender} />
        </div>
      </motion.div>
    </section>
  )
}
