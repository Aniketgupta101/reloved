import React, { Component, ErrorInfo, ReactNode, useEffect, useState, useMemo } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { X, MapPin } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { Link } from "react-router-dom"
import MapLibreMap, { Marker } from "react-map-gl/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { api, resolveImageUrl } from "@/lib/api"

/** Approximate area centroids for public map pins (never exact addresses). */
const AREA_COORDS: Record<string, { lat: number; lng: number; svgX: number; svgY: number }> = {
  bandra: { lat: 19.0596, lng: 72.8295, svgX: 28, svgY: 52 },
  "bandra west": { lat: 19.0596, lng: 72.8295, svgX: 28, svgY: 52 },
  juhu: { lat: 19.1025, lng: 72.8267, svgX: 26, svgY: 42 },
  andheri: { lat: 19.1136, lng: 72.8697, svgX: 38, svgY: 38 },
  "andheri west": { lat: 19.1197, lng: 72.8464, svgX: 34, svgY: 40 },
  khar: { lat: 19.0688, lng: 72.8358, svgX: 30, svgY: 50 },
  colaba: { lat: 18.9067, lng: 72.8147, svgX: 20, svgY: 85 },
  powai: { lat: 19.1176, lng: 72.906, svgX: 52, svgY: 36 },
  chembur: { lat: 19.0515, lng: 72.8988, svgX: 50, svgY: 55 },
  malad: { lat: 19.186, lng: 72.8485, svgX: 32, svgY: 22 },
  dadar: { lat: 19.0178, lng: 72.8478, svgX: 34, svgY: 62 },
  "south mumbai": { lat: 18.922, lng: 72.8146, svgX: 22, svgY: 80 },
  thane: { lat: 19.2183, lng: 72.9781, svgX: 72, svgY: 15 },
  mumbai: { lat: 19.076, lng: 72.8777, svgX: 40, svgY: 48 },
}

type MapItem = {
  id: string
  slug: string
  title: string
  category?: string | null
  locality?: string | null
  publicStatus?: string | null
  image?: string | null
}

type Hotspot = {
  id: string
  lat: number
  lng: number
  area: string
  type: "available" | "being_matched" | "claimed"
  svgX: number
  svgY: number
  items: MapItem[]
}

function resolveAreaCoords(locality: string | null | undefined) {
  const key = String(locality || "mumbai").toLowerCase().trim()
  if (AREA_COORDS[key]) return AREA_COORDS[key]
  for (const [name, coords] of Object.entries(AREA_COORDS)) {
    if (key.includes(name) || name.includes(key)) return coords
  }
  return AREA_COORDS.mumbai
}

function statusType(status: string | null | undefined): Hotspot["type"] {
  const s = String(status || "available").toLowerCase()
  if (s === "being_matched") return "being_matched"
  if (s === "claimed") return "claimed"
  return "available"
}

interface MapErrorBoundaryProps {
  fallback: ReactNode
  children: ReactNode
}

interface MapErrorBoundaryState {
  hasError: boolean
}

