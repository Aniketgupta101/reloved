import { useEffect, useRef, useState } from "react"
import { Input, type InputProps } from "@/components/ui/Input"
import { MapPin } from "lucide-react"

// Photon (komoot, OSM-based) — free public instance, no API key, fine for
// live-typing autocomplete. Nominatim was considered but its usage policy
// forbids exactly this (per-keystroke) usage pattern, key-free or not.
const PHOTON_URL = "https://photon.komoot.io/api/"
// Mumbai center — biases results toward nearby places without hard-restricting search.
const MUMBAI_LAT = 19.076
const MUMBAI_LON = 72.8777

function buildLabel(p: Record<string, string | undefined>) {
  const streetPart = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
  const parts = [p.name, streetPart, p.district || p.locality, p.city, p.state]
  const seen = new Set<string>()
  const unique = parts.filter((part): part is string => {
    if (!part || seen.has(part)) return false
    seen.add(part)
    return true
  })
  return unique.join(", ")
}

// Reverse-geocode a lat/lng into a human address (+ postcode when known), for "share my location" flows.
export async function reverseGeocode(lat: number, lng: number): Promise<{ label: string; postcode?: string } | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "en" })
    const res = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`)
    if (!res.ok) throw new Error("reverse geocoding request failed")
    const data = await res.json()
    const feature = (data.features || [])[0]
    if (!feature) return null
    const label = buildLabel(feature.properties || {})
    if (!label) return null
    return { label, postcode: feature.properties?.postcode }
  } catch {
    return null
  }
}

interface Suggestion {
  id: string
  place_name: string
}

interface AddressAutocompleteProps extends Omit<InputProps, "onChange" | "onSelect"> {
  value: string
  onChange: (value: string) => void
  // Fires only when a suggestion is picked (not on free typing) — lets
  // callers also capture lat/lng/postcode, e.g. to prefill "share my
  // location" or auto-fill a separate pincode field alongside the address.
  onSelect?: (value: string, coords?: { lat: number; lng: number }, postcode?: string) => void
}

export function AddressAutocomplete({ value, onChange, onSelect, className, ...props }: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const metaRef = useRef<Map<string, { coords: { lat: number; lng: number }; postcode?: string }>>(new Map())

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleChange(next: string) {
    onChange(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (next.trim().length < 3) {
      setSuggestions([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          q: next,
          limit: "5",
          lat: String(MUMBAI_LAT),
          lon: String(MUMBAI_LON),
          lang: "en",
        })
        const res = await fetch(`${PHOTON_URL}?${params.toString()}`)
        if (!res.ok) throw new Error("geocoding request failed")
        const data = await res.json()
        const features = (data.features || []) as any[]
        const withLabels = features
          .map((f, i) => ({
            id: String(f.properties?.osm_id ?? i),
            place_name: buildLabel(f.properties || {}),
            coords: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
            postcode: f.properties?.postcode as string | undefined,
          }))
          .filter(f => f.place_name)
        metaRef.current = new Map(withLabels.map(f => [f.id, { coords: f.coords, postcode: f.postcode }]))
        setSuggestions(withLabels.map(f => ({ id: f.id, place_name: f.place_name })))
        setOpen(withLabels.length > 0)
      } catch {
        // Public instance with no uptime guarantee — degrade to plain typing, no third fallback API.
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }

  function handlePick(s: Suggestion) {
    onChange(s.place_name)
    const meta = metaRef.current.get(s.id)
    onSelect?.(s.place_name, meta?.coords, meta?.postcode)
    setOpen(false)
    setSuggestions([])
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        autoComplete="off"
        className={className}
        {...props}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] max-h-64 overflow-y-auto">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(s)}
                className="w-full flex items-start gap-2 text-left px-3 py-2 text-sm font-medium hover:bg-accent-pink/15 border-b border-foreground/10 last:border-b-0"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-foreground-muted" />
                <span>{s.place_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-widest text-foreground-muted">...</div>
      )}
    </div>
  )
}
