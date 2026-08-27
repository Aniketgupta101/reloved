import { useRef, useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/Button"
import { GraffitiMarks } from "@/components/assets/RelovedAssets"
import { RelovedBadge } from "@/components/ui/RelovedBadge"
import { useSectionBackdrop, BackdropLayer } from "@/components/ui/SectionBackdrop"
import { WallOfKindnessSection } from "@/components/sections/WallOfKindness"
import { WallOfKindnessCard } from "@/components/ui/WallOfKindnessCard"
import { KindnessMap } from "@/components/sections/KindnessMap"
import { WallOfLoveSection } from "@/components/sections/WallOfLoveSection"
import { closetWallItems, isCutoutPath } from "@/lib/closetItems"
import { api, resolveImageUrl } from "@/lib/api"
import { ArrowUpRight, ArrowDownLeft, MapPin } from "lucide-react"
import { COURTYARD_CONTINUE_BG } from "@/lib/assets"
import { courtyardAisleClass } from "@/components/assets/CourtyardWallBackground"

interface HeroGridItem {
  slug: string
  title: string
  image?: string
  category?: string
  locality?: string
  condition?: string
  size?: string
  publicStatus?: string
}

export function Home() {
  const heroRef = useRef<HTMLElement>(null)
  const prefersReducedMotion = useReducedMotion()

  const [gridItems, setGridItems] = useState<HeroGridItem[]>(
    closetWallItems().slice(0, 8).map((item) => ({
      slug: item.slug,
      title: item.title,
      image: item.item_images[0]?.storage_path,
      category: item.category,
      locality: item.locality,
      condition: item.condition,
      size: item.size,
      publicStatus: item.public_status,
    }))
  )

  useEffect(() => {
    async function fetchGridItems() {
      try {
        const closet = closetWallItems().slice(0, 8)
        const { items: data } = await api.get<{ items: any[] }>("/api/items?status=wall")
        const live = data.filter((item) =>
          (item.images || []).some((img: { storagePath?: string }) => isCutoutPath(img.storagePath))
        )
        if (live.length > 0) {
          const basename = (path?: string) =>
            (path || "").split("?")[0].split("/").pop()?.toLowerCase() || ""
          const byFile = new Map(
            live.map((item) => {
              const file = basename(item.images?.[0]?.storagePath) || item.slug
              return [file, item] as const
            })
          )
          const bySlug = new Map(live.map((item) => [item.slug, item] as const))
          setGridItems(
            closet.map((c) => {
              const file = basename(c.item_images[0]?.storage_path)
              const liveItem = (file && byFile.get(file)) || bySlug.get(c.slug)
              return {
                slug: liveItem?.slug || c.slug,
                title: liveItem?.title || c.title,
                image: liveItem?.images?.[0]?.storagePath
                  ? resolveImageUrl(liveItem.images[0].storagePath)
                  : c.item_images[0]?.storage_path,
                category: liveItem?.category || c.category,
                locality: liveItem?.locality || c.locality,
                condition: liveItem?.condition || c.condition,
                size: liveItem?.size || c.size,
                publicStatus: liveItem?.publicStatus || c.public_status,
              }
            })
          )
        }
      } catch (err) {
        console.warn("Failed to load live hero grid items:", err)
      }
    }
    fetchGridItems()
  }, [])

  const COURTYARD_ONLY = [
    { key: "courtyard", label: "Courtyard continue", url: COURTYARD_CONTINUE_BG },
  ] as const
  const manifestoBackdrop = useSectionBackdrop(COURTYARD_ONLY, "off")
  const mapBackdrop = useSectionBackdrop(COURTYARD_ONLY, "off")
  const loveBackdrop = useSectionBackdrop(COURTYARD_ONLY, "off")
  const ctaBackdrop = useSectionBackdrop(COURTYARD_ONLY, "off")

  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const heroScrollSmooth = useSpring(heroScroll, { stiffness: 40, damping: 32, restDelta: 0.001 })
  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])

  return (
    <div className="relative bg-transparent text-foreground overflow-x-hidden">
      <motion.section
        ref={heroRef}
        style={prefersReducedMotion ? undefined : { opacity: heroOpacity }}
        className="relative z-10 w-full flex flex-col overflow-hidden min-h-[100dvh]"
      >
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pt-24 pb-10 md:pb-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex flex-col items-center w-full ${courtyardAisleClass}`}
          >
            <RelovedBadge className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0" />

            <h1 className="mt-3 sm:mt-4 text-4xl md:text-6xl font-display font-black leading-tight uppercase text-foreground">
              The Digital Wall of Kindness
            </h1>
            <p className="mt-1.5 text-accent-pink font-display font-black uppercase tracking-[0.2em] text-xs sm:text-sm md:text-base">
              ★ Preloved for free ★
            </p>

            <div className="mt-5 sm:mt-6 md:mt-8 w-full grid grid-cols-4 gap-2.5 sm:gap-3 md:gap-4">
              {gridItems.slice(0, 8).map((item, i) => (
                <WallOfKindnessCard
                  key={item.slug || i}
                  showTape={false}
                  item={{
                    slug: item.slug,
                    title: item.title,
                    image: item.image,
                    category: item.category,
                    locality: item.locality,
                    condition: item.condition,
                    size: item.size,
                    publicStatus: item.publicStatus,
                  }}
                />
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-5 sm:mt-6 md:mt-8 justify-center items-center w-full max-w-xs sm:max-w-none mx-auto">
              <Link to="/give" className="w-full sm:w-auto">
                <Button size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-accent-pink text-foreground hover:bg-accent-pink shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <span>Drop an item</span>
                  <ArrowUpRight size={16} className="stroke-[3]" />
                </Button>
              </Link>
              <Link to="/drop" className="w-full sm:w-auto">
                <Button size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2">
                  <span>Claim an item</span>
                  <ArrowDownLeft size={16} className="stroke-[3]" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </motion.section>

      <WallOfKindnessSection flushWithHero />

      <section className="py-20 md:py-28 relative overflow-hidden border-b-2 border-foreground">
        <BackdropLayer state={manifestoBackdrop} wash="bg-white/82" />
        <GraffitiMarks className="absolute top-0 right-0 w-full h-full text-foreground/5 opacity-40 pointer-events-none" />
        <div className={`${courtyardAisleClass} relative z-10`}>
          <div>
            <div className="inline-block px-3 py-1 bg-accent-red text-white text-xs font-black uppercase tracking-widest mb-6 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              WALL MANIFESTO
            </div>
            <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-black leading-[0.88] uppercase tracking-tighter mb-8">
              Leave what you <span className="text-foreground-muted line-through decoration-4 decoration-accent-red">do not</span> need.<br />
              Claim what you need.
            </h2>
            <p className="text-lg md:text-2xl font-medium max-w-3xl text-foreground/80 leading-relaxed bg-surface-muted p-6 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] mb-10">
              reloved transforms the timeless Wall of Kindness into a structured digital platform. Every preloved item is cataloged, verified, and matched with transparent community partners for zero cost.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                <div className="w-9 h-9 bg-foreground text-background border-2 border-foreground flex items-center justify-center font-display font-black text-sm shrink-0">01</div>
                <h3 className="font-display font-black text-base uppercase leading-tight">100% Always Free</h3>
                <p className="text-foreground-muted text-xs font-medium leading-snug">No fees, no tokens — every item given freely.</p>
              </div>
              <div className="bg-white p-5 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                <div className="w-9 h-9 bg-accent-pink text-foreground border-2 border-foreground flex items-center justify-center font-display font-black text-sm shrink-0">02</div>
                <h3 className="font-display font-black text-base uppercase leading-tight">Complete Privacy</h3>
                <p className="text-foreground-muted text-xs font-medium leading-snug">Your address and number stay confidential.</p>
              </div>
              <div className="bg-white p-5 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-3">
                <div className="w-9 h-9 bg-accent-green text-foreground border-2 border-foreground flex items-center justify-center font-display font-black text-sm shrink-0">03</div>
                <h3 className="font-display font-black text-base uppercase leading-tight">Verified Partners</h3>
                <p className="text-foreground-muted text-xs font-medium leading-snug">Routed to checked local NGOs and shelters.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 md:py-28 relative overflow-hidden">
        <BackdropLayer state={mapBackdrop} wash="bg-background/88" />
        <div className={`${courtyardAisleClass} relative z-10`}>
          <div className="mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white border-2 border-foreground text-xs font-black uppercase tracking-widest mb-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <MapPin size={14} className="text-accent-red" />
              <span>COMMUNITY GEOGRAPHY &bull; MUMBAI</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-display font-black uppercase mb-3">Local Impact Map</h2>
            <p className="text-lg text-foreground/80 font-medium">
              Explore available items, collection hubs, and active partner networks across Mumbai neighborhoods.
            </p>
          </div>
          <KindnessMap />
        </div>
      </section>

      <div className="border-b-2 border-foreground">
        <WallOfLoveSection backdropPhotos={COURTYARD_ONLY} backdrop={loveBackdrop} />
      </div>

      <section className="py-28 relative overflow-hidden">
        <BackdropLayer state={ctaBackdrop} wash="bg-background/85" />
        <GraffitiMarks className="absolute inset-0 z-[1] w-full h-full text-foreground/5 opacity-50 pointer-events-none" />
        <div className={`${courtyardAisleClass} relative z-10 text-center flex flex-col items-center`}>
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-display font-black uppercase max-w-4xl mx-auto leading-[0.9] mb-6">
            Something you no longer use could mean the world to someone else.
          </h2>
          <p className="text-lg md:text-xl font-bold uppercase tracking-widest text-foreground-muted mb-10">
            Because preloved only costs kindness.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md sm:max-w-none">
            <Link to="/give" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-16 px-10 text-lg rounded-none border-2 border-foreground bg-accent-pink text-foreground hover:bg-accent-pink shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all font-black uppercase tracking-widest">
                Drop an item now
              </Button>
            </Link>
            <Link to="/drop" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-16 px-10 text-lg rounded-none border-2 border-foreground bg-accent-green text-foreground hover:bg-accent-green shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all font-black uppercase tracking-widest">
                Explore Wall
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
