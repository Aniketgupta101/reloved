import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import { getDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete, reverseGeocode } from "@/components/ui/AddressAutocomplete"
import { MapPin, Home, Briefcase, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"

type AddressLabel = "home" | "office" | "other"
type GenderPref = "men" | "women" | "unisex" | "girls" | "boys"

const ADDRESS_LABELS: { value: AddressLabel; text: string; icon: typeof Home }[] = [
  { value: "home", text: "Home", icon: Home },
  { value: "office", text: "Office", icon: Briefcase },
  { value: "other", text: "Other", icon: MoreHorizontal },
]

const GENDER_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "girls", label: "Girls" },
  { value: "boys", label: "Boys" },
  { value: "unisex", label: "Unisex" },
]

export function DonorOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [gender, setGender] = useState<GenderPref | null>(null)
  const [phone, setPhone] = useState("")
  const [addressLine1, setAddressLine1] = useState("")
  const [addressLine2, setAddressLine2] = useState("")
  const [pincode, setPincode] = useState("")
  const [addressLabel, setAddressLabel] = useState<AddressLabel | null>(null)
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getDonorToken()) {
      navigate("/account/login")
    }
  }, [navigate])

  function combinedAddress() {
    return [addressLine1.trim(), addressLine2.trim()].filter(Boolean).join(", ")
  }

  function handleShareLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location isn't available in this browser.")
      return
    }
    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      setLocationError("Location needs HTTPS (or localhost). You can still type your address below.")
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setCoords({ lat, lng })
        const result = await reverseGeocode(lat, lng)
        if (result) {
          setAddressLine1(result.line1)
          setAddressLine2(result.line2)
          if (result.postcode) setPincode(result.postcode)
        } else {
          setLocationError("Got your location, but couldn't resolve it to an address - type it below.")
        }
        setLocating(false)
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Allow location access in your browser, then tap again - or type your address below."
            : err.code === err.TIMEOUT
              ? "Location timed out - try again, or type your address below."
              : "Couldn't get your location - type your address below."
        setLocationError(msg)
        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      },
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gender) {
      setError("Pick who these clothes are for - we'll recommend matching items on the Wall.")
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Enter a valid 10-digit Indian mobile number starting with 6-9.")
      return
    }
    if (!addressLabel) {
      setError("Tell us whether this address is your home, office, or other.")
      return
    }
    const address = combinedAddress()
    if (addressLine1.trim().length < 2) {
      setError("Enter address line 1 (area / street).")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const cleanUsername = username.trim().replace(/^@/, "")
      await api.donor.post("/api/donor/profile", {
        name,
        username: cleanUsername,
        gender,
        phone,
        address,
        addressLabel,
        pincode,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      setDonorPrefs({ username: cleanUsername, gender })
      track(AnalyticsEvent.onboardingCompleted, { gender, address_label: addressLabel })
      identifyDonor(`donor:${cleanUsername}`, { gender })
      navigate(redirect || "/drop")
    } catch (err: any) {
      setError(err?.message || "Failed to save your details.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">A few details</h1>
        <p className="text-foreground-muted mt-3">Just once - helps us recommend items and reach you about pickups.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border-2 border-foreground p-6 sm:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Full name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="rounded-none border-2 border-foreground" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Username *</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").slice(0, 32))}
            maxLength={32}
            required
            placeholder="e.g. sheetal.gives"
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">Letters, numbers, . and _ only.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Clothes for *</label>
          <div className="grid grid-cols-4 gap-2">
            {GENDER_OPTIONS.filter((o) => o.value !== "unisex").map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                className={cn(
                  "h-12 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors",
                  gender === value ? "bg-accent-pink" : "bg-white hover:bg-black/5",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setGender("unisex")}
              className={cn(
                "h-12 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors",
                gender === "unisex" ? "bg-accent-pink" : "bg-white hover:bg-black/5",
              )}
            >
              Unisex
            </button>
          </div>
          <p className="text-xs text-foreground-muted">We&apos;ll highlight matching pieces on the Wall of Kindness.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Mobile number *</label>
          <Input type="tel" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} required className="rounded-none border-2 border-foreground" />
          <p className="text-xs text-foreground-muted">10 digits, starting with 6-9.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Address type *</label>
          <div className="grid grid-cols-3 gap-2">
            {ADDRESS_LABELS.map(({ value, text, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAddressLabel(value)}
                className={`flex flex-col items-center justify-center gap-1 h-16 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-colors ${
                  addressLabel === value ? "bg-accent-pink" : "bg-white hover:bg-black/5"
                }`}
              >
                <Icon size={16} />
                {text}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleShareLocation}
          disabled={locating}
          className="flex items-center justify-center gap-2 h-11 border-2 border-foreground text-xs font-black uppercase tracking-widest bg-surface-muted hover:bg-black/5 transition-colors"
        >
          <MapPin size={14} />
          {locating ? "Getting location..." : coords ? "Location used - tap to refresh" : "Use my location"}
        </button>
        {locationError && <p className="text-xs font-bold text-accent-red">{locationError}</p>}
        <p className="text-xs text-foreground-muted -mt-2">Allow location when asked - we fill both address lines from your GPS.</p>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Address line 1 *</label>
          <AddressAutocomplete
            value={addressLine1}
            onChange={setAddressLine1}
            onSelect={(val, nextCoords, postcode) => {
              setAddressLine1(val)
              if (nextCoords) setCoords(nextCoords)
              if (postcode) setPincode(postcode)
            }}
            placeholder="Street / area (e.g. Link Road, Bandra West)"
            required
            className="rounded-none border-2 border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Address line 2</label>
          <Input
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            maxLength={160}
            placeholder="Flat / floor / landmark (optional)"
            className="rounded-none border-2 border-foreground"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Pincode</label>
          <Input
            value={pincode}
            onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            maxLength={6}
            inputMode="numeric"
            placeholder="e.g. 400050"
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">Auto-filled from location or address search - edit if it&apos;s wrong.</p>
        </div>

        {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

        <Button type="submit" disabled={submitting} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
          {submitting ? "Saving..." : "See my recommendations"}
        </Button>
      </form>
    </div>
  )
}
