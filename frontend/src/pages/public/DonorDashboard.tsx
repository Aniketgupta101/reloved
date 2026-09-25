import { useCallback, useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { Bell, Bike, ExternalLink } from "lucide-react"
import { api, resolveImageUrl } from "@/lib/api"
import { getDonorToken, clearDonorToken, setDonorPrefs, subscribeDonorAuth } from "@/lib/donorSession"
// SMS OTP uses /api/otp/request (Reloved MSG91_SMS_TEMPLATE_ID), not the
// MSG91 client widget (default "powered by Dashanan" template).
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete"
import { SafeImage } from "@/components/ui/SafeImage"
import { cn } from "@/lib/utils"
import { AnalyticsEvent, identifyDonor, resetAnalyticsIdentity, track } from "@/lib/analytics"
import { useDonorNotifications } from "@/lib/useDonorNotifications"
import { claimStatusLabel } from "@/lib/claimStatusCopy"
import { claimerReloveHeadline } from "@/lib/claimerHeadline"
import { computeKindnessStreak } from "@/lib/accountMetrics"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"
import { PrivacyBuildingNotice, privacyAddressWarning } from "@/components/ui/PrivacyBuildingNotice"

/** Indian mobile: last 10 digits (handles +91 / 91-prefixed storage). */
function digits10(value: string | null | undefined): string {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length >= 10 ? digits.slice(-10) : digits
}

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
    imageProcessingStatus?: string | null
    publicStatus?: string | null
    images: { storagePath: string }[]
    claim?: { id: string; status: string } | null
  }[]
}

interface ItemRequest {
  id: string
  status: string
  handoverStage?: string | null
  giverLogistics?: string | null
  submissionId?: string | null
  createdAt: string
  requesterName?: string | null
  requesterUsername?: string | null
  requesterLandmark?: string | null
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

type DashTab = "notifications" | "giving" | "claiming" | "profile"

export function DonorDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = (["notifications", "giving", "claiming", "profile"].includes(searchParams.get("tab") || "")
    ? searchParams.get("tab")
    : "notifications") as DashTab
  const { notifications, unreadCount, loading: notesLoading, error: notesError, markRead, markAllRead, refresh: refreshNotes } = useDonorNotifications()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [itemRequests, setItemRequests] = useState<ItemRequest[]>([])
  const [incomingClaims, setIncomingClaims] = useState<ItemRequest[]>([])
  const [weeklyUsed, setWeeklyUsed] = useState(0)
  const [weeklyLimit, setWeeklyLimit] = useState(2)
  const [resetsAt, setResetsAt] = useState<string | null>(null)
  const [profile, setProfile] = useState<DonorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const autoMarkedRef = useRef(false)

  // Opening Notifications = you've seen them. Clear the sticky "1" badge.
  useEffect(() => {
    if (tab !== "notifications") {
      autoMarkedRef.current = false
      return
    }
    if (notesLoading || unreadCount < 1 || autoMarkedRef.current) return
    autoMarkedRef.current = true
    void markAllRead()
  }, [tab, notesLoading, unreadCount, markAllRead])

