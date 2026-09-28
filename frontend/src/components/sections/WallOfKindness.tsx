import { useState, useEffect, useRef, useCallback } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight } from "lucide-react"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { WallCardSkeletonGrid } from "@/components/ui/WallCardSkeletonGrid"
import { api, resolveImageUrl } from "@/lib/api"
import { useSectionBackdrop } from "@/components/ui/SectionBackdrop"
import { assetUrl, COURTYARD_CONTINUE_BG } from "@/lib/assets"
import { courtyardAisleClass } from "@/components/assets/CourtyardWallBackground"
import { getDonorPrefs, getDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { AnalyticsEvent, track } from "@/lib/analytics"
import {
  WALL_PAGE_SIZE,
  appendWallItems,
  mapApiItemsToWall,
  wallItemsQuery,
} from "@/lib/wallItems"

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

type WallPageResponse = {
  items?: unknown[]
  nextCursor?: string | null
  hasMore?: boolean
}

export function WallOfKindnessSection({ flushWithHero = false }: { flushWithHero?: boolean }) {
  const [items, setItems] = useState<WallItem[]>([])
  const [preferGender, setPreferGender] = useState<string | null>(() => getDonorPrefs()?.gender ?? null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const prefersReducedMotion = useReducedMotion()
  // Defaults to beige to match the catalogue reference. White stays in the switcher.
  const backdrop = useSectionBackdrop(BACKDROP_OPTIONS, "off")

  const preferGenderRef = useRef(preferGender)
  preferGenderRef.current = preferGender
  const nextCursorRef = useRef<string | null>(null)
  const hasMoreRef = useRef(false)
  const loadingMoreRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const requestGenRef = useRef(0)

  const applyPageMeta = useCallback((res: WallPageResponse) => {
    const cursor = res.nextCursor ? String(res.nextCursor) : null
    const more = Boolean(res.hasMore && cursor)
    setNextCursor(cursor)
    setHasMore(more)
    nextCursorRef.current = cursor
    hasMoreRef.current = more
  }, [])

  const loadInitial = useCallback(async () => {
    const gen = ++requestGenRef.current
    setInitialLoading(true)
    setError(null)
    setLoadMoreError(null)
    setItems([])
    setNextCursor(null)
    setHasMore(false)
    nextCursorRef.current = null
    hasMoreRef.current = false
    try {
      let pref = getDonorPrefs()?.gender ?? null
      if (getDonorToken()) {
        try {
          const { profile } = await api.donor.get<{
            profile: {
              username?: string | null
              gender?: string | null
              latitude?: number | null
              longitude?: number | null
            } | null
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

      const wallRes = await api.get<WallPageResponse>(wallItemsQuery(null, WALL_PAGE_SIZE))
      if (gen !== requestGenRef.current) return
      const mapped = mapApiItemsToWall((wallRes.items || []) as any[], pref, {
        resolveUrl: resolveImageUrl,
      })
      setItems(mapped as WallItem[])
      applyPageMeta(wallRes)
    } catch (err) {
      if (gen !== requestGenRef.current) return
      console.warn("Failed to load live Wall of Kindness preview:", err)
      setItems([])
      setError("Couldn't load the Wall right now. Try again.")
      setNextCursor(null)
      setHasMore(false)
      nextCursorRef.current = null
      hasMoreRef.current = false
    } finally {
      if (gen === requestGenRef.current) setInitialLoading(false)
    }
  }, [applyPageMeta])

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return
    if (!hasMoreRef.current) return
    const cursor = nextCursorRef.current
    if (!cursor) return

    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    const gen = requestGenRef.current
    try {
      const wallRes = await api.get<WallPageResponse>(wallItemsQuery(cursor, WALL_PAGE_SIZE))
      if (gen !== requestGenRef.current) return
      const mapped = mapApiItemsToWall((wallRes.items || []) as any[], preferGenderRef.current, {
        sortByGender: false,
        resolveUrl: resolveImageUrl,
      })
      setItems((prev) => appendWallItems(prev, mapped as WallItem[]))
      applyPageMeta(wallRes)
    } catch (err) {
      if (gen !== requestGenRef.current) return
      console.warn("Failed to load more Wall items:", err)
      setLoadMoreError("Couldn't load more items. Try again.")
    } finally {
      loadingMoreRef.current = false
      if (gen === requestGenRef.current) setLoadingMore(false)
    }
  }, [applyPageMeta])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  useEffect(() => {
    const node = sentinelRef.current
    if (!node) return
    if (initialLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting)
        if (!hit) return
        if (!hasMoreRef.current || loadingMoreRef.current || loadMoreError) return
        void loadMore()
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [initialLoading, loadMore, loadMoreError, items.length, hasMore])

  const isPhotoBackdrop = backdrop.mode === "photo"

  return (
    <section
      className={`relative z-0 overflow-hidden border-b-2 border-foreground min-h-[100vh] md:min-h-[85vh] flex flex-col bg-transparent ${
        flushWithHero ? "" : "-mt-[4.5vh]"
      }`}
    >
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
        // "some" (any pixel) — amount: 0.2 never fires on mobile because this
        // block is taller than ~5 viewports, so 20% can never fit on screen.
        viewport={{ once: true, amount: "some" }}
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

            <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "home_wok_section" })} className="inline-flex items-center gap-2 font-black uppercase text-sm px-4 py-2 bg-accent-pink border-2 border-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all">
              <span>Explore the full wall</span>
              <ArrowRight size={16} />
            </Link>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {initialLoading ? (
              <motion.div
                key="wall-skeleton"
                initial={prefersReducedMotion ? false : { opacity: 0.55 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <WallCardSkeletonGrid count={16} />
              </motion.div>
            ) : null}

            {!initialLoading && error ? (
              <motion.div
                key="wall-error"
                initial={prefersReducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="py-8 flex flex-col items-start gap-3"
                data-testid="wall-initial-error"
              >
                <p className={`text-sm font-bold ${isPhotoBackdrop ? "text-white" : "text-foreground"}`}>{error}</p>
                <button
                  type="button"
                  onClick={() => void loadInitial()}
                  className="text-xs font-black uppercase tracking-widest underline"
                >
                  Retry
                </button>
              </motion.div>
            ) : null}

            {!initialLoading && !error ? (
              <motion.div
                key="wall-items"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <WallOfKindness items={items} preferGender={preferGender} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence initial={false}>
            {loadingMore ? (
              <motion.div
                key="wall-more-skeleton"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                <WallCardSkeletonGrid count={8} />
              </motion.div>
            ) : null}
          </AnimatePresence>

          {loadMoreError ? (
            <div className="py-4 flex flex-col items-start gap-2" data-testid="wall-load-more-error">
              <p className={`text-sm font-bold ${isPhotoBackdrop ? "text-white" : "text-foreground"}`}>{loadMoreError}</p>
              <button
                type="button"
                onClick={() => {
                  setLoadMoreError(null)
                  void loadMore()
                }}
                className="text-xs font-black uppercase tracking-widest underline"
              >
                Retry
              </button>
            </div>
          ) : null}

          <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" data-testid="wall-scroll-sentinel" />
        </div>
      </motion.div>
    </section>
  )
}
