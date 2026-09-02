import React, { Component, ErrorInfo, ReactNode, useState, useMemo } from "react"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { X, MapPin, Building2, Package } from "lucide-react"
import { MOCK_ITEMS } from "@/lib/seed"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { Link } from "react-router-dom"
import Map, { Marker } from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnalyticsEvent, track } from "@/lib/analytics"

// Mock localized data to Mumbai
const MOCK_MAP_DATA = [
  { id: '1', lat: 19.0596, lng: 72.8295, area: 'Bandra', type: 'available', itemIds: ['1', '11'], svgX: 28, svgY: 52 },
  { id: '2', lat: 19.1025, lng: 72.8267, area: 'Juhu', type: 'available', itemIds: ['2'], svgX: 26, svgY: 42 },
  { id: '3', lat: 19.1136, lng: 72.8697, area: 'Andheri', type: 'available', itemIds: ['3'], svgX: 38, svgY: 38 },
  { id: '4', lat: 19.0688, lng: 72.8358, area: 'Khar', type: 'available', itemIds: ['4'], svgX: 30, svgY: 50 },
  { id: '5', lat: 18.9067, lng: 72.8147, area: 'Colaba', type: 'available', itemIds: ['5'], svgX: 20, svgY: 85 },
  { id: '6', lat: 19.1176, lng: 72.9060, area: 'Powai', type: 'available', itemIds: ['6'], svgX: 52, svgY: 36 },
  { id: '7', lat: 19.0515, lng: 72.8988, area: 'Chembur', type: 'available', itemIds: ['7'], svgX: 50, svgY: 55 },
  { id: '8', lat: 19.1860, lng: 72.8485, area: 'Malad', type: 'available', itemIds: ['8'], svgX: 32, svgY: 22 },
  { id: '9', lat: 19.0178, lng: 72.8478, area: 'Dadar', type: 'available', itemIds: ['9'], svgX: 34, svgY: 62 },
  { id: '10', lat: 18.9220, lng: 72.8146, area: 'South Mumbai', type: 'available', itemIds: ['10'], svgX: 22, svgY: 80 },
  { id: '11', lat: 19.2183, lng: 72.9781, area: 'Thane', type: 'available', itemIds: ['12'], svgX: 72, svgY: 15 },
  
  // Partner & Pickup points
  { id: 'p1', lat: 19.0550, lng: 72.8300, area: 'Bandra Hub', type: 'partner', svgX: 29, svgY: 54 },
  { id: 'p2', lat: 19.1200, lng: 72.9000, area: 'Powai Partner Center', type: 'pickup', svgX: 51, svgY: 37 },
  { id: 'p3', lat: 19.0200, lng: 72.8500, area: 'Dadar Distribution', type: 'partner', svgX: 35, svgY: 63 }
]