class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  declare props: MapErrorBoundaryProps
  declare state: MapErrorBoundaryState

  constructor(props: MapErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn("MapLibre failed to load, switching to fallback map:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export function KindnessMap() {
  const [activeSpot, setActiveSpot] = useState<Hotspot | null>(null)
  const [useFallback, setUseFallback] = useState(false)
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [loading, setLoading] = useState(true)
  const [viewState, setViewState] = useState({
    longitude: 72.8777,
    latitude: 19.076,
    zoom: 10,
  })
  const [filter, setFilter] = useState<"all" | "available" | "being_matched" | "claimed">("all")

  const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY || ""
  const mapStyle = maptilerKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`
    : `https://api.maptiler.com/maps/streets-v2/style.json?key=get_your_own_OpendataKey`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { items } = await api.get<{ items: any[] }>("/api/items?status=wall")
        const live = (items || []).filter((item) =>
          (item.images || []).some((img: { storagePath?: string }) => Boolean(img.storagePath)),
        )
        const byArea = new Map<string, MapItem[]>()
        for (const item of live) {
          const area = String(item.locality || "Mumbai").trim() || "Mumbai"
          const list = byArea.get(area) || []
          list.push({
            id: item.id,
            slug: item.slug,
            title: item.title,
            category: item.category,
            locality: area,
            publicStatus: item.publicStatus,
            image: resolveImageUrl(item.images?.[0]?.storagePath),
          })
          byArea.set(area, list)
        }
        const spots: Hotspot[] = []
        for (const [area, areaItems] of byArea.entries()) {
          const coords = resolveAreaCoords(area)
          const dominant =
            areaItems.some((i) => statusType(i.publicStatus) === "available")
              ? "available"
              : areaItems.some((i) => statusType(i.publicStatus) === "being_matched")
                ? "being_matched"
                : "claimed"
          spots.push({
            id: area.toLowerCase().replace(/\s+/g, "-"),
            lat: coords.lat,
            lng: coords.lng,
            area,
            type: dominant,
            svgX: coords.svgX,
            svgY: coords.svgY,
            items: areaItems,
          })
        }
        if (!cancelled) setHotspots(spots)
      } catch (err) {
        console.warn("KindnessMap live inventory failed:", err)
        if (!cancelled) setHotspots([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredData = useMemo(() => {
    return hotspots.filter((d) => {
      if (filter === "all") return true
      if (filter === "being_matched") {
        return (
          d.type === "being_matched" ||
          d.type === "claimed" ||
          d.items.some((i) => {
            const t = statusType(i.publicStatus)
            return t === "being_matched" || t === "claimed"
          })
        )
      }
      return d.type === filter || d.items.some((i) => statusType(i.publicStatus) === filter)
    })
  }, [hotspots, filter])

  const pinTone = (type: Hotspot["type"]) =>
    type === "available"
      ? "bg-accent-green text-foreground"
      : type === "being_matched"
        ? "bg-accent-yellow text-foreground"
        : "bg-accent-pink text-foreground"

  const FallbackMap = (
    <div className="relative w-full h-[min(70dvh,500px)] sm:h-[500px] bg-amber-50/40 border-2 border-foreground p-2 sm:p-4 overflow-hidden flex items-center justify-center">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0000000d_1px,transparent_1px),linear-gradient(to_bottom,#0000000d_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute top-4 left-4 z-10 bg-white border-2 border-foreground px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]">
        Mumbai live inventory map
      </div>
      <div className="relative w-full h-full max-w-2xl mx-auto">
        {filteredData.map((spot) => (
          <button
            key={spot.id}
            onClick={() => setActiveSpot(spot)}
            style={{ top: `${spot.svgY}%`, left: `${spot.svgX}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 group transition-transform z-20",
              activeSpot?.id === spot.id ? "scale-125 z-30" : "hover:scale-110",
            )}
          >
            <div
              className={cn(
                "px-2 py-1 text-[10px] font-black uppercase border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap flex items-center gap-1",
                pinTone(spot.type),
              )}
            >
              <MapPin size={12} />
              <span>
                {spot.area} · {spot.items.length}
              </span>
            </div>
          </button>
        ))}
        {!loading && filteredData.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground-muted">
            No live inventory pins yet
          </p>
        )}
      </div>
    </div>
  )

  return (
    <div className="w-full relative flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 z-10">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block mb-1">
            Interactive localities
          </span>
          <h3 className="text-2xl font-display font-black uppercase">Live Wall map</h3>
          <p className="text-sm font-medium text-foreground-muted mt-1">
            Pins use broad areas only — never exact addresses.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["available", "Available"],
              ["being_matched", "Claimed"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "px-3 py-1.5 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]",
                filter === key ? "bg-foreground text-background" : "bg-white text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full h-[min(70dvh,500px)] sm:h-[500px] border-2 border-foreground bg-surface-muted overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        {useFallback ? (
          FallbackMap
        ) : (
          <MapErrorBoundary fallback={FallbackMap}>
            <MapLibreMap
              {...viewState}
              onMove={(evt) => setViewState(evt.viewState)}
              mapStyle={mapStyle}
              style={{ width: "100%", height: "100%" }}
              onClick={() => setActiveSpot(null)}
              onError={() => setUseFallback(true)}
            >
              {filteredData.map((spot) => (
                <Marker
                  key={spot.id}
                  longitude={spot.lng}
                  latitude={spot.lat}
                  anchor="bottom"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation()
                    setActiveSpot(spot)
                  }}
                >
                  <div className="relative group cursor-pointer">
                    <div
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-foreground flex items-center gap-1 shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-transform",
                        activeSpot?.id === spot.id ? "scale-125 z-20" : "group-hover:scale-110",
                        pinTone(spot.type),
                      )}
                    >
                      <MapPin size={10} />
                      <span>
                        {spot.area} · {spot.items.length}
                      </span>
                    </div>
                  </div>
                </Marker>
              ))}
            </MapLibreMap>
          </MapErrorBoundary>
        )}

        <AnimatePresence>
          {activeSpot && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-white border-l-2 border-foreground p-4 sm:p-6 shadow-[-8px_0_0_rgba(0,0,0,0.05)] z-30 flex flex-col max-h-full overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="font-display font-black text-2xl uppercase tracking-tight">{activeSpot.area}</h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                    {activeSpot.items.length} item{activeSpot.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={() => setActiveSpot(null)}
                  className="p-1 border-2 border-foreground bg-surface hover:bg-black/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
                {activeSpot.items.map((item) => (
                  <Link
                    key={item.id}
                    to={`/drop/${item.slug}`}
                    className="flex gap-3 p-3 border-2 border-foreground bg-white hover:bg-black/5 transition-colors"
                  >
                    <SafeImage
                      src={item.image || undefined}
                      alt={item.title}
                      className="w-16 h-16 object-cover border border-foreground bg-surface-muted"
                    />
                    <div className="flex flex-col justify-between overflow-hidden">
                      <span className="font-bold text-sm truncate leading-tight">{item.title}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">
                        {item.category}
                      </span>
                      <span className="text-[10px] font-black uppercase bg-foreground text-white px-2 py-0.5 mt-1 self-start">
                        {statusType(item.publicStatus) === "available"
                          ? "Available"
                          : statusType(item.publicStatus) === "being_matched" ||
                              statusType(item.publicStatus) === "claimed"
                            ? "Claimed"
                            : "Reloved"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>

              <Link
                to="/drop"
                className="w-full mt-6"
                onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "kindness_map" })}
              >
                <Button variant="cta" className="w-full font-black uppercase tracking-widest">
                  Explore Wall
                </Button>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
