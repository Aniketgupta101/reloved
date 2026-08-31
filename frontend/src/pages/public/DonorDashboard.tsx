import { useCallback, useEffect, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken, clearDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { msg91SendOtp, msg91VerifyOtp } from "@/lib/msg91Widget"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { SafeImage } from "@/components/ui/SafeImage"
import { cn } from "@/lib/utils"
import { AnalyticsEvent, identifyDonor, resetAnalyticsIdentity, track } from "@/lib/analytics"

interface Submission {
  id: string
  reference: string
  status: string
  submittedAt: string
  items: {
    id: string
    slug: string
    title: string
    category: string
    status: string
    publicVisibility: boolean
    images: { storagePath: string }[]
  }[]
}

interface ItemRequest {
  id: string
  status: string
  createdAt: string
  item: { id: string; slug: string; title: string; images: { storagePath: string }[] }
}

type GenderPref = "men" | "women" | "unisex" | "kids"

interface DonorProfile {
  id?: string
  name: string | null
  username: string | null
  gender: GenderPref | null
  phone: string | null
  email: string | null
  address: string | null
  addressLabel: string | null
  pincode: string | null
  onboardedAt: string | null
}

const GENDER_OPTIONS: { value: GenderPref; label: string }[] = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "unisex", label: "Unisex" },
]

