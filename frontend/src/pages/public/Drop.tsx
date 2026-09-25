import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { HeartHandshake, PackagePlus, X, ChevronDown, SlidersHorizontal, Search } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { getDonorPrefs, getDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { sortByGenderMatch } from "@/lib/genderMatch"
import {
  APPAREL_SIZES,
  KIDS_AGE_BANDS,
  categoryFilterValues,
  genderFilterValues,
} from "@shared/taxonomy"
import { AnalyticsEvent, track } from "@/lib/analytics"

const CONDITIONS = ["All", "Excellent", "Good"] as const

function mapApiItem(item: any): WallItem {
  return {
    ...item,
    public_status: item.publicStatus,
    gender: item.gender,
    size: item.size ?? null,
    condition: item.condition ?? "",
    giverLogistics: item.giverLogistics ?? null,
    distanceKm: item.distanceKm ?? null,
    withinMatchRadius: item.withinMatchRadius ?? null,
    imageProcessingStatus: item.imageProcessingStatus ?? null,
    publicVisibility: item.publicVisibility !== false,
    item_images: (item.images || []).map((img: { storagePath?: string }) => ({
      storage_path: resolveImageUrl(img.storagePath),
    })),
  }
}

function sizeMatches(itemSize: string | null | undefined, selected: string): boolean {
  if (!selected || selected === "All") return true
  const raw = String(itemSize || "").trim()
  if (!raw) return false
  const s = raw.toLowerCase()
  const want = selected.toLowerCase()
  if (s === want) return true
  if (want === "oversized") {
    return s.includes("oversize") || s === "os" || s === "one size" || s === "free size"
  }
  if (want.includes("year") || want.includes("month")) {
    const compact = (v: string) => v.replace(/\s+/g, "").toLowerCase()
    return compact(s) === compact(want) || s.includes(want) || want.includes(s)
  }
  return false
}

function mergeDropItems(
  apiItems: WallItem[],
  category: string,
  gender: string,
  size: string,
  condition: string,
  search: string,
): WallItem[] {
  const cats = categoryFilterValues(category)
  const gens = genderFilterValues(gender)
  const q = search.trim().toLowerCase()
  return apiItems.filter((item) => {
    const status = item.public_status || "available"
    if (!["available", "being_matched", "claimed"].includes(status)) return false
    if (!(item.item_images || []).some((img) => Boolean(img.storage_path))) return false
    if ((item.item_images || []).some((img) => (img.storage_path || "").includes("unsplash.com"))) return false
    if (cats && !cats.includes(item.category || "")) return false
    if (gens && !gens.includes((item.gender || "").toLowerCase())) return false
    if (!sizeMatches(item.size, size)) return false
    if (condition !== "All") {
      const c = String(item.condition || "").trim().toLowerCase()
      if (c !== condition.toLowerCase()) return false
    }
    if (q) {
      const hay = [
        item.title,
        item.category,
        item.gender,
        item.size,
        item.condition,
        (item as { locality?: string }).locality,
        (item as { brand?: string }).brand,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ")
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Stacked label+value on mobile (readable); compact row on desktop. */
function FilterSelect({
  label,
  options,
  active,
  onSelect,
  preferMark,
}: {
  label: string
  options: readonly string[]
  active: string
  onSelect: (value: string) => void
  preferMark?: string | null
}) {
  const isActive = active !== "All"
  return (
    <label
      className={cn(
        "relative flex flex-col sm:flex-row sm:items-stretch min-w-0 border-2 border-foreground bg-white",
        "shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-within:shadow-[2px_2px_0px_rgba(0,0,0,1)]",
        isActive && "bg-accent-pink/30",
      )}
    >
      <span className="px-2.5 pt-1.5 sm:pt-0 sm:flex sm:items-center sm:pl-2.5 sm:pr-2 text-[9px] font-black uppercase tracking-wider text-foreground-muted shrink-0 sm:border-r-2 sm:border-foreground/15">
        {label}
      </span>
      <span className="relative flex items-stretch min-h-9 sm:h-10 min-w-0 flex-1">
        <select
          value={active}
          onChange={(e) => onSelect(e.target.value)}
          aria-label={label}
          className="min-w-0 w-full appearance-none bg-transparent pl-2.5 pr-8 pb-2 sm:pb-0 sm:pl-2 sm:pr-7 text-xs sm:text-[11px] font-black uppercase tracking-wide text-foreground focus:outline-none cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
              {preferMark && opt.toLowerCase() === preferMark.toLowerCase() ? " ★" : ""}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          size={12}
          strokeWidth={3}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-foreground"
        />
      </span>
    </label>
  )
}

export function Drop() {
  const cached = getDonorPrefs()
  const [items, setItems] = useState<WallItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeGender, setActiveGender] = useState("All")
  const [activeSize, setActiveSize] = useState("All")
  const [activeCondition, setActiveCondition] = useState("All")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [preferGender, setPreferGender] = useState<string | null>(cached?.gender ?? null)
  const [preferUsername, setPreferUsername] = useState<string | null>(cached?.username ?? null)
  /** Nearby 3 km — opt-in; off by default so the full Wall shows. */
  const [nearbyOnly, setNearbyOnly] = useState(false)
  const [viewerLat, setViewerLat] = useState<number | null>(null)
  const [viewerLng, setViewerLng] = useState<number | null>(null)
  const [locationHint, setLocationHint] = useState<string | null>(null)
  const categories = ["All", "Outerwear", "Tops", "Bottoms", "Kicks", "Bags", "Accessories"]
  const genders = ["All", "Women", "Men", "Girls", "Boys", "Unisex"]

  const sizeOptions = useMemo(() => {
    const kids = activeGender === "Girls" || activeGender === "Boys"
    return kids ? ["All", ...KIDS_AGE_BANDS] : ["All", ...APPAREL_SIZES]
  }, [activeGender])

  const filtersActive =
    activeCategory !== "All" ||
    activeGender !== "All" ||
    activeSize !== "All" ||
    activeCondition !== "All"

  const searchActive = searchQuery.trim().length > 0
  const resultsFiltered = filtersActive || searchActive || nearbyOnly

  useEffect(() => {
    async function loadPrefsAndLocation() {
      let lat: number | null = null
      let lng: number | null = null
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
            setPreferGender(profile.gender)
            setPreferUsername(profile.username ?? null)
            setDonorPrefs({ username: profile.username, gender: profile.gender })
          }
          if (profile?.latitude != null && profile?.longitude != null) {
            lat = Number(profile.latitude)
            lng = Number(profile.longitude)
          }
        } catch {
          // Not signed in / expired - keep cached prefs if any.
        }
      }
      if (lat == null || lng == null) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) {
              reject(new Error("no geo"))
              return
            }
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 10 * 60 * 1000,
            })
          })
          lat = pos.coords.latitude
          lng = pos.coords.longitude
        } catch {
          // Guest without permission — Nearby stays off-effective until they share location.
        }
      }
      setViewerLat(lat)
      setViewerLng(lng)
      if (lat == null || lng == null) {
        setLocationHint(
          nearbyOnly
            ? "Share your location (or finish onboarding with a building) to filter giver-sends within 3 km."
            : null,
        )
      } else {
        setLocationHint(null)
      }
    }
    loadPrefsAndLocation()
  }, [nearbyOnly])

  useEffect(() => {
    setActiveSize("All")
  }, [activeGender])

  useEffect(() => {
    async function fetchDrop() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("status", "wall")
        if (viewerLat != null && viewerLng != null) {
          params.set("lat", String(viewerLat))
          params.set("lng", String(viewerLng))
          if (nearbyOnly) params.set("near", "1")
        }
        const wallRes = await api.get<{ items: any[] }>(`/api/items?${params.toString()}`)
        let merged = mergeDropItems(
          (wallRes.items || []).map(mapApiItem),
          activeCategory,
          activeGender,
          activeSize,
          activeCondition,
          searchQuery,
        )
        if (preferGender && activeGender === "All") {
          merged = sortByGenderMatch(merged, preferGender)
        }
        setItems(merged)
      } catch (e) {
        console.error("Failed to load Wall of Kindness items:", e)
        setItems([])
      }
      setLoading(false)
    }
    fetchDrop()
  }, [
    activeCategory,
    activeGender,
    activeSize,
    activeCondition,
    preferGender,
    searchQuery,
    nearbyOnly,
    viewerLat,
    viewerLng,
  ])

  useEffect(() => {
    if (!filtersOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFiltersOpen(false)
    }
    window.addEventListener("keydown", onKey)
    const prevOverflow = document.body.style.overflow
    // Lock scroll only on mobile overlay
    if (window.matchMedia("(max-width: 639px)").matches) {
      document.body.style.overflow = "hidden"
    }
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [filtersOpen])

  function clearFilters() {
    setActiveCategory("All")
    setActiveGender("All")
    setActiveSize("All")
    setActiveCondition("All")
    track(AnalyticsEvent.wallFilterChanged, { type: "clear", value: "all" })
  }

  function clearAll() {
    clearFilters()
    setSearchQuery("")
    setNearbyOnly(false)
  }

  const filterSummary = [
    nearbyOnly ? "Nearby 3 km" : null,
    activeCategory !== "All" ? activeCategory : null,
    activeGender !== "All" ? activeGender : null,
    activeSize !== "All" ? activeSize : null,
    activeCondition !== "All" ? activeCondition : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const activeFilterCount = [
    nearbyOnly,
    activeCategory !== "All",
    activeGender !== "All",
    activeSize !== "All",
    activeCondition !== "All",
  ].filter(Boolean).length

  const filterControls = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap sm:gap-2 min-w-0">
      <div className="min-w-0 col-span-2 sm:col-span-1 sm:flex-1">
        <button
          type="button"
          onClick={() => {
            const next = !nearbyOnly
            setNearbyOnly(next)
            track(AnalyticsEvent.wallFilterChanged, { type: "nearby", value: next ? "on" : "off" })
          }}
          className={cn(
            "w-full h-full min-h-[3.25rem] sm:min-h-10 px-3 border-2 border-foreground text-left text-xs font-black uppercase tracking-wider",
            "shadow-[1px_1px_0px_rgba(0,0,0,1)]",
            nearbyOnly ? "bg-accent-pink text-foreground" : "bg-white text-foreground-muted",
          )}
          aria-pressed={nearbyOnly}
        >
          Nearby · 3 km
          <span className="block text-[9px] font-medium normal-case tracking-normal text-foreground/70 mt-0.5">
            {nearbyOnly
              ? viewerLat != null
                ? "Hiding giver-sends outside your area"
                : "Needs your location"
              : "Show all handover types"}
          </span>
        </button>
      </div>
      <div className="min-w-0 sm:flex-1">
        <FilterSelect
          label="Category"
          options={categories}
          active={activeCategory}
          onSelect={(c) => {
            setActiveCategory(c)
            track(AnalyticsEvent.wallFilterChanged, { type: "category", value: c })
          }}
        />
      </div>
      <div className="min-w-0 sm:flex-1">
        <FilterSelect
          label="For"
          options={genders}
          active={activeGender}
          preferMark={preferGender}
          onSelect={(g) => {
            setActiveGender(g)
            track(AnalyticsEvent.wallFilterChanged, { type: "gender", value: g })
          }}
        />
      </div>
      <div className="min-w-0 sm:flex-1">
        <FilterSelect
          label="Size"
          options={sizeOptions}
          active={activeSize}
          onSelect={(s) => {
            setActiveSize(s)
            track(AnalyticsEvent.wallFilterChanged, { type: "size", value: s })
          }}
        />
      </div>
      <div className="min-w-0 sm:flex-1">
        <FilterSelect
          label="Condition"
          options={CONDITIONS}
          active={activeCondition}
          onSelect={(c) => {
            setActiveCondition(c)
            track(AnalyticsEvent.wallFilterChanged, { type: "condition", value: c })
          }}
        />
      </div>
    </div>
  )

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="mb-8 sm:mb-12 flex flex-col gap-3 sm:gap-4 relative min-w-0">
        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 bg-black text-white text-[10px] sm:text-xs font-black uppercase tracking-widest self-start border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] max-w-full">
          <HeartHandshake size={14} className="text-accent-green shrink-0" />
          <span>PRELOVED CATALOGUE · ₹0 ALWAYS FREE</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black uppercase leading-[0.9] text-foreground text-balance">
          Wall of Kindness
        </h1>
        <p className="text-foreground text-base sm:text-lg md:text-xl max-w-2xl font-medium leading-relaxed">
          Preloved pieces, ready for a new home.
          <br />
          Always free.
        </p>

        {preferGender && (
          <p className="text-sm font-bold text-foreground/80 max-w-2xl">
            {preferUsername ? `@${preferUsername} · ` : ""}
            Showing recommendations for{" "}
            <span className="uppercase text-accent-pink">{preferGender}</span>
            <br />
            Nearby and matching items appear first.
          </p>
        )}

        {locationHint && nearbyOnly && (
          <div className="p-3 border-2 border-foreground bg-white text-sm font-medium max-w-2xl">
            {locationHint}
          </div>
        )}

        {/* Search + filter: mobile overlay pops below button (2×2 readable); desktop inline one-liner */}
        <div className="mt-1 w-full max-w-full flex flex-col gap-2 relative">
          <div className="flex items-stretch gap-2 min-w-0 relative z-[61]">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">Search the Wall</span>
              <Search
                size={16}
                strokeWidth={2.5}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bags, tops, brands…"
                className="w-full h-11 pl-10 pr-3 border-2 border-foreground bg-white text-sm font-medium outline-none shadow-[2px_2px_0px_rgba(0,0,0,1)] focus:shadow-[3px_3px_0px_rgba(0,0,0,1)] placeholder:text-foreground-muted"
              />
            </label>
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="wall-filters-panel"
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 h-11 px-3 sm:px-4 border-2 border-foreground shrink-0",
                "text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]",
                "hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all",
                filtersOpen || filtersActive || nearbyOnly ? "bg-accent-pink text-foreground" : "bg-foreground text-background",
              )}
            >
              <SlidersHorizontal size={14} strokeWidth={2.5} />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="min-w-[1.15rem] h-5 px-1 bg-white text-foreground text-[10px] leading-5 text-center border-2 border-foreground">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown
                size={14}
                strokeWidth={3}
                className={cn("transition-transform", filtersOpen && "rotate-180")}
              />
            </button>
          </div>

          {/* Mobile backdrop */}
          {filtersOpen && (
            <button
              type="button"
              aria-label="Close filters"
              className="sm:hidden fixed inset-0 z-[60] bg-black/45"
              onClick={() => setFiltersOpen(false)}
            />
          )}

          {/* Panel: absolute below button on mobile; inline on desktop */}
          {filtersOpen && (
            <div
              id="wall-filters-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wall-filters-title"
              className={cn(
                "border-2 border-foreground bg-white shadow-[4px_4px_0px_rgba(0,0,0,1)] p-3 flex flex-col gap-3",
                "absolute left-0 right-0 top-full mt-2 z-[62] sm:static sm:mt-0 sm:shadow-[3px_3px_0px_rgba(0,0,0,1)]",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  id="wall-filters-title"
                  className="text-[10px] font-black uppercase tracking-widest text-foreground-muted"
                >
                  Narrow results
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-[10px] font-black uppercase tracking-widest underline text-foreground-muted hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="text-[10px] font-black uppercase tracking-widest border-2 border-foreground px-2.5 py-1.5 bg-foreground text-background"
                  >
                    Done · {loading ? "…" : items.length}
                  </button>
                </div>
              </div>
              {filterControls}
            </div>
          )}

          {(filtersActive || searchActive) && (
            <div className="flex items-center gap-2 min-w-0">
              <p className="flex-1 min-w-0 truncate text-[10px] sm:text-[11px] font-bold text-foreground-muted">
                {searchActive ? `“${searchQuery.trim()}”` : ""}
                {searchActive && filtersActive ? " · " : ""}
                {filtersActive ? filterSummary : ""}
                {!loading ? ` · ${items.length} on wall` : ""}
              </p>
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest underline text-foreground-muted hover:text-foreground shrink-0"
              >
                <X size={11} strokeWidth={3} /> Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div
              key={n}
              className="h-80 bg-surface-muted border-2 border-foreground animate-pulse p-4 flex flex-col justify-between"
            >
              <div className="w-full h-48 bg-black/10" />
              <div className="h-4 bg-black/10 w-3/4" />
              <div className="h-4 bg-black/10 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="w-full py-24 px-6 flex flex-col items-center justify-center text-center gap-6 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-2xl mx-auto my-12">
          <PackagePlus size={48} className="text-accent-pink" />
          <h3 className="text-2xl font-display font-black uppercase text-foreground">
            {resultsFiltered ? "No items match" : "No items on the wall yet"}
          </h3>
          <p className="text-foreground-muted font-medium max-w-md">
            {resultsFiltered
              ? `Nothing for ${[searchActive ? `"${searchQuery.trim()}"` : null, filterSummary || null].filter(Boolean).join(" · ")}. Clear search/filters or try another size / category.`
              : "Be the first to pass on an item and feature on the Wall of Kindness!"}
          </p>
          {resultsFiltered ? (
            <Button
              type="button"
              variant="outline"
              onClick={clearAll}
              className="font-black uppercase tracking-widest"
            >
              Clear all
            </Button>
          ) : (
            <Link
              to="/give"
              onClick={() =>
                track(AnalyticsEvent.ctaDropItem, { source: "drop_empty", category: activeCategory })
              }
            >
              <Button variant="cta" className="font-black uppercase tracking-widest">
                Drop an item
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <WallOfKindness items={items} preferGender={preferGender} />
      )}
    </div>
  )
}
