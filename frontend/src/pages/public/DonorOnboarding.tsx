import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { MapPin } from "lucide-react"

export function DonorOnboarding() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
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

  function handleShareLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location isn't available in this browser.")
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocating(false)
      },
      (err) => {
        setLocationError(err.code === err.PERMISSION_DENIED ? "Location permission denied — you can still type your address below." : "Couldn't get your location.")
        setLocating(false)
      }
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.donor.post("/api/donor/profile", {
        name,
        phone,
        address,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
      })
      navigate(redirect || "/account")
    } catch (err: any) {
      setError(err?.message || "Failed to save your details.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">A few details</h1>
        <p className="text-foreground-muted mt-3">Just once — helps us reach you about pickups and updates.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border-2 border-foreground p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Full name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required className="rounded-none border-2 border-foreground" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Mobile number</label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className="rounded-none border-2 border-foreground" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-widest">Address</label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Bandra West, Mumbai" required className="rounded-none border-2 border-foreground" />
        </div>

        <button
          type="button"
          onClick={handleShareLocation}
          disabled={locating}
          className="flex items-center justify-center gap-2 h-11 border-2 border-foreground text-xs font-black uppercase tracking-widest bg-surface-muted hover:bg-black/5 transition-colors"
        >
          <MapPin size={14} />
          {locating ? "Getting location..." : coords ? "Location shared" : "Share my location"}
        </button>
        {locationError && <p className="text-xs font-bold text-accent-red">{locationError}</p>}

        {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

        <Button type="submit" disabled={submitting} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
          {submitting ? "Saving..." : "Continue"}
        </Button>
      </form>
    </div>
  )
}