  const [name, setName] = useState("")
  const [username, setUsername] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [pincode, setPincode] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveOk, setSaveOk] = useState<string | null>(null)

  const [phoneOtpStep, setPhoneOtpStep] = useState<"idle" | "sent" | "verified">("idle")
  const [phoneDevCode, setPhoneDevCode] = useState<string | null>(null)
  const [phoneCode, setPhoneCode] = useState("")
  const [emailOtpStep, setEmailOtpStep] = useState<"idle" | "sent" | "verified">("idle")
  const [emailCode, setEmailCode] = useState("")
  const [otpBusy, setOtpBusy] = useState(false)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  function requestRemoveSubmission(sub: Submission) {
    const onWall = sub.status === "approved"
    setNotice({
      title: onWall ? "Remove from Wall?" : "Remove listing?",
      body: onWall
        ? "This will take the item off the Wall of Kindness. You can drop again anytime."
        : "This will remove the listing from your account.",
      tone: "warn",
      primaryLabel: "Remove",
      secondaryLabel: "Cancel",
      onSecondary: () => setNotice(null),
      promptLabel: "Reason (optional)",
      promptPlaceholder: "e.g. Kept it, wrong photos, changed my mind…",
      promptRequired: false,
      onPrimary: (reason) => {
        void (async () => {
          try {
            await api.donor.delete(`/api/donor/submissions/${sub.id}`, { reason: reason || "" })
            setSubmissions((prev) => prev.filter((s) => s.id !== sub.id))
            setNotice(null)
          } catch (err: any) {
            setNotice({
              title: "Couldn't remove",
              body: err?.message || "Couldn't remove listing",
              tone: "error",
            })
          }
        })()
      },
    })
  }

  const hydrateForm = useCallback((p: DonorProfile) => {
    setName(p.name || "")
    setUsername((p.username || "").replace(/^@/, ""))
    setPhone(digits10(p.phone))
    setEmail(p.email || "")
    setAddress(p.address || "")
    setPincode(p.pincode || "")
    setPhoneOtpStep("idle")
    setPhoneDevCode(null)
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
      const [profileRes, subData, reqData, incoming] = await Promise.all([
        api.donor.get<{ profile: DonorProfile | null }>("/api/donor/profile"),
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
      const p = profileRes.profile
      const hasPhone = Boolean(String(p?.phone || "").replace(/\D/g, "").slice(-10).match(/^[6-9]\d{9}$/))
      if (!p?.onboardedAt || !hasPhone) {
        navigate("/account/onboarding")
        return
      }
      setProfile(p)
      hydrateForm(p)
      setSubmissions(subData.submissions)
      setItemRequests(reqData.requests)
      setIncomingClaims(incoming.claims || [])
      setWeeklyUsed(reqData.weeklyUsed ?? reqData.monthlyUsed ?? reqData.requests.length)
      setWeeklyLimit(reqData.weeklyLimit ?? reqData.monthlyLimit ?? 2)
      setResetsAt(reqData.resetsAt ?? null)
      if (!opts?.silent) setLoading(false)
      void refreshNotes()
    } catch (err: unknown) {
      const msg = String((err as { message?: string })?.message || "")
      // Only force logout on real auth failure — not network / 500 blips.
      if (/not signed in|invalid or expired session|unauthorized/i.test(msg)) {
        clearDonorToken()
        navigate("/account/login")
      }
      if (!opts?.silent) setLoading(false)
    }
  }, [navigate, hydrateForm, refreshNotes])

  const lastLoadAt = useRef(0)

  useEffect(() => {
    void load().then(() => {
      lastLoadAt.current = Date.now()
    })
  }, [load])

  // Live dashboard: poll while the tab is visible so notifications / claims update without refresh.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return
      if (editing) return
      if (!getDonorToken()) return
      void load({ silent: true }).then(() => {
        lastLoadAt.current = Date.now()
      })
    }
    const id = window.setInterval(tick, 8_000)
    const onVis = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVis)
    window.addEventListener("reloved-notifications", tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
      window.removeEventListener("reloved-notifications", tick)
    }
  }, [load, editing])

  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastLoadAt.current < 5_000) return
      if (getDonorToken() && !editing) {
        void load({ silent: true }).then(() => {
          lastLoadAt.current = Date.now()
        })
      }
    }
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [load, editing])

  useEffect(() => {
    return subscribeDonorAuth({
      onLogout: () => {
        resetAnalyticsIdentity()
        // Silent — KeepAlive / other tabs already own the broadcast.
        clearDonorToken({ silent: true })
        navigate("/account/login", { replace: true })
      },
    })
  }, [navigate])

  async function handleSignOut() {
    track(AnalyticsEvent.logout, { role: "donor" })
    try {
      if (getDonorToken()) {
        await api.donor.post("/api/donor/logout", {})
      }
    } catch {
      /* still clear local session */
    }
    resetAnalyticsIdentity()
    clearDonorToken()
    navigate("/account/login")
  }

  const phoneChanged = digits10(phone) !== digits10(profile?.phone)
  const emailChanged = email.trim().toLowerCase() !== (profile?.email || "").trim().toLowerCase()

  async function sendPhoneOtpViaBackend() {
    const res = await api.post<{ ok: true; devCode?: string }>("/api/otp/request", {
      channel: "sms",
      target: digits10(phone),
    })
    setPhoneDevCode(res.devCode || null)
    setPhoneOtpStep("sent")
  }

  async function sendPhoneOtp() {
    if (!/^[6-9]\d{9}$/.test(digits10(phone))) {
      setSaveError("Enter a valid 10-digit mobile starting with 6-9 before sending OTP.")
      return
    }
    setOtpBusy(true)
    setSaveError(null)
    setPhoneDevCode(null)
    try {
      await sendPhoneOtpViaBackend()
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
      const target = digits10(phone)
      await api.post("/api/otp/verify", { channel: "sms", target, code: phoneCode })
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
    if (!/^[6-9]\d{9}$/.test(digits10(phone))) {
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
    if (address.trim().length < 8) {
      setSaveError("Add your full building + street/landmark + area so couriers can find you.")
      return
    }
    if (!/^\d{6}$/.test(pincode.trim())) {
      setSaveError("Enter a valid 6-digit pincode.")
      return
    }
    if (privacyAddressWarning(address)) {
      setSaveError(privacyAddressWarning(address))
      return
    }

    setSaving(true)
    setSaveError(null)
    setSaveOk(null)
    try {
      const payload: Record<string, unknown> = {
        name,
        username: username.replace(/^@/, ""),
        address,
        pincode,
      }
      // Only send contact fields when they actually changed (avoids false OTP / uniqueness checks).
      if (phoneChanged) payload.phone = digits10(phone)
      if (emailChanged) payload.email = email.trim().toLowerCase()

      const { profile: updated } = await api.donor.patch<{ profile: DonorProfile }>("/api/donor/profile", payload)
      setProfile(updated)
      hydrateForm(updated)
      setDonorPrefs({ username: updated.username, gender: updated.gender ?? null })
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
    { id: "giving", label: "Drops", badge: incomingClaims.filter((c) => c.status === "pending").length },
    { id: "claiming", label: "Claims", badge: pendingRequests },
    { id: "profile", label: "Profile" },
  ]

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col gap-8 sm:gap-10">
      <div className="flex items-start justify-between gap-4 flex-wrap rounded-none border-2 border-foreground bg-white p-4 sm:p-5 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
        <div className="min-w-0">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black uppercase tracking-tight text-foreground text-balance">Your account</h1>
          <p className="text-foreground-muted mt-2 text-sm sm:text-base">
            {profile?.username ? `@${profile.username} · ` : ""}
            Profile, drops, claims, and notifications in one place.
          </p>
        </div>
        <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline shrink-0">
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
              "relative min-h-12 h-auto py-2 px-1.5 sm:px-2 text-[10px] sm:text-xs font-black uppercase tracking-widest border-2 border-foreground leading-tight",
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
        <div className="bg-white text-foreground border-2 border-foreground p-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
            <div className="min-w-0">
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
            <div className="flex flex-wrap items-center gap-2">
              {Array.from({ length: weeklyLimit }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 border-2 border-foreground flex items-center justify-center text-xs font-black shrink-0 ${
                    i < weeklyUsed ? "bg-accent-pink text-foreground" : "bg-white text-foreground-muted"
                  }`}
                >
                  {i < weeklyUsed ? "✓" : i + 1}
                </div>
              ))}
            </div>
          </div>
          {resetsAt && (
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">
              Resets {new Date(resetsAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
        </div>
      )}

      {(tab === "giving" || tab === "profile") && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white text-foreground border-2 border-foreground p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)]">
            <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Submissions</p>
            <p className="text-3xl font-display font-black mt-1">{loading ? "-" : submissions.length}</p>
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
          {notesLoading && notifications.length === 0 ? (
            <div className="h-32 bg-surface-muted border-2 border-foreground animate-pulse" />
          ) : notesError && notifications.length === 0 ? (
            <div className="text-center py-12 bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)] px-4">
              <p className="font-display font-black uppercase text-xl">Couldn’t load alerts</p>
              <p className="text-sm text-foreground-muted mt-2 max-w-md mx-auto">
                Check your connection, then try again.
              </p>
              <button
                type="button"
                onClick={() => refreshNotes()}
                className="mt-4 text-xs font-black uppercase tracking-widest underline"
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12 bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
              <p className="font-display font-black uppercase text-xl">No alerts yet</p>
              <p className="text-sm text-foreground-muted mt-2 max-w-md mx-auto">
                When someone claims your items, or a dropper accepts your request, it shows up here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {notifications.map((n) => {
                const claimId = String(n.requestId || "").trim()
                const thumbPath = (() => {
                  if (claimId) {
                    const incoming = incomingClaims.find((c) => c.id === claimId)
                    if (incoming?.item?.images?.[0]?.storagePath) return incoming.item.images[0].storagePath
                    const mine = itemRequests.find((c) => c.id === claimId)
                    if (mine?.item?.images?.[0]?.storagePath) return mine.item.images[0].storagePath
                    for (const s of submissions) {
                      const it = (s.items || []).find((i) => i.claim?.id === claimId)
                      if (it?.images?.[0]?.storagePath) return it.images[0].storagePath
                    }
                  }
                  if (n.itemTitle) {
                    for (const s of submissions) {
                      const it = (s.items || []).find(
                        (i) => i.title?.toLowerCase() === String(n.itemTitle).toLowerCase(),
                      )
                      if (it?.images?.[0]?.storagePath) return it.images[0].storagePath
                    }
                    for (const r of itemRequests) {
                      if (r.item?.title?.toLowerCase() === String(n.itemTitle).toLowerCase()) {
                        return r.item.images?.[0]?.storagePath
                      }
                    }
                  }
                  return null
                })()
                const thumb = thumbPath ? resolveImageUrl(thumbPath) : null
                const shortBody = (() => {
                  const raw = String(n.body || "").trim()
                  if (!raw) return n.itemTitle || ""
                  if (raw.length <= 90) return raw
                  return `${raw.slice(0, 87).trim()}…`
                })()
                const typeLabel =
                  n.type === "item_dropped"
                    ? "Dropped"
                    : n.type === "item_claimed" || n.type === "claim_sent"
                      ? "Claim"
                      : n.type === "claim_accepted"
                        ? "Matched"
                        : n.type === "claim_declined"
                          ? "Declined"
                          : n.type === "address_shared" || n.type === "address_confirmed"
                            ? "Address"
                            : n.type === "schedule_proposed" ||
                                n.type === "schedule_agreed" ||
                                n.type === "schedule_reschedule"
                              ? "Schedule"
                              : n.type === "new_message"
                                ? "Message"
                                : n.type === "handed_over" || n.type === "received"
                                  ? "Reloved"
                                  : n.role === "giver"
                                    ? "Drop"
                                    : "Claiming"

                return (
                <button
                  key={n.id}
                  type="button"
                  onClick={async () => {
                    await markRead(n.id, { requestId: n.requestId })
                    let href = n.href || "/account"

                    // Always prefer the claim→gift deep link so we open the exact
                    // article that was claimed (not the first gift / whole catalogue).
                    if (n.role === "giver" && claimId && n.type !== "item_dropped") {
                      const incoming = incomingClaims.find((c) => c.id === claimId)
                      if (incoming?.submissionId) {
                        href = `/account/gifts/${incoming.submissionId}?claim=${encodeURIComponent(claimId)}`
                      } else {
                        const gift = submissions.find((s) =>
                          (s.items || []).some((it: any) => it.claim?.id === claimId),
                        )
                        if (gift?.id) {
                          href = `/account/gifts/${gift.id}?claim=${encodeURIComponent(claimId)}`
                        }
                      }
                    }

                    // Legacy peer-chat / bare /account alerts for givers.
                    const bareAccount =
                      href === "/account" ||
                      href.startsWith("/account?") ||
                      href === "/account?tab=notifications"
                    if (n.type === "new_message" && n.role === "giver" && bareAccount) {
                      if (claimId) {
                        const incoming = incomingClaims.find((c) => c.id === claimId)
                        if (incoming?.submissionId) {
                          href = `/account/gifts/${incoming.submissionId}?claim=${encodeURIComponent(claimId)}`
                        } else {
                          const gift = submissions.find((s) =>
                            (s.items || []).some((it: any) => it.claim?.id === claimId),
                          )
                          if (gift?.id) href = `/account/gifts/${gift.id}?claim=${encodeURIComponent(claimId)}`
                          else href = "/account?tab=giving"
                        }
                      } else {
                        href = "/account?tab=giving"
                      }
                    }

                    // If href is a gift page without ?claim= but we have a real claim requestId, append it.
                    // Never do this for drop-live alerts (requestId used to be a submission id by mistake).
                    if (
                      claimId &&
                      n.type !== "item_dropped" &&
                      href.startsWith("/account/gifts/") &&
                      !href.includes("claim=")
                    ) {
                      href += (href.includes("?") ? "&" : "?") + `claim=${encodeURIComponent(claimId)}`
                    }

                    navigate(href)
                  }}
                  className={cn(
                    "w-full text-left border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all overflow-hidden",
                    n.read ? "bg-white" : "bg-[#FFE5F0]",
                  )}
                >
                  <div className="flex gap-0 min-h-[88px]">
                    <div className="w-20 sm:w-24 shrink-0 border-r-2 border-foreground bg-surface-muted overflow-hidden">
                      {thumb ? (
                        <SafeImage
                          src={thumb}
                          alt={n.itemTitle || n.title}
                          className="w-full h-full object-cover min-h-[88px]"
                        />
                      ) : (
                        <div className="w-full h-full min-h-[88px] flex items-center justify-center bg-accent-pink/20">
                          <Bell size={22} className="text-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 p-3 sm:p-4 flex flex-col gap-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border border-foreground/20 bg-white/80">
                          {typeLabel}
                        </span>
                        {!n.read && (
                          <span className="text-[10px] font-black uppercase tracking-widest bg-accent-pink px-2 py-0.5 border border-foreground shrink-0">
                            New
                          </span>
                        )}
                      </div>
                      <p className="font-display font-black uppercase text-sm sm:text-base leading-tight text-foreground line-clamp-2">
                        {n.title}
                      </p>
                      {(n.itemTitle || shortBody) && (
                        <p className="text-xs sm:text-sm font-medium text-foreground-muted line-clamp-2">
                          {n.itemTitle && shortBody !== n.itemTitle
                            ? `${n.itemTitle} · ${shortBody}`
                            : shortBody || n.itemTitle}
                        </p>
                      )}
                      <p className="text-[10px] font-bold uppercase tracking-widest mt-auto pt-1 underline text-foreground">
                        Open →
                      </p>
                    </div>
                  </div>
                </button>
                )
              })}
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
          <>
            {(!profile.address || profile.address.trim().length < 8 || !/^\d{6}$/.test(String(profile.pincode || "").trim())) && (
              <div className="border-2 border-foreground bg-accent-pink/15 px-3 py-3 text-sm">
                <p className="font-black uppercase tracking-widest text-xs mb-1">Update your address</p>
                <p className="font-medium">
                  Please add your building name, full address, area, and pincode so Reloved can book pickups accurately.
                  Tap Edit profile to complete this before delivery is needed.
                </p>
              </div>
            )}
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
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Address</p>
              <p className="font-bold mt-1">{profile.address || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Pincode</p>
              <p className="font-bold mt-1">{profile.pincode || "-"}</p>
            </div>
          </div>
          </>
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
              <label className="text-xs font-bold uppercase tracking-widest">Mobile *</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => {
                    setPhone(digits10(e.target.value).slice(0, 10))
                    setPhoneOtpStep("idle")
                    setPhoneDevCode(null)
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
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex gap-2">
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
                  {phoneDevCode && (
                    <p className="text-xs font-bold text-accent-green">Dev SMS code: {phoneDevCode}</p>
                  )}
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

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-widest">Full address *</label>
              <PrivacyBuildingNotice extraNote="Building name + street/area + pincode help Reloved book pickups accurately." />
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(val, _coords, postcode) => {
                  setAddress(val)
                  if (postcode) setPincode(postcode)
                }}
                placeholder="Building name, street/landmark, area, city"
                className="rounded-none border-2 border-foreground"
              />
              {privacyAddressWarning(address) && (
                <p className="text-xs font-bold text-accent-red">{privacyAddressWarning(address)}</p>
              )}
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

      <div className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4">
        <Link
          to="/give"
          className="w-full sm:w-auto"
          onClick={() => track(AnalyticsEvent.ctaDropItem, { source: "donor_dashboard" })}
        >
          <Button variant="cta" className="w-full sm:w-auto h-auto min-h-12 py-3 font-black uppercase tracking-widest whitespace-normal text-center leading-tight">
            Drop another item
          </Button>
        </Link>
        <Link
          to="/drop"
          className="w-full sm:w-auto"
          onClick={() => track(AnalyticsEvent.ctaClaimItem, { source: "donor_dashboard" })}
        >
          <Button variant="cta" className="w-full sm:w-auto h-auto min-h-12 py-3 font-black uppercase tracking-widest whitespace-normal text-center leading-tight">
            Browse the Wall to take an item
          </Button>
        </Link>
      </div>

      {tab === "giving" && !loading && (() => {
        const activeClaims = incomingClaims.filter(
          (r) =>
            r.status === "pending" ||
            (r.status === "approved" &&
              r.handoverStage !== "received" &&
              r.handoverStage !== "handed_over"),
        )
        if (activeClaims.length === 0) return null
        return (
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-display font-black uppercase tracking-tight">Claim requests</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {activeClaims.map((r) => (
              <div key={r.id} className="bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden">
                <div className="aspect-[4/3] border-b-2 border-foreground bg-surface-muted overflow-hidden">
                  <SafeImage
                    src={resolveImageUrl(r.item?.images?.[0]?.storagePath)}
                    alt={r.item?.title || "Item"}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="p-3 flex flex-col gap-2">
                  <p className="text-xs font-bold leading-tight">
                    {r.status === "pending"
                      ? claimerReloveHeadline({
                          name: r.requesterName,
                          username: r.requesterUsername,
                          landmark: r.requesterLandmark,
                          itemTitle: r.item?.title || "item",
                        })
                      : r.item?.title}
                  </p>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/15">
                    {r.status === "pending"
                      ? "Accept or Decline"
                      : "Matched · in progress"}
                  </span>
                  <Link
                    to={
                      r.submissionId
                        ? `/account/gifts/${r.submissionId}?claim=${encodeURIComponent(r.id)}`
                        : "/account"
                    }
                    className="text-[10px] font-black uppercase tracking-widest underline"
                  >
                    Open gift →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      })()}

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
                      : r.status === "rejected" || r.status === "cancelled"
                        ? "bg-foreground/10 text-foreground-muted"
                        : "bg-accent-pink/10 text-accent-pink"
                  }`}
                >
                  {claimStatusLabel({ status: r.status, handoverStage: r.handoverStage })}
                </span>
                {(r.status === "pending" ||
                  (r.status === "approved" &&
                    r.handoverStage !== "handed_over" &&
                    r.handoverStage !== "received" &&
                    !r.borzoOrderId)) && (
                  <button
                    type="button"
                    className="text-[10px] font-black uppercase tracking-widest underline text-left text-accent-red"
                    onClick={(e) => {
                      e.preventDefault()
                      setNotice({
                        title: "Cancel this claim?",
                        body:
                          r.status === "approved"
                            ? "This cancels your match. The item goes back on the Wall."
                            : "This withdraws your request. The item stays on the Wall.",
                        tone: "warn",
                        primaryLabel: "Cancel claim",
                        secondaryLabel: "Keep claim",
                        onSecondary: () => setNotice(null),
                        onPrimary: () => {
                          void (async () => {
                            try {
                              await api.donor.post(`/api/donor/item-requests/${r.id}/cancel`, {})
                              setItemRequests((prev) =>
                                prev.map((x) => (x.id === r.id ? { ...x, status: "cancelled" } : x))
                              )
                              setNotice({
                                title: "Claim cancelled",
                                body: "The item is available on the Wall again.",
                                tone: "ok",
                              })
                            } catch (err: any) {
                              setNotice({
                                title: "Couldn't cancel",
                                body: err?.message || "Couldn't cancel claim",
                                tone: "error",
                              })
                            }
                          })()
                        },
                      })
                    }}
                  >
                    Cancel claim
                  </button>
                )}
                {r.status === "approved" ? (
                  <div className="mt-auto pt-2 flex flex-col gap-1.5 border-t-2 border-foreground/10">
                    <span className="text-[10px] font-black uppercase tracking-wider text-accent-green flex items-center gap-1 font-display">
                      <Bike size={12} /> Matched · Reloved courier
                    </span>
                    {r.borzoTrackingUrl && (
                      <a
                        href={r.borzoTrackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] font-black uppercase tracking-widest underline flex items-center gap-1"
                      >
                        <ExternalLink size={10} /> Track delivery
                      </a>
                    )}
                    <Link
                      to={`/account/claims/${r.id}`}
                      className="w-full text-[10px] font-black uppercase tracking-widest bg-accent-green text-foreground text-center py-2 px-2 border-2 border-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
                    >
                      Open handover details →
                    </Link>
                  </div>
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
        <h2 className="text-xl font-display font-black uppercase tracking-tight">Your drops</h2>
        {loading ? (
          <div className="h-40 bg-surface-muted border-2 border-foreground animate-pulse" />
        ) : submissions.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-foreground shadow-[8px_8px_0px_rgba(0,0,0,1)]">
            <h3 className="text-2xl font-display font-black uppercase">Nothing here yet.</h3>
            <p className="text-foreground-muted mt-2">Once you drop an item using this phone/email, it'll show up here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {submissions.flatMap((sub) =>
              (sub.items.length ? sub.items : [{ id: sub.id, slug: "", title: sub.reference, category: "", status: sub.status, publicVisibility: false, images: [] as { storagePath: string }[], claim: null }]).map((item) => {
                const claimId = item.claim?.id
                // Always pin the clicked article — multi-item bags share one submission id,
                // so without ?item= GiveDetail falls back to items[0] for every Open.
                const qs = new URLSearchParams()
                if (item.id && item.id !== sub.id) qs.set("item", item.id)
                if (claimId) qs.set("claim", claimId)
                const q = qs.toString()
                const href = q ? `/account/gifts/${sub.id}?${q}` : `/account/gifts/${sub.id}`
                const statusLabel =
                  item.claim?.status === "pending"
                    ? "Accept or Decline"
                    : item.claim?.status === "approved"
                      ? "Matched"
                      : item.imageProcessingStatus === "processing" ||
                          (item.publicVisibility === false && item.imageProcessingStatus !== "ready")
                        ? "Processing image…"
                        : item.publicVisibility
                          ? String(item.status || sub.status).replace("_", " ")
                          : "Awaiting review"
                const ref = String(sub.reference || "").trim()
                const showRef =
                  ref &&
                  !/^(wsm|usm|batch)[-_]/i.test(ref) &&
                  !/-shirts-|-pants-|-tops-/i.test(ref)
                return (
                  <div
                    key={`${sub.id}-${item.id}`}
                    className="bg-white border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] flex flex-col overflow-hidden min-w-0"
                  >
                    <Link to={href} className="aspect-square border-b-2 border-foreground bg-surface-muted overflow-hidden block">
                      <SafeImage
                        src={resolveImageUrl(item.images?.[0]?.storagePath)}
                        alt={item.title}
                        className="w-full h-full object-contain hover:scale-105 transition-transform"
                      />
                    </Link>
                    <div className="p-3 flex flex-col gap-2 flex-1 min-w-0">
                      {showRef && (
                        <p className="text-[10px] font-mono font-bold text-foreground-muted truncate">{ref}</p>
                      )}
                      <Link to={href} className="text-xs font-bold leading-tight line-clamp-2 hover:underline">
                        {item.title}
                      </Link>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 w-fit border border-foreground/20 bg-accent-pink/10 text-accent-pink">
                        {statusLabel}
                      </span>
                      <div className="mt-auto pt-2">
                        <Link to={href} className="block w-full">
                          <Button
                            type="button"
                            variant="cta"
                            size="sm"
                            className="w-full text-[10px] sm:text-xs tracking-wide"
                          >
                            Open
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                )
              }),
            )}
          </div>
        )}
      </div>
      )}

      {notice && (
        <NoticeModal
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
          primaryLabel={notice.primaryLabel}
          onPrimary={notice.onPrimary}
          secondaryLabel={notice.secondaryLabel}
          onSecondary={notice.onSecondary}
          promptLabel={notice.promptLabel}
          promptPlaceholder={notice.promptPlaceholder}
          promptRequired={notice.promptRequired}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