type Hotspot = typeof MOCK_MAP_DATA[0]

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
    console.warn("MapTiler / MapLibre failed to load, switching to interactive fallback map:", error, errorInfo)
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
  const [viewState, setViewState] = useState({
    longitude: 72.8777,
    latitude: 19.0760,
    zoom: 10
  })
  const [filter, setFilter] = useState<'all' | 'available' | 'partner' | 'pickup'>('all')

  // "dataviz-light" is deliberately grayscale (built for data overlays, not
  // for looking like a map) - "streets-v2" has real color: green parks,
  // blue water, distinct road/building tones.
  const maptilerKey = import.meta.env.VITE_MAPTILER_API_KEY || ''
  const mapStyle = maptilerKey
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${maptilerKey}`
    : `https://api.maptiler.com/maps/streets-v2/style.json?key=get_your_own_OpendataKey`

  const filteredData = useMemo(() => {
    return MOCK_MAP_DATA.filter(d => filter === 'all' || d.type === filter)
  }, [filter])

  const handleSpotClick = (spot: Hotspot) => {
    setActiveSpot(spot)
  }

  // Interactive Fallback SVG Map for Mumbai
  const FallbackMap = (
    <div className="relative w-full h-[500px] bg-amber-50/40 border-2 border-foreground p-4 overflow-hidden flex items-center justify-center">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0000000d_1px,transparent_1px),linear-gradient(to_bottom,#0000000d_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      {/* Stylized Mumbai Coastal Vector Path */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M 15 100 C 18 80 22 70 20 50 C 18 30 25 20 30 0 L 100 0 L 100 100 Z" fill="#000" />
      </svg>

      <div className="absolute top-4 left-4 z-10 bg-white border-2 border-foreground px-3 py-1.5 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_rgba(0,0,0,1)]">
        MUMBAI COMMUNITY MAP (INTERACTIVE VECTOR)
      </div>

      {/* Interactive Pins */}
      <div className="relative w-full h-full max-w-2xl mx-auto">
        {filteredData.map((spot) => (
          <button
            key={spot.id}
            onClick={() => handleSpotClick(spot)}
            style={{ top: `${spot.svgY}%`, left: `${spot.svgX}%` }}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 group transition-transform z-20",
              activeSpot?.id === spot.id ? "scale-125 z-30" : "hover:scale-110"
            )}
          >
            <div className={cn(
              "px-2 py-1 text-[10px] font-black uppercase border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] whitespace-nowrap flex items-center gap-1",
              spot.type === 'available' ? 'bg-accent-blue text-white' :
              spot.type === 'pickup' ? 'bg-accent-green text-foreground' : 'bg-accent-red text-white'
            )}>
              <MapPin size={12} />
              <span>{spot.area}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="w-full relative flex flex-col gap-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 z-10">
        <div>
          <span className="text-xs font-black uppercase tracking-widest text-foreground-muted block mb-1">Interactive Localities</span>
          <h3 className="text-2xl font-display font-black uppercase">Mumbai Drop &amp; Partner Network</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={cn("px-3 py-1.5 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]", filter === 'all' ? "bg-foreground text-background" : "bg-white text-foreground")}>All</button>
          <button onClick={() => setFilter('available')} className={cn("px-3 py-1.5 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]", filter === 'available' ? "bg-accent-blue text-white" : "bg-white text-foreground")}>Available Goods</button>
          <button onClick={() => setFilter('partner')} className={cn("px-3 py-1.5 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]", filter === 'partner' ? "bg-accent-red text-white" : "bg-white text-foreground")}>Partner Hubs</button>
        </div>
      </div>

      <div className="relative w-full h-[500px] border-2 border-foreground bg-surface-muted overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        {useFallback ? (
          FallbackMap
        ) : (
          <MapErrorBoundary fallback={FallbackMap}>
            <Map
              {...viewState}
              onMove={evt => setViewState(evt.viewState)}
              mapStyle={mapStyle}
              style={{ width: '100%', height: '100%' }}
              onClick={() => setActiveSpot(null)}
              onError={() => setUseFallback(true)}
            >
              {filteredData.map(spot => (
                <Marker
                  key={spot.id}
                  longitude={spot.lng}
                  latitude={spot.lat}
                  anchor="bottom"
                  onClick={(e) => {
                    e.originalEvent.stopPropagation()
                    handleSpotClick(spot)
                  }}
                >
                  <div className="relative group cursor-pointer">
                    <div className={cn(
                      "px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border-2 border-foreground flex items-center gap-1 shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-transform",
                      activeSpot?.id === spot.id ? "scale-125 z-20" : "group-hover:scale-110",
                      spot.type === 'available' ? 'bg-accent-blue text-white' : 
                      spot.type === 'pickup' ? 'bg-accent-green text-foreground' : 
                      'bg-accent-red text-white'
                    )}>
                      <MapPin size={10} />
                      <span>{spot.area}</span>
                    </div>
                  </div>
                </Marker>
              ))}
            </Map>
          </MapErrorBoundary>
        )}

        <AnimatePresence>
          {activeSpot && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-white border-l-2 border-foreground p-6 shadow-[-8px_0_0_rgba(0,0,0,0.05)] z-30 flex flex-col"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h4 className="font-display font-black text-2xl uppercase tracking-tight">{activeSpot.area}</h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">{activeSpot.type}</span>
                </div>
                <button onClick={() => setActiveSpot(null)} className="p-1 border-2 border-foreground bg-surface hover:bg-black/5 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {activeSpot.type === 'available' && activeSpot.itemIds && (
                <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-4">
                  {activeSpot.itemIds.map(itemId => {
                    const item = MOCK_ITEMS.find(i => i.id === itemId)
                    if (!item) return null
                    return (
                      <Link key={itemId} to={`/drop/${item.slug}`} className="flex gap-3 p-3 border-2 border-foreground bg-white hover:bg-black/5 transition-colors">
                        <SafeImage src={item.item_images[0].storage_path} alt={item.title} className="w-16 h-16 object-cover border border-foreground bg-surface-muted" />
                        <div className="flex flex-col justify-between overflow-hidden">
                          <span className="font-bold text-sm truncate leading-tight">{item.title}</span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground-muted">{item.category}</span>
                          <span className="text-[10px] font-black uppercase bg-foreground text-white px-2 py-0.5 mt-1 self-start">FREE</span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
              
              {activeSpot.type === 'partner' && (
                <div className="flex-1 border-t-2 border-foreground/10 pt-4">
                  <span className="text-xs font-black uppercase text-accent-red block mb-1">Partner Hub</span>
                  <p className="text-sm font-bold">Verified Community Organization</p>
                  <p className="text-xs text-foreground-muted mt-2 leading-relaxed">
                    Facilitating zero-cost distribution directly to verified families and schools in this locality.
                  </p>
                </div>
              )}

              {activeSpot.type === 'available' && (
                <Link to="/drop" className="w-full mt-6" onClick={() => track(AnalyticsEvent.ctaExploreWall, { source: "kindness_map" })}>
                  <Button variant="cta" className="w-full font-black uppercase tracking-widest">
                    Explore Wall
                  </Button>
                </Link>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
