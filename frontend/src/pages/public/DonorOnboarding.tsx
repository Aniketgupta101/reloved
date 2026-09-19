import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import {
  getDonorLoginTarget,
  getDonorSessionUid,
  getDonorToken,
  isEmailLoginSession,
  setDonorPrefs,
  setDonorToken,
} from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete, reverseGeocode } from "@/components/ui/AddressAutocomplete"
import { PrivacyBuildingNotice, privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"
import { MapPin, Home, Briefcase, MoreHorizontal } from "lucide-react"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"

type AddressLabel = "home" | "office" | "other"

const ADDRESS_LABELS: { value: AddressLabel; text: string; icon: typeof Home }[] = [
  { value: "home", text: "Home", icon: Home },
  { value: "office", text: "Office", icon: Briefcase },
  { value: "other", text: "Other", icon: MoreHorizontal },
]

function digits10(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function DonorOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const emailLogin = useMemo(() => isEmailLoginSession(), [])
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [phoneLocked, setPhoneLocked] = useState(false)
  const [emailLocked, setEmailLocked] = useState(false)
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
      navigate(`/account/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
      return
    }
    const uid = getDonorSessionUid() || ""
    const loginTarget = getDonorLoginTarget() || ""
    if (emailLogin) {
      const fromUid = uid.includes("@") ? uid.trim().toLowerCase() : ""
      const fromLogin = loginTarget.includes("@") ? loginTarget.trim().toLowerCase() : ""
      const lockedEmail = fromUid || fromLogin
      if (lockedEmail) {
        setEmail(lockedEmail)
        setEmailLocked(true)
      }
    } else {
      const fromUid = digits10(uid)
      const fromLogin = digits10(loginTarget)
      const lockedPhone = /^[6-9]\d{9}$/.test(fromUid) ? fromUid : /^[6-9]\d{9}$/.test(fromLogin) ? fromLogin : ""
      if (lockedPhone) {
        setPhone(lockedPhone)
        setPhoneLocked(true)
      }
    }
  }, [navigate, emailLogin, redirect])

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
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError("Enter a valid 10-digit Indian mobile number starting with 6-9.")
      return
    }
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail.includes("@")) {
      setError("Enter a valid email address.")
      return
    }
    if (!addressLabel) {
      setError("Tell us whether this address is your home, office, or other.")
      return
    }
    if (addressLine1.trim().length < 2) {
      setError("Enter a building or landmark (no flat or wing).")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const cleanUsername = username.trim().replace(/^@/, "")
      const result = await api.donor.post<{
        profile?: { username?: string | null; gender?: string | null }
        token?: string
        mergedIntoExisting?: boolean
        message?: string
      }>("/api/donor/profile", {
        name,
        username: cleanUsername,
        phone,
        email: cleanEmail,
        address: combinedAddress(),
        addressLabel,
        pincode,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      if (result.token) {
        setDonorToken(result.token)
      }
      setDonorPrefs({
        username: result.profile?.username || cleanUsername,
        gender: result.profile?.gender ?? null,
      })
      track(AnalyticsEvent.onboardingCompleted, { address_label: addressLabel, email_login: emailLogin })
      identifyDonor(`donor:${result.profile?.username || cleanUsername}`, {})
      navigate(redirect || "/drop")
    } catch (err: any) {
      setError(err?.message || "Failed to save your details.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 py-16 sm:py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight text-balance">A few details</h1>
        <p className="text-foreground-muted mt-3">Just once ΓÇö so we can reach you about pickups and drops.</p>
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
            placeholder="e.g. your.name"
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">Letters, numbers, . and _ only.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Mobile number *</label>
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            required
            readOnly={phoneLocked}
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">
            {phoneLocked ? "Verified from your login." : "10 digits, starting with 6-9."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Email *</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            readOnly={emailLocked}
            className="rounded-none border-2 border-foreground"
          />
          <p className="text-xs text-foreground-muted">
            {emailLocked ? "Verified from your login." : "We'll use this for pickup and drop updates."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Address type *</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ADDRESS_LABELS.map(({ value, text, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setAddressLabel(value)}
                className={`flex flex-col items-center justify-center gap-1 min-h-16 py-2 border-2 border-foreground text-[10px] sm:text-xs font-black uppercase tracking-widest transition-colors ${
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
        <p className="text-xs text-foreground-muted -mt-2">Allow location when asked - we fill building / landmark from your GPS.</p>

        <PrivacyBuildingNotice />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Building / landmark *</label>
          <AddressAutocomplete
            value={addressLine1}
            onChange={setAddressLine1}
            onSelect={(val, nextCoords, postcode) => {
              setAddressLine1(val)
              if (nextCoords) setCoords(nextCoords)
              if (postcode) setPincode(postcode)
            }}
            placeholder="Search building or landmark ΓÇö no flat or wing"
            required
            className="rounded-none border-2 border-foreground"
          />
          {privacyAddressWarning(addressLine1) && (
            <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(addressLine1)}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Area (optional)</label>
          <Input
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            maxLength={160}
            placeholder="Neighbourhood only ΓÇö not flat or wing"
            className="rounded-none border-2 border-foreground"
          />
          {privacyAddressWarning(addressLine2) && (
            <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(addressLine2)}</p>
          )}
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

        <Button type="submit" variant="cta" disabled={submitting} className="font-black uppercase tracking-widest">
          {submitting ? "Saving..." : "Save and continue"}
        </Button>
      </form>
    </div>
  )
}
