import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { cn } from "@/lib/utils"
import { WallOfKindness, type WallItem } from "@/components/ui/WallOfKindness"
import { closetWallItems } from "@/lib/closetItems"
import { getDonorPrefs, getDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { sortByGenderMatch } from "@/lib/genderMatch"
import { HeartHandshake, PackagePlus } from "lucide-react"

function mapApiItem(item: any): WallItem {
  return {
    ...item,
    public_status: item.publicStatus,
    gender: item.gender,
    item_images: (item.images || []).map((img: { storagePath?: string }) => ({
      storage_path: resolveImageUrl(img.storagePath),
    })),
  }
}

function isStockPhoto(item: WallItem) {
  return (item.item_images || []).some((img) => (img.storage_path || "").includes("unsplash.com"))
}

function mergeDropItems(apiItems: WallItem[], category: string, gender: string): WallItem[] {
  const live = apiItems.filter((item) => !isStockPhoto(item))
  if (live.length > 0) {
    return live.filter((item) => {
      if (category !== "All" && item.category !== category) return false
      if (gender !== "All" && (item.gender || "") !== gender.toLowerCase()) return false
      return true
    })
  }

  // Offline / empty API — curated closet fallback
  return closetWallItems().filter((item) => {
    if (category !== "All" && item.category !== category) return false
    if (gender !== "All" && item.gender !== gender.toLowerCase()) return false
    return true
  })
}

function genderLabel(g: string) {
  return g.charAt(0).toUpperCase() + g.slice(1)
}

export function Drop() {
  const cached = getDonorPrefs()
  const [items, setItems] = useState<WallItem[]>(() => closetWallItems())
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState("All")
  const [activeGender, setActiveGender] = useState(() =>
    cached?.gender ? genderLabel(cached.gender) : "All",
  )
  const [preferGender, setPreferGender] = useState<string | null>(cached?.gender ?? null)
  const [preferUsername, setPreferUsername] = useState<string | null>(cached?.username ?? null)
  const categories = ["All", "Clothing", "Footwear", "Bags"]
  const genders = ["All", "Men", "Women", "Kids", "Unisex"]

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
          setActiveGender((prev) => (prev === "All" ? genderLabel(profile.gender!) : prev))
        }
      } catch {
        // Not signed in / expired — keep cached prefs if any.
      }
    }
    loadPrefs()
  }, [])

  useEffect(() => {
    async function fetchDrop() {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (activeCategory !== "All") params.set("category", activeCategory)
        if (activeGender !== "All") params.set("gender", activeGender.toLowerCase())
        params.set("status", "wall")
        const qs = `?${params.toString()}`
        const { items: data } = await api.get<{ items: any[] }>(`/api/items${qs}`)
        let merged = mergeDropItems(data.map(mapApiItem), activeCategory, activeGender)
        if (preferGender && activeGender === "All") {
          merged = sortByGenderMatch(merged, preferGender)
        }
        setItems(merged)
      } catch (e) {
        console.error("Failed to load Wall of Kindness items:", e)
        let fallback = mergeDropItems([], activeCategory, activeGender)
        if (preferGender && activeGender === "All") {
          fallback = sortByGenderMatch(fallback, preferGender)
        }
        setItems(fallback)
      }
      setLoading(false)
    }
    fetchDrop()
  }, [activeCategory, activeGender, preferGender])

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-16">
      {/* Header Banner */}
      <div className="mb-12 flex flex-col gap-4 relative">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white text-xs font-black uppercase tracking-widest self-start border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          <HeartHandshake size={14} className="text-accent-green" />
          <span>PRE-LOVED CATALOGUE &bull; ₹0 ALWAYS FREE</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-display font-black uppercase leading-[0.9] text-foreground">
          Wall of Kindness
        </h1>
        <p className="text-foreground text-lg md:text-xl max-w-2xl font-medium leading-relaxed">
          Curated preloved items ready for a new home. Every item is given freely and matched through verified community partners.
        </p>

        {preferGender && (
          <p className="text-sm font-bold text-foreground/80 max-w-2xl">
            {preferUsername ? `@${preferUsername} · ` : ""}
            Showing recommendations for{" "}
            <span className="uppercase text-accent-pink">{preferGender}</span>
            {" "}— tiles tagged <span className="font-black uppercase tracking-widest text-[11px] bg-accent-yellow border border-foreground px-1.5 py-0.5 shadow-[1px_1px_0px_rgba(0,0,0,1)]">FOR YOU</span> match your pick.
          </p>
        )}

        {/* Category Filters */}
        <div className="mt-6 flex flex-col gap-4 border-b-2 border-foreground pb-6">
          <div className="flex items-center gap-2 overflow-x-auto w-full scrollbar-hide py-1">
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setActiveCategory(c)}
                className={cn(
                  "whitespace-nowrap px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all",
                  activeCategory === c
                    ? "bg-foreground text-background shadow-none translate-x-[2px] translate-y-[2px]"
                    : "bg-white hover:bg-black/5 text-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto w-full scrollbar-hide py-1">
            <span className="text-[11px] font-black uppercase tracking-widest text-foreground-muted shrink-0 mr-1">For:</span>
            {genders.map(g => (
              <button
                key={g}
                onClick={() => setActiveGender(g)}
                className={cn(
                  "whitespace-nowrap px-3 py-1.5 border-2 border-foreground text-[11px] font-black uppercase tracking-widest transition-all",
                  activeGender === g
                    ? "bg-accent-pink text-foreground shadow-none translate-x-[2px] translate-y-[2px]"
                    : "bg-white hover:bg-black/5 text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                )}
              >
                {g}
                {preferGender && g.toLowerCase() === preferGender ? " ★" : ""}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1,2,3,4,5,6,7,8].map(n => (
            <div key={n} className="h-80 bg-surface-muted border-2 border-foreground animate-pulse p-4 flex flex-col justify-between">
              <div className="w-full h-48 bg-black/10" />
              <div className="h-4 bg-black/10 w-3/4" />
              <div className="h-4 bg-black/10 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="w-full py-24 px-6 flex flex-col items-center justify-center text-center gap-6 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-2xl mx-auto my-12">
          <PackagePlus size={48} className="text-accent-blue" />
          <h3 className="text-2xl font-display font-black uppercase text-foreground">
            No items listed in "{activeCategory}" yet.
          </h3>
          <p className="text-foreground-muted font-medium max-w-md">
            Be the first to pass on an item in this category and feature on the Wall of Kindness!
          </p>
          <Link to="/give">
            <Button className="border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all font-black uppercase tracking-widest bg-accent-pink text-foreground hover:bg-accent-pink">
              Drop an item in {activeCategory}
            </Button>
          </Link>
        </div>
      ) : (
        <WallOfKindness items={items} preferGender={preferGender} />
      )}
    </div>
  )
}
