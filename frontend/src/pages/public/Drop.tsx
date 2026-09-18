import { useState, useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { HeartHandshake, PackagePlus, X } from "lucide-react"
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
): WallItem[] {
  const cats = categoryFilterValues(category)
  const gens = genderFilterValues(gender)
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
    return true
  })
}

function FilterChipRow({
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
  return (
    <div className="relative min-w-0">
      <div className="flex items-center gap-2 overflow-x-auto w-full scrollbar-hide py-1 pr-6">
        <span className="text-[11px] font-black uppercase tracking-widest text-foreground-muted shrink-0 mr-0.5">
          {label}
        </span>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onSelect(opt)}
            className={cn(
              "whitespace-nowrap px-3 py-1.5 border-2 border-foreground text-[11px] font-black uppercase tracking-widest transition-all shrink-0",
              active === opt
                ? "bg-accent-pink text-foreground shadow-none translate-x-[2px] translate-y-[2px]"
                : "bg-white hover:bg-black/5 text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]",
            )}
          >
            {opt}
            {preferMark && opt.toLowerCase() === preferMark.toLowerCase() ? " ★" : ""}
          </button>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent md:hidden"
      />
    </div>
  )
}

export function Drop() {
  const cached = getDonorPrefs()
  const [items, setItems] = useState<WallItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeGender, setActiveGender] = useState("All")
  const [activeSize, setActiveSize] = useState("All")
  const [activeCondition, setActiveCondition] = useState("All")
  const [preferGender, setPreferGender] = useState<string | null>(cached?.gender ?? null)
  const [preferUsername, setPreferUsername] = useState<string | null>(cached?.username ?? null)
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

  useEffect(() => {
    async function loadPrefs() {
      if (!getDonorToken()) return
      try {
        const { profile } = await api.donor.get<{
          profile: { username?: string | null; gender?: string | null } | null
        }>("/api/donor/profile")
        if (profile?.gender) {
          setPreferGender(profile.gender)
          setPreferUsername(profile.username ?? null)
          setDonorPrefs({ username: profile.username, gender: profile.gender })
        }
      } catch {
        // Not signed in / expired - keep cached prefs if any.
      }
    }
    loadPrefs()
  }, [])

  useEffect(() => {
    setActiveSize("All")
  }, [activeGender])

  useEffect(() => {
    async function fetchDrop() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set("status", "wall")
        const qs = `?${params.toString()}`
        const { items: data } = await api.get<{ items: any[] }>(`/api/items${qs}`)
        let merged = mergeDropItems(
          data.map(mapApiItem),
          activeCategory,
          activeGender,
          activeSize,
          activeCondition,
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
  }, [activeCategory, activeGender, activeSize, activeCondition, preferGender])

  function clearFilters() {
    setActiveCategory("All")
    setActiveGender("All")
    setActiveSize("All")
    setActiveCondition("All")
    track(AnalyticsEvent.wallFilterChanged, { type: "clear", value: "all" })
  }

  const filterSummary = [
    activeCategory !== "All" ? activeCategory : null,
    activeGender !== "All" ? activeGender : null,
    activeSize !== "All" ? activeSize : null,
    activeCondition !== "All" ? activeCondition : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="mb-10 sm:mb-12 flex flex-col gap-4 relative min-w-0">
        <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1 bg-black text-white text-[10px] sm:text-xs font-black uppercase tracking-widest self-start border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)] max-w-full">
          <HeartHandshake size={14} className="text-accent-green shrink-0" />
          <span>PRE-LOVED CATALOGUE · ₹0 ALWAYS FREE</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black uppercase leading-[0.9] text-foreground text-balance">
          Wall of Kindness
        </h1>
        <p className="text-foreground text-base sm:text-lg md:text-xl max-w-2xl font-medium leading-relaxed">
          Curated preloved items ready for a new home. Every item is given freely and matched through verified community partners.
        </p>

        {preferGender && (
          <p className="text-sm font-bold text-foreground/80 max-w-2xl">
            {preferUsername ? `@${preferUsername} · ` : ""}
            Showing recommendations for{" "}
            <span className="uppercase text-accent-pink">{preferGender}</span>
            {" "}— nearby and matching items appear first. Use filters below to narrow by women, size, and more.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 border-2 border-foreground bg-white p-3 sm:p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs font-black uppercase tracking-widest text-foreground">Filters</p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest underline text-foreground-muted hover:text-foreground"
              >
                <X size={12} strokeWidth={3} /> Clear all
              </button>
            )}
          </div>

          <FilterChipRow
            label="Category"
            options={categories}
            active={activeCategory}
            onSelect={(c) => {
              setActiveCategory(c)
              track(AnalyticsEvent.wallFilterChanged, { type: "category", value: c })
            }}
          />
          <FilterChipRow
            label="For"
            options={genders}
            active={activeGender}
            preferMark={preferGender}
            onSelect={(g) => {
              setActiveGender(g)
              track(AnalyticsEvent.wallFilterChanged, { type: "gender", value: g })
            }}
          />
          <FilterChipRow
            label="Size"
            options={sizeOptions}
            active={activeSize}
            onSelect={(s) => {
              setActiveSize(s)
              track(AnalyticsEvent.wallFilterChanged, { type: "size", value: s })
            }}
          />
          <FilterChipRow
            label="Condition"
            options={CONDITIONS}
            active={activeCondition}
            onSelect={(c) => {
              setActiveCondition(c)
              track(AnalyticsEvent.wallFilterChanged, { type: "condition", value: c })
            }}
          />

          {filtersActive && (
            <p className="text-[11px] font-bold text-foreground-muted pt-1 border-t border-foreground/15">
              Showing: {filterSummary}
              {!loading ? ` · ${items.length} item${items.length === 1 ? "" : "s"}` : ""}
            </p>
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
            {filtersActive ? "No items match these filters" : "No items on the wall yet"}
          </h3>
          <p className="text-foreground-muted font-medium max-w-md">
            {filtersActive
              ? `Nothing for ${filterSummary}. Clear filters or try another size / category.`
              : "Be the first to pass on an item and feature on the Wall of Kindness!"}
          </p>
          {filtersActive ? (
            <Button
              type="button"
              variant="outline"
              onClick={clearFilters}
              className="font-black uppercase tracking-widest"
            >
              Clear filters
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