export function DonorDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([])
  const [monthlyUsed, setMonthlyUsed] = useState(0)
  const [monthlyLimit, setMonthlyLimit] = useState(3)
  const [resetsAt, setResetsAt] = useState<string | null>(null)
  const [profile, setProfile] = useState<DonorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [gender, setGender] = useState<GenderPref | null>(null)
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [pincode, setPincode] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  const [phoneOtpStep, setPhoneOtpStep] = useState<"idle" | "sent" | "verified">("idle")
  const [phoneCode, setPhoneCode] = useState("")
  const [emailOtpStep, setEmailOtpStep] = useState<"idle" | "sent" | "verified">("idle")
  const [emailCode, setEmailCode] = useState("")
  const [otpBusy, setOtpBusy] = useState(false)

  const hydrateForm = useCallback((p: DonorProfile) => {
    setName(p.name || "")
    setUsername((p.username || "").replace(/^@/, ""))
    setGender(p.gender)
    setPhone((p.phone || "").replace(/\D/g, "").slice(0, 10))
    setEmail(p.email || "")
    setAddress(p.address || "")
    setPincode(p.pincode || "")
    setPhoneOtpStep("idle")
    setEmailOtpStep("idle")
    setPhoneCode("")
    setEmailCode("")
    setSaveError(null)
    setSaveOk(null)
  }, [])

  const load = useCallback(async () => {
    if (!getDonorToken()) {
      navigate("/account/login")
      return
    }
    setLoading(true)
    try {
      const { profile: p } = await api.donor.get<{ profile: DonorProfile | null }>("/api/donor/profile")
      if (!p?.onboardedAt) {
        navigate("/account/onboarding")
        return
      }
      setProfile(p)
      hydrateForm(p)
      const [subData, reqData] = await Promise.all([
        api.donor.get<{ submissions: Submission[] }>("/api/donor/submissions"),
        api.donor.get<{
          requests: ItemRequest[]
          monthlyUsed?: number
          monthlyLimit?: number
          resetsAt?: string
        }>("/api/donor/item-requests"),
      ])
      setSubmissions(subData.submissions)
      setItemRequests(reqData.requests)
      setMonthlyUsed(reqData.monthlyUsed ?? reqData.requests.length)
      setMonthlyLimit(reqData.monthlyLimit ?? 3)
      setResetsAt(reqData.resetsAt ?? null)
    } catch {
      clearDonorToken()
      navigate("/account/login")
    } finally {
      setLoading(false)
    }
  }, [navigate, hydrateForm])

  useEffect(() => {
    load()
  }, [load, location.key])

  useEffect(() => {
    const onFocus = () => {
      if (getDonorToken() && !editing) load()
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [load, editing])

  function handleSignOut() {
    track(AnalyticsEvent.logout, { role: "donor" })
    resetAnalyticsIdentity()
    clearDonorToken()
    navigate("/account/login")
  }

  const phoneChanged = phone !== (profile?.phone || "").replace(/\D/g, "")
  const emailChanged = email.trim().toLowerCase() !== (profile?.email || "").trim().toLowerCase()

  async function sendPhoneOtp() {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setSaveError("Enter a valid 10-digit mobile starting with 6-9 before sending OTP.")
      return
    }
    setOtpBusy(true)
    setSaveError(null)
    try {
      await msg91SendOtp(phone)
      setPhoneOtpStep("sent")
    } catch (err: any) {
      setSaveError(err?.message || "Couldn't send SMS code.")
    } finally {
      setOtpBusy(false)
    }
  }

  async function verifyPhoneOtp() {
    setOtpBusy(true)
    setSaveError(null)
    try {
      const accessToken = await msg91VerifyOtp(phoneCode)
      await api.post("/api/otp/verify-widget", { target: phone, accessToken })
      setPhoneOtpStep("verified")
    } catch (err: any) {
      setSaveError(err?.message || "Incorrect SMS code.")
    } finally {
      setOtpBusy(false)
    }
  }

  async function sendEmailOtp() {
    if (!email.includes("@")) {
      setSaveError("Enter a valid email before sending OTP.")
      return
    }
    setOtpBusy(true)
    setSaveError(null)
    try {
      await api.post("/api/otp/request", { channel: "email", target: email.trim().toLowerCase() })
      setEmailOtpStep("sent")
    } catch (err: any) {
      setSaveError(err?.message || "Couldn't send email code.")
    } finally {
      setOtpBusy(false)
    }
  }

  async function verifyEmailOtp() {
    setOtpBusy(true)
    setSaveError(null)
    try {
      await api.post("/api/otp/verify", {
        channel: "email",
        target: email.trim().toLowerCase(),
        code: emailCode,
      })
      setEmailOtpStep("verified")
    } catch (err: any) {
      setSaveError(err?.message || "Incorrect email code.")
    } finally {
      setOtpBusy(false)
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!gender) {
      setSaveError("Pick who these clothes are for.")
      return
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setSaveError("Enter a valid 10-digit mobile starting with 6-9.")
      return
    }
    if (phoneChanged && phoneOtpStep !== "verified") {
      setSaveError("Verify the new mobile number with OTP before saving.")
      return
    }
    if (emailChanged && email.trim() && emailOtpStep !== "verified") {
      setSaveError("Verify the new email with OTP before saving.")
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveOk(null)
    try {
      const { profile: updated } = await api.donor.patch<{ profile: DonorProfile }>("/api/donor/profile", {
        name,
        username: username.replace(/^@/, ""),
        gender,
        phone,
        email: email.trim().toLowerCase(),
        address,
        pincode,
      })
      setProfile(updated)
      hydrateForm(updated)
      setDonorPrefs({ username: updated.username, gender: updated.gender })
      setEditing(false)
      setSaveOk("Profile updated.")
    } catch (err: any) {
      setSaveError(err?.message || "Couldn't save profile.")
    } finally {
      setSaving(false)
    }
  }

  const totalItems = submissions.reduce((sum, s) => sum + s.items.length, 0)
  const relovedItems = submissions.reduce(
    (sum, s) => sum + s.items.filter((i) => i.status === "reloved" || i.status === "completed").length,
    0,
  )
  const pendingRequests = itemRequests.filter((r) => r.status === "pending").length
  const remainingClaims = Math.max(0, monthlyLimit - monthlyUsed)

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-16 flex flex-col gap-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tight">Your account</h1>
          <p className="text-foreground-muted mt-2">
            {profile?.username ? `@${profile.username} · ` : ""}
            Profile, drops, and requests in one place.
          </p>
        </div>
        <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline">
          Sign out
        </button>
      </div>

      <div className="bg-white border-2 border-foreground p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">Claim requests this month</p>
          <p className="text-lg font-display font-black mt-1">
            {loading ? "-" : `${monthlyUsed} of ${monthlyLimit} used`}
            {!loading && remainingClaims > 0 && (
              <span className="text-sm font-bold text-accent-green ml-2">· {remainingClaims} left</span>
            )}
            {!loading && remainingClaims <= 0 && (
              <span className="text-sm font-bold text-accent-red ml-2">· limit reached</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Array.from({ length: monthlyLimit }).map((_, i) => (
            <div
              key={i}
              className={`w-8 h-8 border-2 border-foreground flex items-center justify-center text-xs font-black ${
                i < monthlyUsed ? "bg-accent-pink" : "bg-white text-foreground-muted"
              }`}
            >
              {i < monthlyUsed ? "✓" : i + 1}
            </div>
          ))}
        </div>
        {resetsAt && (
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
            Resets {new Date(resetsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submissions</p>
          <p className="text-3xl font-display font-black mt-1">{loading ? "-" : submissions.length}</p>
        </div>
        <div className="bg-white border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Items given</p>
          <p className="text-3xl font-display font-black mt-1">{loading ? "-" : totalItems}</p>
        </div>
        <div className="bg-accent-pink/40 border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Requested</p>
          <p className="text-3xl font-display font-black mt-1">{loading ? "-" : itemRequests.length}</p>
          {!loading && pendingRequests > 0 && (
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-accent-blue">{pendingRequests} awaiting review</p>
          )}
        </div>
        <div className="bg-accent-green border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
          <p className="text-xs font-bold uppercase tracking-widest text-black/60">Reloved</p>
          <p className="text-3xl font-display font-black mt-1">{loading ? "-" : relovedItems}</p>
        </div>
      </div>

      {/* Profile */}
      <div className="bg-white border-2 border-foreground p-6 md:p-8 shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Your profile</h2>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                if (profile) hydrateForm(profile)
                setEditing(true)
                setSaveOk(null)
              }}
              className="text-xs font-black uppercase tracking-widest underline"
            >
              Edit profile
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (profile) hydrateForm(profile)
                setEditing(false)
              }}
              className="text-xs font-black uppercase tracking-widest underline text-foreground-muted"
            >
              Cancel
            </button>
          )}
        </div>

        {!editing && profile && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Name</p>
              <p className="font-bold mt-1">{profile.name || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Username</p>
              <p className="font-bold mt-1">{profile.username ? `@${profile.username}` : "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Mobile</p>
              <p className="font-bold mt-1">{profile.phone || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Email</p>
              <p className="font-bold mt-1">{profile.email || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Clothes for</p>
              <p className="font-bold mt-1 capitalize">{profile.gender || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Address</p>
              <p className="font-bold mt-1">{profile.address || "-"}</p>
            </div>
          </div>
        )}

        {editing && (
          <form onSubmit={saveProfile} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Full name *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="rounded-none border-2 border-foreground" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-widest">Username *</label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._]/g, "").slice(0, 32))}
                  maxLength={32}
                  required
                  className="rounded-none border-2 border-foreground"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">Clothes for *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setGender(value)}
                    className={cn(
                      "h-11 border-2 border-foreground text-xs font-black uppercase tracking-widest",
                      gender === value ? "bg-accent-pink" : "bg-white hover:bg-black/5",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">Mobile *</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    setPhoneOtpStep("idle")
                    setPhoneCode("")
                  }}
                  required
                  className="rounded-none border-2 border-foreground flex-1"
                />
                {phoneChanged && phoneOtpStep !== "verified" && (
                  <Button type="button" disabled={otpBusy} onClick={sendPhoneOtp} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none text-xs">
                    {otpBusy && phoneOtpStep === "idle" ? "Sending..." : phoneOtpStep === "sent" ? "Resend SMS OTP" : "Send SMS OTP"}
                  </Button>
                )}
                {phoneChanged && phoneOtpStep === "verified" && (
                  <span className="text-xs font-black uppercase tracking-widest text-accent-green self-center">Mobile verified</span>
                )}
              </div>
              {phoneChanged && phoneOtpStep === "sent" && (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    placeholder="6-digit SMS code"
                    className="rounded-none border-2 border-foreground"
                  />
                  <Button type="button" disabled={otpBusy || phoneCode.length !== 6} onClick={verifyPhoneOtp} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none text-xs">
                    Verify
                  </Button>
                </div>
              )}
              <p className="text-xs text-foreground-muted">Changing mobile requires SMS OTP verification.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">Email</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setEmailOtpStep("idle")
                    setEmailCode("")
                  }}
                  className="rounded-none border-2 border-foreground flex-1"
                />
                {emailChanged && email.trim() && emailOtpStep !== "verified" && (
                  <Button type="button" disabled={otpBusy} onClick={sendEmailOtp} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none text-xs">
                    {emailOtpStep === "sent" ? "Resend email OTP" : "Send email OTP"}
                  </Button>
                )}
                {emailChanged && email.trim() && emailOtpStep === "verified" && (
                  <span className="text-xs font-black uppercase tracking-widest text-accent-green self-center">Email verified</span>
                )}
              </div>
              {emailChanged && email.trim() && emailOtpStep === "sent" && (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    placeholder="6-digit email code"
                    className="rounded-none border-2 border-foreground"
                  />
                  <Button type="button" disabled={otpBusy || emailCode.length !== 6} onClick={verifyEmailOtp} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none text-xs">
                    Verify
                  </Button>
                </div>
              )}
              <p className="text-xs text-foreground-muted">Changing email requires email OTP verification.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-widest">Address</label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(val, _coords, postcode) => {
                  setAddress(val)
                  if (postcode) setPincode(postcode)
                }}
                placeholder="e.g. Bandra West, Mumbai"
                className="rounded-none border-2 border-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5 max-w-xs">
              <label className="text-xs font-bold uppercase tracking-widest">Pincode</label>
              <Input
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                inputMode="numeric"
                className="rounded-none border-2 border-foreground"
              />
            </div>

            {saveError && <p className="text-sm font-bold text-accent-red">{saveError}</p>}

            <Button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] bg-accent-pink text-foreground hover:bg-accent-pink"
            >
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        )}

        {saveOk && !editing && <p className="text-sm font-bold text-accent-green">{saveOk}</p>}
      </div>

      <div className="flex flex-wrap gap-4">
        <Link to="/give" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "donor_dashboard" })}>
          <Button className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
            Drop another item
          </Button>
        </Link>
        <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaClaimItem, { source: "donor_dashboard" })}>
          <Button className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-green text-foreground hover:bg-accent-green">
            Browse the Wall to take an item
          </Button>
        </Link>
      </div>

      {!loading && itemRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Items you've requested</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {itemRequests.map((r) => (
              <Link
                key={r.id}
                to={`/items/${r.item.slug}`}
                className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                <div className="aspect-square border-2 border-foreground bg-surface-muted overflow-hidden">
                  <SafeImage src={resolveImageUrl(r.item.images?.[0]?.storagePath)} alt={r.item.title} className="w-full h-full object-cover" />
                </div>
                <p className="text-xs font-bold leading-tight">{r.item.title}</p>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 ${
                    r.status === "approved"
                      ? "bg-accent-green/20 text-accent-green"
                      : r.status === "rejected"
                        ? "bg-accent-red/10 text-accent-red"
                        : "bg-accent-blue/10 text-accent-blue"
                  }`}
                >
                  {r.status === "pending" ? "Awaiting review (24-48h)" : r.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-display font-black uppercase tracking-tight">Your giving history</h2>
        {loading ? (
          <div className="h-40 bg-surface-muted border-2 border-foreground animate-pulse" />
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <h3 className="text-2xl font-display font-black uppercase">Nothing here yet.</h3>
            <p className="text-foreground-muted mt-2">Once you drop an item using this phone/email, it'll show up here.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {submissions.map((sub) => (
              <div key={sub.id} className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-mono font-bold bg-surface-muted px-2 py-1 border border-foreground/20">{sub.reference}</span>
                  <span className="text-xs font-black uppercase tracking-widest px-2 py-1 bg-accent-blue/10 text-accent-blue">
                    {sub.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {sub.submittedAt && !Number.isNaN(new Date(sub.submittedAt).getTime())
                      ? new Date(sub.submittedAt).toLocaleDateString()
                      : "Just now"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {sub.items.map((item) => {
                    const tile = (
                      <>
                        <div className="aspect-square border-2 border-foreground bg-surface-muted overflow-hidden">
                          <SafeImage src={resolveImageUrl(item.images?.[0]?.storagePath)} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                        <p className="text-xs font-bold leading-tight">{item.title}</p>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-blue/10 text-accent-blue">
                          {item.publicVisibility ? item.status.replace("_", " ") : "Awaiting review (24-48h)"}
                        </span>
                      </>
                    )
                    return item.publicVisibility ? (
                      <Link
                        key={item.id}
                        to={`/items/${item.slug}`}
                        className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
                      >
                        {tile}
                      </Link>
                    ) : (
                      <div key={item.id} className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2 opacity-80">
                        {tile}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
