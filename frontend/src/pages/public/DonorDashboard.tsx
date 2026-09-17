import { useCallback, useEffect, useState } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { Bell, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken, clearDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { msg91SendOtp, msg91VerifyOtp } from "@/lib/msg91Widget"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { SafeImage } from "@/components/ui/SafeImage"
import { cn } from "@/lib/utils"
import { AnalyticsEvent, identifyDonor, resetAnalyticsIdentity, track } from "@/lib/analytics"
import { useDonorNotifications } from "@/lib/useDonorNotifications"
import { claimStatusLabel } from "@/lib/claimStatusCopy"
import { computeKindnessStreak, formatTimeSaved } from "@/lib/accountMetrics"

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
  handoverStage?: string | null
  giverLogistics?: string | null
  submissionId?: string | null
  createdAt: string
  deliveryStatus?: string | null
  borzoOrderId?: number | null
  borzoOrderName?: string | null
  borzoStatus?: string | null
  borzoTrackingUrl?: string | null
  borzoCourier?: {
    name?: string
    phone?: string
  } | null
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

type DashTab = "notifications" | "giving" | "claiming" | "profile"

export function DonorDashboard() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (["notifications", "giving", "claiming", "profile"].includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")
    : "notifications") as DashTab
  const { notifications, unreadCount, markRead, markAllRead, refresh: refreshNotes } = useDonorNotifications()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([])
  const [incomingClaims, setIncomingClaims] = useState<ItemRequest[]>([])
  const [weeklyUsed, setWeeklyUsed] = useState(0)
  const [weeklyLimit, setWeeklyLimit] = useState(3)
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
  const [bookingBorzoId, setBookingBorzoId] = useState<string | null>(null)

  async function handleBookBorzoDirect(requestId: string, itemTitle: string) {
    if (
      !window.confirm(
        `Book Borzo delivery for "${itemTitle}"?\n\nA rider will be dispatched to collect the item from the giver's building main gate security and deliver directly to your gate.`
      )
    ) {
      return
    }
    setBookingBorzoId(requestId)
    try {
      const res = await api.donor.post<{ ok: boolean; order: any }>(
        `/api/donor/item-requests/${requestId}/borzo/book`
      )
      window.alert(
        `Borzo Order #${res.order?.orderName || res.order?.orderId} created! Rider will be dispatched.`
      )
      const data = await api.donor.get<{ requests: ItemRequest[] }>("/api/donor/item-requests")
      setItemRequests(data.requests || [])
    } catch (err: any) {
      window.alert(err?.message || "Failed to book Borzo order")
    } finally {
      setBookingBorzoId(null)
    }
  }

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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!getDonorToken()) {
      navigate("/account/login")
      return
    }
    if (!opts?.silent) setLoading(true)
    try {
      const { profile: p } = await api.donor.get<{ profile: DonorProfile | null }>("/api/donor/profile")
      if (!p?.onboardedAt) {
        navigate("/account/onboarding")
        return
      }
      setProfile(p)
      hydrateForm(p)
      const [subData, reqData, incoming] = await Promise.all([
        api.donor.get<{ submissions: Submission[] }>("/api/donor/submissions"),
        api.donor.get<{
          requests: ItemRequest[]
          weeklyUsed?: number
          weeklyLimit?: number
          monthlyUsed?: number
          monthlyLimit?: number
          resetsAt?: string
        }>("/api/donor/item-requests"),
        api.donor.get<{ claims: ItemRequest[] }>("/api/donor/incoming-claims").catch(() => ({ claims: [] })),
      ])
      setSubmissions(subData.submissions)
      setItemRequests(reqData.requests)
      setIncomingClaims(incoming.claims || [])
      setWeeklyUsed(reqData.weeklyUsed ?? reqData.monthlyUsed ?? reqData.requests.length)
      setWeeklyLimit(reqData.weeklyLimit ?? reqData.monthlyLimit ?? 3)
      setResetsAt(reqData.resetsAt ?? null)
      await refreshNotes()
    } catch {
      clearDonorToken()
      navigate("/account/login")
    } finally {
      if (!opts?.silent) setLoading(false)
    }
  }, [navigate, hydrateForm, refreshNotes])

  useEffect(() => {
    load()
  }, [load, location.key])

  useEffect(() => {
    const onFocus = () => {
      if (getDonorToken() && !editing) void load({ silent: true })
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

  const relovedItems = submissions.reduce(
    (sum, s) => sum + s.items.filter((i) => i.status === "reloved" || i.status === "completed").length,
    0,
  )
  const pendingRequests = itemRequests.filter((r) => r.status === "pending").length
  const remainingClaims = Math.max(0, weeklyLimit - weeklyUsed)
  const timeSaved = formatTimeSaved(relovedItems)
  const kindnessStreak = computeKindnessStreak([
    ...submissions.map((s) => s.submittedAt),
    ...itemRequests.map((r) => r.createdAt),
    ...incomingClaims.map((c) => c.createdAt),
  ])

  function setTab(next: DashTab) {
    setSearchParams({ tab: next }, { replace: true })
  }

  const tabs: { id: DashTab; label: string; badge?: number }[] = [
    { id: "notifications", label: "Notifications", badge: unreadCount },
    { id: "giving", label: "Giving", badge: incomingClaims.filter((c) => c.status === "pending").length },
    { id: "claiming", label: "Claiming", badge: pendingRequests },
    { id: "profile", label: "Profile" },
  ]

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-16 flex flex-col gap-10">
      <div className="flex items-start justify-between gap-4 flex-wrap rounded-none border-2 border-foreground bg-white p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        <div>
          <h1 className="text-4xl md:text-5xl font-display font-black uppercase tracking-tight text-foreground">Your account</h1>
          <p className="text-foreground-muted mt-2">
            {profile?.username ? `@${profile.username} · ` : ""}
            Profile, drops, claims, and notifications in one place.
          </p>
        </div>
        <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline">
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="tablist" aria-label="Account sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative h-12 px-2 text-[10px] sm:text-xs font-black uppercase tracking-widest border-2 border-foreground",
              tab === t.id
                ? "bg-accent-pink text-foreground shadow-none translate-x-[2px] translate-y-[2px]"
                : "bg-white text-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:bg-black/5",
            )}
          >
            {t.label}
            {!!t.badge && t.badge > 0 && (
              <span
                className={cn(
                  "ml-1 inline-flex min-w-5 h-5 px-1 items-center justify-center border-2 border-foreground text-[10px] font-black",
                  tab === t.id ? "bg-foreground text-background" : "bg-accent-pink",
                )}
              >
                {t.badge > 9 ? "9+" : t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {(tab === "claiming" || tab === "profile") && (
        <div className="bg-white text-foreground border-2 border-foreground p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-foreground-muted">Claim requests this week</p>
            <p className="text-lg font-display font-black mt-1">
              {loading ? "-" : `${weeklyUsed} of ${weeklyLimit} used`}
              {!loading && remainingClaims > 0 && (
                <span className="text-sm font-bold text-accent-green ml-2">· {remainingClaims} left</span>
              )}
              {!loading && remainingClaims <= 0 && (
                <span className="text-sm font-bold text-accent-red ml-2">· limit reached</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {Array.from({ length: weeklyLimit }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 border-2 border-foreground flex items-center justify-center text-xs font-black ${
                  i < weeklyUsed ? "bg-accent-pink text-foreground" : "bg-white text-foreground-muted"
                }`}
              >
                {i < weeklyUsed ? "✓" : i + 1}
              </div>
            ))}
          </div>
          {resetsAt && (
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
              Resets {new Date(resetsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
        </div>
      )}

      {(tab === "giving" || tab === "profile") && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white text-foreground border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submissions</p>
            <p className="text-3xl font-display font-black mt-1">{loading ? "-" : submissions.length}</p>
          </div>
          <div className="bg-white text-foreground border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Time saved</p>
            <p className="text-3xl font-display font-black mt-1">{loading ? "-" : timeSaved.label}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-foreground-muted">
              {loading ? "…" : timeSaved.detail}
            </p>
          </div>
          <div className="bg-white text-foreground border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Streak</p>
            <p className="text-3xl font-display font-black mt-1 flex items-center gap-1">
              <span aria-hidden="true">🔥</span>
              {loading ? "-" : kindnessStreak}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-foreground-muted">
              {loading ? "…" : kindnessStreak === 1 ? "day active" : "days active"}
            </p>
          </div>
          <div className="bg-white text-foreground border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Reloved</p>
            <p className="text-3xl font-display font-black mt-1">{loading ? "-" : relovedItems}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest mt-1 text-accent-pink">Completed handovers</p>
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-display font-black uppercase tracking-tight flex items-center gap-2">
              <Bell size={20} /> Notifications
            </h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="text-xs font-black uppercase tracking-widest underline"
              >
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <div className="h-32 bg-surface-muted border-2 border-foreground animate-pulse" />
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
              <p className="font-display font-black uppercase text-xl">No alerts yet</p>
              <p className="text-sm text-foreground-muted mt-2 max-w-md mx-auto">
                When someone claims your clothes, or a giver accepts your request, it shows up here — and we email you too. Tap a card to open it (no location share or delete actions).
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={async () => {
                    await markRead(n.id)
                    navigate(n.href || "/account")
                  }}
                  className={cn(
                    "text-left border-2 border-foreground p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all",
                    n.read ? "bg-white" : "bg-[#FFE5F0]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                      {n.role === "giver" ? "As giver" : "As claimer"}
                    </p>
                    {!n.read && (
                      <span className="text-[10px] font-black uppercase tracking-widest bg-accent-pink px-2 py-0.5 border border-foreground">
                        New
                      </span>
                    )}
                  </div>
                  <p className="font-display font-black uppercase mt-1 text-foreground">{n.title}</p>
                  <p className="text-sm font-medium mt-1 text-foreground">{n.body}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest mt-2 underline text-foreground">Open →</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "profile" && (
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
              className="w-full sm:w-auto font-black uppercase tracking-widest"
              variant="cta"
            >
              {saving ? "Saving..." : "Save profile"}
            </Button>
          </form>
        )}

        {saveOk && !editing && <p className="text-sm font-bold text-accent-green">{saveOk}</p>}
      </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Link to="/give" onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "donor_dashboard" })}>
          <Button variant="cta" className="font-black uppercase tracking-widest">
            Drop another item
          </Button>
        </Link>
        <Link to="/drop" onClick={() => track(AnalyticsEvent.ctaClaimItem, { source: "donor_dashboard" })}>
          <Button variant="cta" className="font-black uppercase tracking-widest">
            Browse the Wall to take an item
          </Button>
        </Link>
      </div>

      {tab === "giving" && !loading && incomingClaims.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Someone wants to Relove your item</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {incomingClaims.map((r) => (
              <div key={r.id} className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2">
                <p className="text-xs font-bold leading-tight">{r.item?.title}</p>
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/15">
                  {r.status === "pending"
                    ? "Accept or Decline"
                    : r.status === "rejected"
                      ? "Declined — claimer notified"
                      : r.handoverStage === "received"
                        ? "Reloved"
                        : "Matched"}
                </span>
                <Link
                  to={r.submissionId ? `/account/gifts/${r.submissionId}` : "/account"}
                  className="text-[10px] font-black uppercase tracking-widest underline"
                >
                  Open gift →
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "claiming" && !loading && itemRequests.length === 0 && (
        <div className="text-center py-12 bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          <p className="font-display font-black uppercase text-xl">No claims yet</p>
          <p className="text-sm text-foreground-muted mt-2">Browse the Wall and request an item — status and chat live here.</p>
        </div>
      )}

      {tab === "claiming" && !loading && itemRequests.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Items you've requested</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {itemRequests.map((r) => (
              <div
                key={r.id}
                className="bg-white border-2 border-foreground p-3 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-2 transition-all"
              >
                <Link to={`/account/claims/${r.id}`} className="aspect-square border-2 border-foreground bg-white overflow-hidden block">
                  <SafeImage src={resolveImageUrl(r.item.images?.[0]?.storagePath)} alt={r.item.title} className="w-full h-full object-contain hover:scale-105 transition-transform" />
                </Link>
                <Link to={`/account/claims/${r.id}`} className="text-xs font-bold leading-tight hover:underline">
                  {r.item.title}
                </Link>
                <span
                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 ${
                    r.status === "approved"
                      ? "bg-accent-green/20 text-accent-green"
                      : r.status === "rejected"
                        ? "bg-foreground/10 text-foreground-muted"
                        : "bg-accent-pink/10 text-accent-pink"
                  }`}
                >
                  {claimStatusLabel({ status: r.status, handoverStage: r.handoverStage })}
                </span>
                {r.status === "approved" ? (
                  r.borzoOrderId ? (
                    <div className="mt-auto pt-2 flex flex-col gap-1.5 border-t-2 border-foreground/10">
                      <div className="flex items-center justify-between gap-1 text-[10px] font-black uppercase text-accent-pink font-display">
                        <span className="flex items-center gap-1">
                          <Bike size={12} /> #{r.borzoOrderName || r.borzoOrderId}
                        </span>
                        <span className="text-foreground">{r.borzoStatus || "Booked"}</span>
                      </div>
                      {r.borzoCourier?.name && (
                        <p className="text-[10px] text-foreground-muted font-bold truncate">
                          Rider: {r.borzoCourier.name}
                        </p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        {r.borzoTrackingUrl && (
                          <a
                            href={r.borzoTrackingUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 text-[10px] font-black uppercase tracking-wider bg-foreground text-background text-center py-1.5 px-2 border border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-1"
                          >
                            <ExternalLink size={10} /> Track
                          </a>
                        )}
                        <Link
                          to={`/account/claims/${r.id}`}
                          className="flex-1 text-[10px] font-black uppercase tracking-wider text-center py-1.5 px-2 border-2 border-foreground hover:bg-surface-muted"
                        >
                          Details
                        </Link>
                      </div>
                    </div>
                  ) : r.giverLogistics === "porter_arranged" ? (
                    <div className="mt-auto pt-2 flex flex-col gap-1.5 border-t-2 border-foreground/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-accent-green flex items-center gap-1 font-display">
                        <Bike size={12} /> Matched · external courier
                      </span>
                      <div className="flex flex-col gap-1 mt-0.5">
                        <button
                          type="button"
                          disabled={bookingBorzoId === r.id}
                          onClick={() => handleBookBorzoDirect(r.id, r.item.title)}
                          className="w-full text-[10px] font-black uppercase tracking-widest bg-accent-green text-foreground text-center py-2 px-2 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50"
                        >
                          {bookingBorzoId === r.id ? "Booking Borzo..." : "Book Borzo"}
                        </button>
                        <Link
                          to={`/account/claims/${r.id}`}
                          className="text-[10px] font-black uppercase tracking-wider text-foreground-muted hover:text-foreground text-center py-0.5 underline"
                        >
                          Estimate fee & chat →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto pt-2 flex flex-col gap-1.5 border-t-2 border-foreground/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-accent-green font-display">
                        Matched
                      </span>
                      <Link
                        to={`/account/claims/${r.id}`}
                        className="text-[10px] font-black uppercase tracking-wider text-foreground mt-0.5 hover:underline"
                      >
                        Open handover details →
                      </Link>
                    </div>
                  )
                ) : (
                  <Link
                    to={`/account/claims/${r.id}`}
                    className="text-[10px] font-black uppercase tracking-widest text-foreground mt-auto pt-1 hover:underline"
                  >
                    Open details →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "giving" && (
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
              <Link
                key={sub.id}
                to={`/account/gifts/${sub.id}`}
                className="bg-white border-2 border-foreground p-6 shadow-[6px_6px_0px_rgba(0,0,0,1)] flex flex-col gap-4 hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-mono font-bold bg-surface-muted px-2 py-1 border border-foreground/20">{sub.reference}</span>
                  <span className="text-xs font-black uppercase tracking-widest px-2 py-1 bg-accent-pink/10 text-accent-pink">
                    {sub.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-foreground-muted">
                    {sub.submittedAt && !Number.isNaN(new Date(sub.submittedAt).getTime())
                      ? new Date(sub.submittedAt).toLocaleDateString()
                      : "Just now"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {sub.items.map((item) => (
                    <div key={item.id} className="bg-white border-2 border-foreground p-3 flex flex-col gap-2">
                      <div className="aspect-square border-2 border-foreground bg-white overflow-hidden">
                        <SafeImage src={resolveImageUrl(item.images?.[0]?.storagePath)} alt={item.title} className="w-full h-full object-contain" />
                      </div>
                      <p className="text-xs font-bold leading-tight">{item.title}</p>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/10 text-accent-pink">
                        {item.publicVisibility ? item.status.replace("_", " ") : "Awaiting review (24-48h)"}
                      </span>
                    </div>
                  ))}
                </div>
                {sub.status === "approved" && (
                  <span className="text-xs font-black uppercase tracking-widest">
                    Open details · delivery & chat →
                  </span>
                )}
                {(sub.status === "pending" || sub.status === "rejected" || sub.status === "approved") && (
                  <button
                    type="button"
                    className="text-xs font-black uppercase tracking-widest underline text-left text-accent-red"
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      const msg =
                        sub.status === "approved"
                          ? "Remove this item from the Wall of Kindness? Others won’t be able to claim it."
                          : "Remove this incomplete listing?"
                      if (!confirm(msg)) return
                      try {
                        await api.donor.delete(`/api/donor/submissions/${sub.id}`)
                        setSubmissions((prev) => prev.filter((s) => s.id !== sub.id))
                      } catch (err: any) {
                        alert(err?.message || "Couldn't remove listing")
                      }
                    }}
                  >
                    {sub.status === "approved" ? "Remove from Wall" : "Remove listing"}
                  </button>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  )
}
