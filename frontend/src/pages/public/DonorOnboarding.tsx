import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import {
  getDonorToken,
  isEmailLoginSession,
  setDonorPrefs,
  setDonorToken,
} from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"

/**
 * Light registration after email (or phone) OTP:
 * Name, Username, Area — nothing else.
 */
export function DonorOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [area, setArea] = useState("")
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!getDonorToken()) {
      navigate(`/account/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
    }
  }, [navigate, redirect])

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
    if (area.trim().length < 2) {
      setError("Enter your area (neighbourhood only — no flat or wing).")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const emailLogin = isEmailLoginSession()
      const result = await api.donor.post<{
        profile?: { username?: string | null; gender?: string | null }
        token?: string
      }>("/api/donor/profile", {
        name: name.trim(),
        username: cleanUsername,
        address: area.trim(),
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      if (result.token) {
        setDonorToken(result.token)
      }
      setDonorPrefs({
        username: result.profile?.username || cleanUsername,
        gender: null,
      })
      track(AnalyticsEvent.onboardingCompleted, { light: true, email_login: emailLogin })
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
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight text-balance">Almost there</h1>
        <p className="text-foreground-muted mt-3">Just your name, a username, and your area.</p>
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

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Area *</label>
          <AddressAutocomplete
            value={area}
            onChange={setArea}
            onSelect={(val, nextCoords) => {
              setArea(val)
              if (nextCoords) setCoords(nextCoords)
            }}
            placeholder="Neighbourhood / area — no flat or wing"
            required
            className="rounded-none border-2 border-foreground"
          />
          {privacyAddressWarning(area) && (
            <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(area)}</p>
          )}
          <p className="text-xs text-foreground-muted">e.g. Bandra West, Juhu — not your flat number.</p>
        </div>

        {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

        <Button type="submit" variant="cta" disabled={submitting} className="font-black uppercase tracking-widest">
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
