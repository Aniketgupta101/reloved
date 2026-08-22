import { useRef, useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from "motion/react"
import { Button } from "@/components/ui/Button"
import { GraffitiMarks, Tape, FreeStamp } from "@/components/assets/RelovedAssets"
import { RelovedBadge } from "@/components/ui/RelovedBadge"
import { FloatingCards } from "@/components/ui/FloatingCards"
import { WallOfKindnessSection } from "@/components/sections/WallOfKindness"
import { KindnessMap } from "@/components/sections/KindnessMap"
import { WallOfLoveSection } from "@/components/sections/WallOfLoveSection"
import { InteractiveLifecycle } from "@/components/sections/InteractiveLifecycle"
import { MOCK_ITEMS } from "@/lib/seed"
import { SafeImage } from "@/components/ui/SafeImage"
import { api, resolveImageUrl } from "@/lib/api"
import { ArrowUpRight, CheckCircle2, HeartHandshake, ShieldCheck, MapPin } from "lucide-react"

// Hero backgrounds — client assets from frontend/assets/.aistudio/,
// served from public/images/. Art-directed per breakpoint so the
// courtyard wall covers 100dvh without letterboxing.
const HERO_BG = {
  mobile: "/images/hero-bg-mobile.png",   // 9:16  1080×1920
  tablet: "/images/hero-bg-tablet.png",   // 4:3   2048×1536
  laptop: "/images/hero-bg-laptop.png",   // 16:10 2880×1800
  desktop: "/images/hero-bg-desktop.png", // 16:9  2560×1440
}

type HeroVariant = "current" | "reloved-digital" | "reloved-digital-cards" | "grid"

interface HeroGridItem {
  slug: string
  title: string
  image?: string
}

export function Home() {
  const heroRef = useRef<HTMLElement>(null)
  const prefersReducedMotion = useReducedMotion()
  const [heroVariant, setHeroVariant] = useState<HeroVariant>("grid")

  // Wall-photo options for the hero — real courtyard asset plus 3 verified
  // stock walls, so "which wall looks best" is something to click through
  // rather than guess at. Defaults to the warmest one (cream brick + leaf
  // shadow), not the flatter plain-stucco that was on by default before.
  const HERO_WALL_OPTIONS = [
    { key: "courtyard", label: "Courtyard (real)", url: "" },
    { key: "cream-brick", label: "Cream Brick", url: "https://images.unsplash.com/photo-1727840732819-bf9116432beb?w=2400&q=75&auto=format&fit=crop" },
    { key: "vine-wall", label: "Vine Wall", url: "https://images.unsplash.com/photo-1642466181428-84006edef2ec?w=2400&q=75&auto=format&fit=crop" },
    { key: "stucco", label: "Plain Stucco", url: "https://images.unsplash.com/photo-1523878288860-7ad281611901?w=2400&q=75&auto=format&fit=crop" },
  ] as const
  // Plain background-color options, as an alternative to any photo.
  const HERO_COLOR_OPTIONS = [
    { key: "cream", label: "Cream", className: "bg-background" },
    { key: "muted", label: "Muted", className: "bg-surface-muted" },
    { key: "white", label: "White", className: "bg-white" },
    { key: "yellow", label: "Soft Yellow", className: "bg-accent-yellow/25" },
  ] as const
  const [heroBgMode, setHeroBgMode] = useState<"photo" | "color">("photo")
  const [heroWallKey, setHeroWallKey] = useState<(typeof HERO_WALL_OPTIONS)[number]["key"]>("cream-brick")
  const [heroColorKey, setHeroColorKey] = useState<(typeof HERO_COLOR_OPTIONS)[number]["key"]>("cream")
  const activeHeroWall = HERO_WALL_OPTIONS.find((w) => w.key === heroWallKey)!
  const activeHeroColor = HERO_COLOR_OPTIONS.find((c) => c.key === heroColorKey)!

  // Option D's item grid — real Wall of Kindness inventory, each tile
  // clickable through to its item page. Falls back to seed data.
  const [gridItems, setGridItems] = useState<HeroGridItem[]>(
    MOCK_ITEMS.slice(0, 12).map((item: any) => ({
      slug: item.slug,
      title: item.title,
      image: item.item_images?.[0]?.storage_path ?? undefined,
    }))
  )
  useEffect(() => {
    async function fetchGridItems() {
      try {
        const { items: data } = await api.get<{ items: any[] }>("/api/items")
        if (data.length > 0) {
          setGridItems(
            data.slice(0, 12).map((item) => ({
              slug: item.slug,
              title: item.title,
              image: item.images?.[0]?.storagePath ? resolveImageUrl(item.images[0].storagePath) : undefined,
            }))
          )
        }
      } catch (err) {
        console.warn("Failed to load live hero grid items:", err)
      }
    }
    fetchGridItems()
  }, [])

  const MANIFESTO_BACKDROPS = [
    { key: "none", label: "Off", url: "" },
    { key: "fabric", label: "Backdrop A", url: "https://images.unsplash.com/photo-1713952852616-1827a2f0cf51?w=2000&q=75&auto=format&fit=crop" },
    { key: "plaster", label: "Backdrop B", url: "https://images.unsplash.com/photo-1555181937-efe4e074a301?w=2000&q=75&auto=format&fit=crop" },
    { key: "sandstone", label: "Backdrop C", url: "https://images.unsplash.com/photo-1635315619556-5826839a1bea?w=2000&q=75&auto=format&fit=crop" },
  ] as const
  const [manifestoBg, setManifestoBg] = useState<(typeof MANIFESTO_BACKDROPS)[number]["key"]>("none")
  const activeManifestoBg = MANIFESTO_BACKDROPS.find((b) => b.key === manifestoBg)!

  const PARTNER_BACKDROPS = [
    { key: "none", label: "Off", url: "" },
    { key: "hands", label: "Backdrop A", url: "https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=2000&q=75&auto=format&fit=crop" },
    { key: "classroom", label: "Backdrop B", url: "https://images.unsplash.com/photo-1757192420329-39acf20a12b8?w=2000&q=75&auto=format&fit=crop" },
    { key: "clothing-rack", label: "Backdrop C", url: "https://images.unsplash.com/photo-1540221652346-e5dd6b50f3e7?w=2000&q=75&auto=format&fit=crop" },
  ] as const
  const [partnerBg, setPartnerBg] = useState<(typeof PARTNER_BACKDROPS)[number]["key"]>("none")
  const activePartnerBg = PARTNER_BACKDROPS.find((b) => b.key === partnerBg)!

  // Keep the paper-cut locked as the next section arrives — fading or
  // lifting the hero would flash the brick through the teeth too early.
  const { scrollYProgress: heroScroll } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  })
  const heroScrollSmooth = useSpring(heroScroll, { stiffness: 40, damping: 32, restDelta: 0.001 })
  const heroOpacity = useTransform(heroScrollSmooth, [0, 1], [1, 0.88])

  // Client-facing section show/hide — lets Sheetal preview the page with any
  // component removed without needing us to redeploy for every "what if we
  // dropped this" question.
  const SECTION_LABELS = {
    hero: "Hero",
    wallOfKindness: "Wall of Kindness",
    manifesto: "Manifesto Banner",
    pillars: "Three-Pillar System",
    lifecycle: "Interactive Lifecycle",
    map: "Impact Map",
    wallOfLove: "Wall of Love",
    partnerCta: "Partner CTA",
    finalCta: "Final CTA",
  } as const
  type SectionKey = keyof typeof SECTION_LABELS
  const SECTION_ORDER = Object.keys(SECTION_LABELS) as SectionKey[]
  const [hiddenSections, setHiddenSections] = useState<Set<SectionKey>>(new Set())
  const [sectionPanelOpen, setSectionPanelOpen] = useState(false)
  const toggleSection = (key: SectionKey) =>
    setHiddenSections((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return (
    <div className="relative bg-background text-foreground overflow-x-hidden">
      {/* Client-facing section visibility panel — fixed, always reachable. */}
      <div className="fixed bottom-4 left-4 z-50 print:hidden">
        <button
          onClick={() => setSectionPanelOpen((v) => !v)}
          className="px-3 py-2 text-[11px] font-black uppercase tracking-widest border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] bg-foreground text-background hover:bg-white hover:text-foreground transition-all"
        >
          {sectionPanelOpen ? "Close Sections" : "Page Sections"}
        </button>

        {sectionPanelOpen && (
          <div className="mt-2 w-64 max-h-[70vh] overflow-y-auto bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] p-3 flex flex-col gap-1.5">
            {SECTION_ORDER.map((key) => {
              const isHidden = hiddenSections.has(key)
              return (
                <button
                  key={key}
                  onClick={() => toggleSection(key)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide border-2 border-foreground transition-all ${
                    isHidden ? "bg-white text-foreground/40" : "bg-accent-green/25 text-foreground"
                  }`}
                >
                  <span className={isHidden ? "line-through" : ""}>{SECTION_LABELS[key]}</span>
                  <span className="text-[9px] font-black shrink-0">{isHidden ? "SHOW" : "HIDE"}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* =========================================================================
          SECTION 1: HERO — client-approved reference ("Direction 01" handoff):
          full-bleed courtyard photo, circular badge, straight item grid.
         ========================================================================= */}
      {!hiddenSections.has("hero") && (
      <motion.section
        ref={heroRef}
        style={prefersReducedMotion ? undefined : { opacity: heroOpacity }}
        className={`relative z-10 w-full flex flex-col overflow-hidden ${heroVariant === "grid" ? "min-h-[100dvh]" : ""}`}
      >
        {/* Flat, uncut background — no torn-paper reveal on any variant.
            Wall photo is picked independently of the content option (A-D)
            via the switcher below; heroBgMode === "color" swaps the whole
            thing for a plain swatch instead. */}
        <div className="absolute inset-0">
          {heroBgMode === "color" ? (
            <div className={`absolute inset-0 ${activeHeroColor.className}`} />
          ) : activeHeroWall.key === "courtyard" ? (
            <picture>
              <source media="(min-width: 1280px)" srcSet={HERO_BG.desktop} />
              <source media="(min-width: 1024px)" srcSet={HERO_BG.laptop} />
              <source media="(min-width: 768px)" srcSet={HERO_BG.tablet} />
              <img
                src={HERO_BG.mobile}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full max-w-none object-cover object-bottom pointer-events-none select-none"
              />
            </picture>
          ) : (
            <img
              src={activeHeroWall.url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
            />
          )}
          {heroBgMode === "photo" && <div className="absolute inset-0 bg-white/12" />}
        </div>

        {/* Dev-only background switcher: which wall photo, or a plain color.
            Always a dropdown — never a stack of buttons cluttering the page. */}
        <div className="absolute top-24 left-2 sm:left-3 md:left-4 z-40 print:hidden">
          <select
            aria-label="Hero background"
            value={heroBgMode === "photo" ? `wall:${heroWallKey}` : `color:${heroColorKey}`}
            onChange={(e) => {
              const [mode, key] = e.target.value.split(":")
              if (mode === "wall") {
                setHeroBgMode("photo")
                setHeroWallKey(key as (typeof HERO_WALL_OPTIONS)[number]["key"])
              } else {
                setHeroBgMode("color")
                setHeroColorKey(key as (typeof HERO_COLOR_OPTIONS)[number]["key"])
              }
            }}
            className="text-[10px] font-black uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white text-foreground px-2 py-1.5 max-w-[38vw] sm:max-w-none"
          >
            <optgroup label="Wall photos">
              {HERO_WALL_OPTIONS.map((w) => (
                <option key={w.key} value={`wall:${w.key}`}>{w.label}</option>
              ))}
            </optgroup>
            <optgroup label="Colors">
              {HERO_COLOR_OPTIONS.map((c) => (
                <option key={c.key} value={`color:${c.key}`}>{c.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Dev-only A/B/C/D switcher — lets Sheetal compare hero directions
            live before we commit to one. Remove once a version is picked. */}
        <div className="absolute top-24 right-2 sm:right-3 md:right-4 z-40 print:hidden">
          <select
            aria-label="Hero content option"
            value={heroVariant}
            onChange={(e) => setHeroVariant(e.target.value as HeroVariant)}
            className="text-[10px] font-black uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white text-foreground px-2 py-1.5"
          >
            <option value="current">Option A</option>
            <option value="reloved-digital">Option B</option>
            <option value="reloved-digital-cards">Option C</option>
            <option value="grid">Option D</option>
          </select>
        </div>

        {heroVariant === "reloved-digital-cards" && <FloatingCards />}

        {heroVariant === "current" && (
          <div className="relative z-10 flex flex-col items-center text-center px-4 pt-24 pb-10 md:pb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center w-full max-w-5xl"
            >
              <RelovedBadge className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0" />

              <h1 className="mt-3 sm:mt-4 text-4xl md:text-6xl font-display font-black leading-tight uppercase text-foreground">
                The Digital Wall of Kindness
              </h1>
              <p className="mt-1.5 text-accent-pink font-display font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs md:text-sm">
                ★ Preloved for free ★
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8 md:mt-10 justify-center items-center w-full max-w-xs sm:max-w-none mx-auto">
                <Link to="/give" className="w-full sm:w-auto">
                  <Button size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <span>Give an item</span>
                    <ArrowUpRight size={16} className="stroke-[3]" />
                  </Button>
                </Link>
                <Link to="/drop" className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-white text-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest">
                    Take an item
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        )}

        {heroVariant === "grid" && (
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 pt-24 pb-10 md:pb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center w-full max-w-3xl sm:max-w-4xl"
            >
              <RelovedBadge className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 shrink-0" />

              <h1 className="mt-3 sm:mt-4 text-2xl sm:text-4xl md:text-5xl font-display font-black leading-tight uppercase text-foreground">
                The Digital Wall of Kindness
              </h1>
              <p className="mt-1.5 text-accent-pink font-display font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs md:text-sm">
                ★ Preloved for free ★
              </p>

              <div className="mt-5 sm:mt-6 md:mt-8 w-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-2.5 md:gap-3">
                {gridItems.slice(0, 12).map((item, i) => (
                  <Link
                    key={item.slug || i}
                    to={`/drop/${item.slug}`}
                    title={item.title}
                    className="group aspect-square bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] sm:shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all overflow-hidden block"
                  >
                    <SafeImage
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </Link>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-5 sm:mt-6 md:mt-8 justify-center items-center w-full max-w-xs sm:max-w-none mx-auto">
                <Link to="/give" className="w-full sm:w-auto">
                  <Button size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <span>Give an item</span>
                    <ArrowUpRight size={16} className="stroke-[3]" />
                  </Button>
                </Link>
                <Link to="/drop" className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-white text-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest">
                    Take an item
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        )}

        {(heroVariant === "reloved-digital" || heroVariant === "reloved-digital-cards") && (
          // Options B and C share the same "Re-loved Digital" content —
          // C additionally renders <FloatingCards /> above (see toggle).
          <div className="relative z-10 flex flex-col items-center text-center px-4 pt-36 sm:pt-40 md:pt-44 pb-10 md:pb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center w-full max-w-3xl"
            >
              <h1 className="font-display font-black uppercase leading-[0.9] tracking-tight text-foreground text-4xl sm:text-6xl md:text-7xl">
                Re-loved<br />Digital
              </h1>

              <div className="mt-4 sm:mt-5 md:mt-6 inline-block px-5 py-2 sm:px-6 sm:py-2.5 bg-[#CDBB86] border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                <span className="font-display font-black uppercase tracking-wide text-xs sm:text-sm md:text-base text-foreground">
                  The Digital Wall of Kindness
                </span>
              </div>

              <div className="mt-5 sm:mt-6 md:mt-8 max-w-xl bg-white/95 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] px-6 py-5 sm:px-8 sm:py-6">
                <p className="font-display font-black italic text-base sm:text-lg md:text-xl text-foreground">
                  &ldquo;Because preloved only costs kindness.&rdquo;
                </p>
                <div className="my-3 h-px bg-foreground/20" />
                <p className="text-sm sm:text-base text-foreground/80 font-medium leading-relaxed">
                  Pass on useful items you no longer need to someone who will cherish them next. Every item is 100% free, coordinated through reloved&rsquo;s digital Wall of Kindness &amp; verified local community partners.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-5 sm:mt-6 md:mt-8 justify-center items-center w-full max-w-xs sm:max-w-none mx-auto">
                <Link to="/give" className="w-full sm:w-auto">
                  <Button size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest flex items-center justify-center gap-2">
                    <span>Give an item</span>
                    <ArrowUpRight size={16} className="stroke-[3]" />
                  </Button>
                </Link>
                <Link to="/drop" className="w-full sm:w-auto">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto h-11 sm:h-12 px-5 sm:px-7 text-xs sm:text-sm rounded-none border-2 border-foreground bg-white text-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest">
                    Take an item
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </motion.section>
      )}

      {/* =========================================================================
          SECTION 1B: THE WALL OF KINDNESS LIVE CATALOGUE
         ========================================================================= */}
      {!hiddenSections.has("wallOfKindness") && <WallOfKindnessSection flushWithHero />}

      {/* =========================================================================
          SECTION 2: MANIFESTO BANNER
         ========================================================================= */}
      {!hiddenSections.has("manifesto") && (
      <section className="py-20 md:py-28 bg-white relative overflow-hidden border-b-2 border-foreground">
        {/* Dev-only backdrop test switcher — always a dropdown. */}
        <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">
          <select
            aria-label="Manifesto backdrop"
            value={manifestoBg}
            onChange={(e) => setManifestoBg(e.target.value as (typeof MANIFESTO_BACKDROPS)[number]["key"])}
            className="text-[10px] font-black uppercase tracking-widest border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] bg-white text-foreground px-2 py-1.5 max-w-[42vw] sm:max-w-none"
          >
            {MANIFESTO_BACKDROPS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>

        {activeManifestoBg.url && (
          <div className="absolute inset-0 z-0">
            <img src={activeManifestoBg.url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-white/82" />
          </div>
        )}

        <GraffitiMarks className="absolute top-0 right-0 w-full h-full text-foreground/5 opacity-40 pointer-events-none" />
        <div className="container px-4 mx-auto relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="inline-block px-3 py-1 bg-accent-red text-white text-xs font-black uppercase tracking-widest mb-6 border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              WALL MANIFESTO
            </div>
            
            <h2 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-black leading-[0.88] uppercase tracking-tighter mb-8">
              Leave what you <span className="text-foreground-muted line-through decoration-4 decoration-accent-red">do not</span> need.<br/>
              Take what you need.
            </h2>
            
            <p className="text-lg md:text-2xl font-medium max-w-3xl text-foreground/80 leading-relaxed bg-surface-muted p-6 border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)]">
              reloved transforms the timeless Wall of Kindness into a structured digital platform. Every preloved item is cataloged, verified, and matched with transparent community partners for zero cost.
            </p>
          </div>
        </div>
      </section>
      )}

      {/* =========================================================================
          SECTION 3: THREE-PILLAR SYSTEM
         ========================================================================= */}
      {!hiddenSections.has("pillars") && (
      <section className="py-20 md:py-28 bg-surface-muted border-b-2 border-foreground relative">
        <div className="container px-4 mx-auto max-w-6xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-xs font-black uppercase tracking-widest px-3 py-1 bg-white border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              HOW THE SYSTEM WORKS
            </span>
            <h2 className="text-3xl md:text-5xl font-display font-black uppercase leading-tight mt-4">
              Organized generosity for modern communities
            </h2>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="bg-white p-8 border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col justify-between relative group hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform">
              <div>
                <div className="w-12 h-12 bg-accent-green border-2 border-foreground flex items-center justify-center font-display font-black text-xl mb-6 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                  01
                </div>
                <h3 className="font-display font-black text-2xl uppercase mb-3">100% Always Free</h3>
                <p className="text-foreground/80 text-sm font-medium leading-relaxed">
                  No hidden fees, no token systems, and no monetary exchanges. Every listed item is given freely from donor to recipient.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t-2 border-foreground/10 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-blue">
                <CheckCircle2 size={16} /> Verified Free
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white p-8 border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col justify-between relative group hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform">
              <div>
                <div className="w-12 h-12 bg-accent-blue text-white border-2 border-foreground flex items-center justify-center font-display font-black text-xl mb-6 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                  02
                </div>
                <h3 className="font-display font-black text-2xl uppercase mb-3">Complete Privacy</h3>
                <p className="text-foreground/80 text-sm font-medium leading-relaxed">
                  Residential addresses and personal phone numbers remain confidential. Deliveries and handovers are coordinated safely.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t-2 border-foreground/10 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-blue">
                <ShieldCheck size={16} /> Address Protected
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-8 border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col justify-between relative group hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform">
              <div>
                <div className="w-12 h-12 bg-accent-red text-white border-2 border-foreground flex items-center justify-center font-display font-black text-xl mb-6 shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                  03
                </div>
                <h3 className="font-display font-black text-2xl uppercase mb-3">Verified Partners</h3>
                <p className="text-foreground/80 text-sm font-medium leading-relaxed">
                  Items are routed through checked local NGOs, schools, and community shelters to reach genuine, verified needs.
                </p>
              </div>
              <div className="mt-8 pt-4 border-t-2 border-foreground/10 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-blue">
                <HeartHandshake size={16} /> Partner Matched
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* =========================================================================
          SECTION 5: INTERACTIVE ITEM LIFECYCLE
         ========================================================================= */}
      {!hiddenSections.has("lifecycle") && <InteractiveLifecycle />}

      {/* =========================================================================
          SECTION 6: COMMUNITY IMPACT MAP
         ========================================================================= */}
      {!hiddenSections.has("map") && (
      <section className="py-20 md:py-28 bg-surface-muted border-b-2 border-foreground">
        <div className="container px-4 mx-auto">
          <div className="mb-10 max-w-3xl">
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
      )}

      {/* =========================================================================
          SECTION 7: WALL OF LOVE / TESTIMONIALS
         ========================================================================= */}
      {!hiddenSections.has("wallOfLove") && (
      <div className="bg-white border-b-2 border-foreground">
        <WallOfLoveSection />
      </div>
      )}

      {/* =========================================================================
          SECTION 8: COMMUNITY PARTNER NETWORK
         ========================================================================= */}
      {!hiddenSections.has("partnerCta") && (
      <section className="py-24 bg-foreground text-background border-b-2 border-foreground relative overflow-hidden">
        {/* Dev-only backdrop test switcher — always a dropdown. */}
        <div className="absolute top-4 right-2 sm:right-4 z-40 print:hidden">
          <select
            aria-label="Partner CTA backdrop"
            value={partnerBg}
            onChange={(e) => setPartnerBg(e.target.value as (typeof PARTNER_BACKDROPS)[number]["key"])}
            className="text-[10px] font-black uppercase tracking-widest border-2 border-white bg-foreground text-white px-2 py-1.5 max-w-[42vw] sm:max-w-none"
          >
            {PARTNER_BACKDROPS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>

        {activePartnerBg.url && (
          <div className="absolute inset-0 z-0">
            <img src={activePartnerBg.url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-foreground/80" />
          </div>
        )}

        <div className="container px-4 mx-auto max-w-5xl relative z-10">
          <div className="flex flex-col items-center text-center">
            <div className="inline-block px-4 py-1.5 bg-accent-blue text-white font-black text-xs tracking-widest uppercase mb-6 shadow-[3px_3px_0px_rgba(0,0,0,1)] border border-white">
              COMMUNITY PARTNERSHIP
            </div>
            <h2 className="text-4xl md:text-6xl font-display font-black leading-tight mb-8">
              Connecting donors with verified local organizations.
            </h2>
            <p className="text-lg text-background/80 max-w-2xl mb-10 font-medium">
              Preloved items are distributed through checked schools, community kitchens, shelters, and verified partner centers.
            </p>
            
            <Link to="/partner">
              <Button size="lg" className="h-14 px-8 text-base rounded-none border-2 border-background bg-accent-green text-foreground hover:bg-accent-green shadow-[4px_4px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest">
                Apply as a Community Partner
              </Button>
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* =========================================================================
          SECTION 9: FINAL CALL TO ACTION
         ========================================================================= */}
      {!hiddenSections.has("finalCta") && (
      <section className="py-28 relative overflow-hidden bg-white">
        <GraffitiMarks className="absolute inset-0 w-full h-full text-foreground/5 opacity-50 pointer-events-none" />
        <div className="container px-4 mx-auto relative z-10 text-center flex flex-col items-center">
          
          <div className="relative mb-12 w-full max-w-md mx-auto flex justify-center">
            <div className="relative z-10 p-3 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
              <Tape className="-top-3 left-1/2 -translate-x-1/2" />
              <SafeImage src={MOCK_ITEMS[2].item_images[0].storage_path} alt="Dress" className="w-48 aspect-[3/4] object-cover border border-foreground/10" />
              <FreeStamp className="absolute -bottom-6 -right-6 scale-75" />
            </div>
          </div>

          <h2 className="text-4xl sm:text-5xl md:text-7xl font-display font-black uppercase max-w-4xl mx-auto leading-[0.9] mb-6">
            Something you no longer use could mean the world to someone else.
          </h2>
          <p className="text-lg md:text-xl font-bold uppercase tracking-widest text-foreground-muted mb-10">
            Because preloved only costs kindness.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center w-full max-w-md sm:max-w-none">
            <Link to="/give" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-16 px-10 text-lg rounded-none border-2 border-foreground bg-accent-red text-white hover:bg-accent-red/90 shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all font-black uppercase tracking-widest">
                Give an item now
              </Button>
            </Link>
            <Link to="/drop" className="w-full sm:w-auto">
              <Button variant="outline" size="lg" className="w-full sm:w-auto h-16 px-10 text-lg rounded-none border-2 border-foreground bg-white text-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all font-black uppercase tracking-widest">
                Explore Wall
              </Button>
            </Link>
          </div>
        </div>
      </section>
      )}

    </div>
  )
}
