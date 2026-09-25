import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import {
  getDonorToken,
  isEmailLoginSession,
  safeDonorRedirect,
  setDonorPrefs,
  setDonorToken,
} from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete, reverseGeocode } from "@/components/ui/AddressAutocomplete"
import { PrivacyBuildingNotice, privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"
import { MapPin } from "lucide-react"

function digits10(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

/**
 * After login OTP is done — onboarding only collects profile details.
 * Email/Google sessions: ask for mobile (no second OTP).
 * Phone sessions: mobile already on the session — skip that field.
 */
export function DonorOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = safeDonorRedirect(searchParams.get("redirect"), "/give")
  const needsPhone = isEmailLoginSession()

  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [buildingName, setBuildingName] = useState("")
  const [addressLine, setAddressLine] = useState("")
  const [area, setArea] = useState("")
  const [city, setCity] = useState("Mumbai")
  const [pincode, setPincode] = useState("")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [phone, setPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getDonorToken()) {
      navigate(`/account/login?redirect=${encodeURIComponent(redirect)}`)
    }
  }, [navigate, redirect])

  function handleShareLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location isn't available in this browser.")
      return
    }
    if (
      !window.isSecureContext &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      setLocationError("Location needs HTTPS (or localhost). You can still type your area below.")
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
          const parts = [result.line1, result.line2].map((p) => p.trim()).filter(Boolean)
          const addressText = (parts.length ? parts.join(", ") : result.label).trim()
          setAddressLine(addressText)
          if (result.line2) setArea(result.line2)
          else if (!area) setArea(addressText)
          if ((result as { postcode?: string }).postcode) {
            setPincode(String((result as { postcode?: string }).postcode).replace(/\D/g, "").slice(0, 6))
          }
        } else {
          setLocationError("Got your location, but couldn't resolve an address — type building + area below.")
        }
        setLocating(false)
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? "Allow location access in your browser, then tap again — or type your area below."
            : err.code === err.TIMEOUT
              ? "Location timed out — try again, or type your area below."
              : "Couldn't get your location — type your area below."
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
    if (name.trim().length < 1) {
      setError("Enter your name.")
      return
    }
    const cleanUsername = username.trim().replace(/^@/, "")
    if (cleanUsername.length < 2) {
      setError("Pick a username (at least 2 characters).")
      return
    }
    if (buildingName.trim().length < 2) {
      setError("Enter your building / house / apartment name.")
      return
    }
    if (addressLine.trim().length < 5) {
      setError("Enter the full address (street / landmark) so a courier can find the gate.")
      return
    }
    if (area.trim().length < 2) {
      setError("Enter your area / locality (e.g. Bandra West).")
      return
    }
    if (city.trim().length < 2) {
      setError("Enter your city.")
      return
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setError("Enter a valid 6-digit pincode.")
      return
    }
    // Prefer a short courier-friendly address (building + area + pin). Long Google
    // autofill strings used to blow past Drop's pickup limit and block submit.
    const shortForm = [buildingName, area, `${city} ${pincode}`]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ")
    const fullForm = [buildingName, addressLine, area, `${city} ${pincode}`]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(", ")
    const composed = fullForm.length <= 500 ? fullForm : shortForm
    if (composed.length > 500) {
      setError(
        `Address is too long (${composed.length}/500 characters). Shorten building or area — pincode is enough for matching.`,
      )
      return
    }
    if (privacyAddressWarning(composed) || privacyAddressWarning(buildingName) || privacyAddressWarning(addressLine)) {
      setError(
        privacyAddressWarning(composed) ||
          privacyAddressWarning(buildingName) ||
          privacyAddressWarning(addressLine),
      )
      return
    }
    if (needsPhone && !/^[6-9]\d{9}$/.test(digits10(phone))) {
      setError("Enter a valid 10-digit mobile starting with 6–9.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const emailLogin = isEmailLoginSession()
      const payload: Record<string, unknown> = {
        name: name.trim(),
        username: cleanUsername,
        address: composed,
        addressLabel: buildingName.trim(),
        pincode: pincode.trim(),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      }
      if (needsPhone) {
        payload.phone = digits10(phone)
      }
      const result = await api.donor.post<{
        profile?: { username?: string | null }
        token?: string
      }>("/api/donor/profile", payload)
      if (result.token) {
        setDonorToken(result.token)
      }
      setDonorPrefs({
        username: result.profile?.username || cleanUsername,
        gender: null,
      })
      track(AnalyticsEvent.onboardingCompleted, { light: true, email_login: emailLogin })
      identifyDonor(`donor:${result.profile?.username || cleanUsername}`, {})
      navigate(redirect)
    } catch (err: any) {
      setError(err?.message || "Failed to save your details.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-16 sm:py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight text-balance">Almost there</h1>
        <p className="text-foreground-muted mt-3">
          {needsPhone
            ? "Name, username, mobile, and address — no second OTP, you're already signed in."
            : "Name, username, and address (building + area)."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border-2 border-foreground p-6 sm:p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Name *</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="rounded-none border-2 border-foreground" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Username *</label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").slice(0, 32))}
            maxLength={32}
            required
            placeholder="e.g. your.name"
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">Letters, numbers, . and _ only.</p>
        </div>

        {needsPhone && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-widest">Mobile *</label>
            <Input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={phone}
              onChange={(e) => setPhone(digits10(e.target.value).slice(0, 10))}
              required
              placeholder="10-digit mobile"
              className="rounded-none border-2 border-foreground"
            />
            <p className="text-xs text-foreground-muted">For claims and delivery updates. No OTP — login already verified you.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold uppercase tracking-widest">Pickup / delivery address *</label>
          <PrivacyBuildingNotice
            extraNote="Couriers need your building name and area to find the gate — not your flat number."
          />
          <Button
            type="button"
            disabled={locating}
            onClick={handleShareLocation}
            className="font-black uppercase tracking-widest border-2 border-foreground rounded-none text-xs flex items-center justify-center gap-1.5"
          >
            <MapPin size={14} />
            {locating ? "Getting location..." : coords ? "Refresh location" : "Use my location"}
          </Button>
          {locationError && <p className="text-xs font-bold text-accent-red">{locationError}</p>}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest">Building / house / apartment name *</label>
            <Input
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
              placeholder="e.g. Meadows Apartments / Villa name"
              required
              className="rounded-none border-2 border-foreground"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest">Full address *</label>
            <AddressAutocomplete
              value={addressLine}
              onChange={setAddressLine}
              onSelect={(val, nextCoords, postcode) => {
                setAddressLine(val)
                if (nextCoords) setCoords(nextCoords)
                if (postcode) setPincode(postcode.replace(/\D/g, "").slice(0, 6))
              }}
              placeholder="Street / road / landmark near the building"
              required
              className="rounded-none border-2 border-foreground"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">Area / locality *</label>
              <Input
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="e.g. Bandra West"
                required
                className="rounded-none border-2 border-foreground"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">City *</label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                className="rounded-none border-2 border-foreground"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 max-w-xs">
            <label className="text-xs font-bold uppercase tracking-widest">Pincode *</label>
            <Input
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              required
              className="rounded-none border-2 border-foreground"
            />
          </div>
          <p className="text-xs text-foreground-muted">
            We use this so Reloved can book pickup/drop accurately. Flat and wing numbers stay off the form.
          </p>
        </div>

        {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

        <Button type="submit" variant="cta" disabled={submitting} className="font-black uppercase tracking-widest">
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
