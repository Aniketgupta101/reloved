import { useEffect, useRef, useState } from "react"
import { Input, type InputProps } from "@/components/ui/Input"
import { MapPin } from "lucide-react"

/**
 * Address search: MapTiler Geocoding when VITE_MAPTILER_API_KEY is set (accurate,
 * India-biased). Falls back to Photon (OSM) if the key is missing or the request fails.
 * Reverse geocode: MapTiler → Nominatim → Photon.
 */
const PHOTON_URL = "https://photon.komoot.io/api/"
const MAPTILER_GEOCODE = "https://api.maptiler.com/geocoding"
const MUMBAI_LAT = 19.076
const MUMBAI_LON = 72.8777
/** Rough India bbox [west, south, east, north] — keeps results in-country. */
const INDIA_BBOX = "68.1,6.5,97.4,35.7"

function maptilerKey(): string {
  return String(import.meta.env.VITE_MAPTILER_API_KEY || "").trim()
}

function uniqueParts(parts: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const trimmed = part?.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function buildPhotonLabel(p: Record<string, string | undefined>) {
  const streetPart = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
  return uniqueParts([p.name, streetPart, p.district || p.locality, p.city, p.state]).join(", ")
}

export type ReverseGeocodeResult = {
  line1: string
  line2: string
  label: string
  postcode?: string
}

function toResult(line1: string, line2: string, postcode?: string): ReverseGeocodeResult | null {
  const a = line1.trim()
  const b = line2.trim()
  if (!a && !b) return null
  return {
    line1: a || b,
    line2: a ? b : "",
    label: uniqueParts([a, b]).join(", "),
    postcode: postcode?.trim() || undefined,
  }
}

function extractPostcodeFromMaptiler(feature: any): string | undefined {
  const fromProps = feature?.properties?.postcode || feature?.properties?.postalcode
  if (fromProps) return String(fromProps).replace(/\s+/g, "")
  const ctx = Array.isArray(feature?.context) ? feature.context : []
  for (const c of ctx) {
    if (String(c?.id || "").startsWith("postcode") || String(c?.kind || "") === "postcode") {
      const text = String(c.text || "").replace(/\s+/g, "")
      if (text) return text
    }
  }
  // e.g. "65 Gurunanak Marg, 400 050 Mumbai..."
  const m = String(feature?.place_name || "").match(/\b(\d{3}\s?\d{3})\b/)
  return m ? m[1].replace(/\s+/g, "") : undefined
}

function splitMaptilerPlace(feature: any): ReverseGeocodeResult | null {
  const placeName = String(feature?.place_name || feature?.place_name_en || "").trim()
  const text = String(feature?.text || feature?.text_en || "").trim()
  if (!placeName && !text) return null
  const postcode = extractPostcodeFromMaptiler(feature)
  // Prefer street/POI as line1; remainder as area line.
  const line1 = text || placeName.split(",")[0]?.trim() || ""
  let line2 = ""
  if (placeName && text && placeName.toLowerCase().startsWith(text.toLowerCase())) {
    line2 = placeName.slice(text.length).replace(/^,\s*/, "").trim()
  } else if (placeName && placeName !== line1) {
    line2 = placeName
      .split(",")
      .slice(1)
      .map((s: string) => s.trim())
      .filter(Boolean)
      .join(", ")
  }
  // Drop trailing country for privacy/brevity
  line2 = line2.replace(/,?\s*India\s*$/i, "").trim()
  return toResult(line1, line2, postcode)
}

async function reverseGeocodeMaptiler(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  const key = maptilerKey()
  if (!key) return null
  try {
    const params = new URLSearchParams({ key, language: "en" })
    const res = await fetch(`${MAPTILER_GEOCODE}/${lng},${lat}.json?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    const features = (data.features || []) as any[]
    // Prefer street / address / poi over coarse admin areas
    const preferred =
      features.find((f) =>
        (f.place_type || []).some((t: string) =>
          ["address", "street", "poi", "place"].includes(String(t)),
        ),
      ) || features[0]
    return preferred ? splitMaptilerPlace(preferred) : null
  } catch {
    return null
  }
}

/** Nominatim reverse - better street-level components than Photon POI snap. One-shot on button click is policy-OK. */
async function reverseGeocodeNominatim(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: "json",
      addressdetails: "1",
      zoom: "18",
      "accept-language": "en",
    })
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, {
      headers: { Accept: "application/json" },
    })
    if (!res.ok) return null
    const data = await res.json()
    const a = (data.address || {}) as Record<string, string | undefined>
    const street = uniqueParts([a.house_number, a.road || a.pedestrian || a.footway || a.path]).join(" ")
    const landmark = a.building || a.amenity || a.shop || a.office || a.tourism
    const area = a.neighbourhood || a.suburb || a.quarter || a.residential
    const line1 = street || landmark || area || a.hamlet || ""
    const line2 = uniqueParts([
      street && landmark ? landmark : undefined,
      street || landmark ? area : undefined,
      a.city_district || a.county,
      a.city || a.town || a.village || a.municipality,
      a.state,
    ]).join(", ")
    return toResult(line1, line2, a.postcode)
  } catch {
    return null
  }
}

async function reverseGeocodePhoton(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "en" })
    const res = await fetch(`https://photon.komoot.io/reverse?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    const p = ((data.features || [])[0]?.properties || {}) as Record<string, string | undefined>
    const street = p.housenumber && p.street ? `${p.housenumber} ${p.street}` : p.street
    const line1 = street || p.name || p.district || p.locality || ""
    const line2 = uniqueParts([
      street && p.name && p.name !== street ? p.name : undefined,
      p.district || p.locality,
      p.city,
      p.state,
    ])
      .filter((part) => part.toLowerCase() !== line1.toLowerCase())
      .join(", ")
    return toResult(line1, line2, p.postcode)
  } catch {
    return null
  }
}

/** Reverse-geocode lat/lng into address line 1 + 2 (+ postcode) for "use my location". */
export async function reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
  return (
    (await reverseGeocodeMaptiler(lat, lng)) ??
    (await reverseGeocodeNominatim(lat, lng)) ??
    (await reverseGeocodePhoton(lat, lng))
  )
}

type SearchHit = {
  id: string
  place_name: string
  coords: { lat: number; lng: number }
  postcode?: string
}

async function searchMaptiler(query: string): Promise<SearchHit[]> {
  const key = maptilerKey()
  if (!key) return []
  const params = new URLSearchParams({
    key,
    limit: "8",
    language: "en",
    country: "in",
    proximity: `${MUMBAI_LON},${MUMBAI_LAT}`,
    bbox: "72.75,18.85,73.05,19.30", // Greater Mumbai — cuts global clutter
    autocomplete: "true",
    types: "poi,place,address,neighborhood,locality",
  })
  const res = await fetch(`${MAPTILER_GEOCODE}/${encodeURIComponent(query)}.json?${params.toString()}`)
  if (!res.ok) throw new Error(`maptiler ${res.status}`)
  const data = await res.json()
  const features = (data.features || []) as any[]
  return features
    .map((f, i): SearchHit | null => {
      const place_name = String(f.place_name || f.place_name_en || f.text || "")
        .replace(/,?\s*India\s*$/i, "")
        .trim()
      const center = Array.isArray(f.center) ? f.center : f.geometry?.coordinates
      const lng = Number(center?.[0])
      const lat = Number(center?.[1])
      if (!place_name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
      // Drop far-away / non-Mumbai noise when proximity still returns extras.
      const inMumbaiBelt = lat >= 18.85 && lat <= 19.35 && lng >= 72.75 && lng <= 73.15
      if (!inMumbaiBelt && !/mumbai|bandra|andheri|juhu|thane|navi/i.test(place_name)) return null
      return {
        id: String(f.id ?? `mt-${i}`),
        place_name,
        coords: { lat, lng },
        postcode: extractPostcodeFromMaptiler(f),
      }
    })
    .filter((x): x is SearchHit => x != null)
    .slice(0, 6)
}

async function searchPhoton(query: string): Promise<SearchHit[]> {
  const params = new URLSearchParams({
    q: query,
    limit: "6",
    lat: String(MUMBAI_LAT),
    lon: String(MUMBAI_LON),
    lang: "en",
  })
  const res = await fetch(`${PHOTON_URL}?${params.toString()}`)
  if (!res.ok) throw new Error("photon failed")
  const data = await res.json()
  const features = (data.features || []) as any[]
  return features
    .map((f, i): SearchHit | null => {
      const place_name = buildPhotonLabel(f.properties || {})
      const coords = {
        lat: Number(f.geometry?.coordinates?.[1]),
        lng: Number(f.geometry?.coordinates?.[0]),
      }
      if (!place_name || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return null
      return {
        id: String(f.properties?.osm_id ?? `ph-${i}`),
        place_name,
        coords,
        postcode: f.properties?.postcode as string | undefined,
      }
    })
    .filter((x): x is SearchHit => x != null)
}

interface Suggestion {
  id: string
  place_name: string
}

interface AddressAutocompleteProps extends Omit<InputProps, "onChange" | "onSelect"> {
  value: string
  onChange: (value: string) => void
  // Fires only when a suggestion is picked (not on free typing) - lets
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
  const reqIdRef = useRef(0)

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

    if (next.trim().length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current
      setLoading(true)
      try {
        let hits: SearchHit[] = []
        try {
          hits = await searchMaptiler(next.trim())
        } catch {
          hits = []
        }
        if (hits.length === 0) {
          hits = await searchPhoton(next.trim())
        }
        // Prefer hits whose label contains the typed query (helps “Kohli Villa”).
        const q = next.trim().toLowerCase()
        hits = [...hits].sort((a, b) => {
          const aHit = a.place_name.toLowerCase().includes(q) ? 0 : 1
          const bHit = b.place_name.toLowerCase().includes(q) ? 0 : 1
          return aHit - bHit
        })
        if (reqId !== reqIdRef.current) return
        metaRef.current = new Map(hits.map((f) => [f.id, { coords: f.coords, postcode: f.postcode }]))
        setSuggestions(hits.map((f) => ({ id: f.id, place_name: f.place_name })))
        setOpen(hits.length > 0)
      } catch {
        if (reqId !== reqIdRef.current) return
        setSuggestions([])
        setOpen(false)
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    }, 250)
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
