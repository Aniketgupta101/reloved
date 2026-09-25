import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"
import { api } from "@/lib/api"
import { auth } from "@/lib/firebase"
import {
  getDonorToken,
  setDonorToken,
  setDonorPrefs,
  setDonorLoginContext,
  safeDonorRedirect,
} from "@/lib/donorSession"
// SMS OTP always goes through /api/otp/request so MSG91_SMS_TEMPLATE_ID
// (Reloved / RELOVD DLT) is used. The client MSG91 widget ships MSG91's
// default "powered by Dashanan" template and must not be preferred here.
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"

function detectChannel(raw: string): "email" | "sms" | null {
  const v = raw.trim()
  if (!v) return null
  if (v.includes("@")) {
    return v.includes("@") && v.length > 4 ? "email" : null
  }
  const digits = v.replace(/\D/g, "").slice(-10)
  if (digits.length === 10 && /^[6-9]/.test(digits)) return "sms"
  return null
}

function normalizeTarget(raw: string, channel: "email" | "sms"): string {
  if (channel === "email") return raw.trim()
  return raw.replace(/\D/g, "").slice(-10)
}

export function DonorLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = safeDonorRedirect(searchParams.get("redirect"), "/drop")
  const dropping = redirect.startsWith("/give")
  const [step, setStep] = useState<"request" | "verify">("request")
  const [channel, setChannel] = useState<"email" | "sms">("email")
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Prevent double-submit of Login (no resend UI — one OTP send only). */
  const otpSentRef = useRef(false)
  const inAppBrowser = (() => {
    if (typeof navigator === "undefined") return false
    const ua = (navigator.userAgent || "").toLowerCase()
    return (
      ua.includes("instagram") ||
      ua.includes("fb_iab") ||
      ua.includes("fban") ||
      ua.includes("fbav") ||
      ua.includes("tiktok") ||
      ua.includes("musical_ly")
    )
  })()

  useEffect(() => {
    if (!getDonorToken()) return
    navigate(redirect, { replace: true })
  }, [navigate, redirect])

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    if (loading || otpSentRef.current) return
    const detected = detectChannel(target)
    if (!detected) {
      setError("Enter a valid email, or a 10-digit Indian mobile number.")
      return
    }
    const normalized = normalizeTarget(target, detected)
    setChannel(detected)
    setTarget(normalized)
    setLoading(true)
    setError(null)
    setDevCode(null)
    otpSentRef.current = true
    try {
      const res = await api.post<{ ok: true; devCode?: string }>("/api/otp/request", {
        channel: detected,
        target: normalized,
      })
      if (res.devCode) setDevCode(res.devCode)
      track(AnalyticsEvent.loginStarted, { channel: detected, method: "otp" })
      setStep("verify")
    } catch (err: any) {
      otpSentRef.current = false
      setError(err?.message || "Failed to send code.")
    } finally {
      setLoading(false)
    }
  }

  async function finishLogin(token: string, loginChannel: "email" | "sms" | "google", loginTarget?: string) {
    setDonorToken(token)
    setDonorLoginContext(loginChannel, loginTarget)

    const { profile } = await api.donor.get<{
      profile: {
        onboardedAt: string | null
        username?: string | null
        gender?: string | null
        phone?: string | null
      } | null
    }>("/api/donor/profile")
    track(AnalyticsEvent.loginCompleted, {
      channel: loginChannel,
      onboarded: Boolean(profile?.onboardedAt),
    })
    if (profile?.username) {
      identifyDonor(`donor:${profile.username}`, { onboarded: Boolean(profile.onboardedAt) })
    }
    const hasPhone = Boolean(String(profile?.phone || "").replace(/\D/g, "").slice(-10).match(/^[6-9]\d{9}$/))
    if (profile?.onboardedAt && hasPhone) {
      if (profile.username) {
        setDonorPrefs({ username: profile.username, gender: profile.gender ?? null })
      }
      navigate(redirect)
    } else {
      navigate(`/account/onboarding?redirect=${encodeURIComponent(redirect)}`)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post("/api/otp/verify", { channel, target, code })
      const { token } = await api.post<{ token: string }>("/api/donor/session", { channel, target })
      await finishLogin(token, channel, target)
    } catch (err: any) {
      setError(err?.message || "Incorrect code.")
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setLoading(true)
    setError(null)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const idToken = await result.user.getIdToken()
      track(AnalyticsEvent.loginStarted, { channel: "google", method: "google" })
      const { token } = await api.post<{ token: string }>("/api/donor/session/google", { idToken })
      await finishLogin(token, "google", result.user.email || undefined)
    } catch (err: any) {
      if (err?.code === "auth/popup-closed-by-user") {
        setError(null)
      } else {
        setError(err?.message || "Google sign-in failed.")
      }
    } finally {
      setLoading(false)
    }
  }

  const canSend = Boolean(detectChannel(target))

  return (
    <div className="w-full max-w-md mx-auto px-3 sm:px-4 py-10 sm:py-24 flex flex-col gap-6 sm:gap-8 min-w-0">
      <div className="text-center px-1">
        <h1 className="text-3xl sm:text-4xl font-display font-black uppercase tracking-tight">Log in</h1>
        <p className="text-foreground-muted mt-2 sm:mt-3 text-sm sm:text-base leading-snug">
          {dropping
            ? "Sign in to finish dropping your item. New here? We’ll set up your profile next."
            : "No password. Use Google, or get a one-time code by email or mobile."}
        </p>
      </div>

      <div className="bg-white border border-foreground sm:border-2 p-4 sm:p-8 shadow-[4px_4px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_rgba(0,0,0,1)] min-w-0 overflow-hidden">
        {inAppBrowser && (
          <p className="mb-4 text-xs font-medium leading-snug border-2 border-foreground bg-accent-pink/20 px-3 py-2">
            Tip: Google sign-in works more reliably in Safari or Chrome. You can keep browsing here, or use email / mobile OTP below.
          </p>
        )}
        {step === "request" ? (
          <form onSubmit={handleRequest} className="flex flex-col gap-4 sm:gap-5 min-w-0">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="box-border flex w-full max-w-full min-w-0 items-center justify-center gap-2.5 border-2 border-foreground bg-white px-4 py-3 text-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] transition-all hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 48 48" className="block h-5 w-5">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 6 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.5 5.5C41.3 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
                </svg>
              </span>
              <span className="min-w-0 font-display text-[12px] font-black uppercase leading-none tracking-wide sm:text-sm">
                {loading ? "Signing in…" : "Continue with Google"}
              </span>
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-foreground/20" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Or</span>
              <div className="h-px flex-1 bg-foreground/20" />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <label className="text-sm font-bold uppercase tracking-widest">Email or mobile</label>
              <Input
                type="text"
                name="login"
                autoComplete="username"
                inputMode="email"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                placeholder="Please enter your email or number"
                className="rounded-none border-2 border-foreground"
              />
              <p className="text-xs text-foreground-muted leading-snug">
                Enter your email address, or a 10-digit Indian mobile number. We’ll send a one-time login code.
              </p>
            </div>

            {error && <p className="text-sm font-bold text-accent-red break-words">{error}</p>}

            <p className="text-xs text-foreground-muted leading-relaxed border-l-2 border-foreground pl-3">
              We use your email or mobile to verify it’s you, send claim/drop updates, and coordinate delivery.
              We never sell your data.{" "}
              <a href="/privacy" className="underline font-bold">Privacy Policy</a>
              {" · "}
              <a href="/terms" className="underline font-bold">Terms</a>
            </p>

            <Button
              type="submit"
              variant="cta"
              disabled={loading || !canSend}
              className="w-full font-black uppercase tracking-wide sm:tracking-widest"
            >
              {loading ? "Sending…" : "Login"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-4 sm:gap-5 min-w-0">
            <p className="text-sm text-foreground-muted text-pretty">
              Enter the 6-digit code sent to{" "}
              <strong className="text-foreground">{channel === "sms" ? `+91 ${target}` : target}</strong>.
            </p>

            {devCode && (
              <p className="text-sm font-bold border border-foreground sm:border-2 bg-accent-pink/40 px-3 py-2 break-words">
                Test code (SMS not delivering yet):{" "}
                <span className="font-mono tracking-widest">{devCode}</span>
              </p>
            )}

            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              className="rounded-none border border-foreground sm:border-2 text-center text-2xl tracking-[0.4em] sm:tracking-[0.5em] font-mono"
              placeholder="------"
            />

            {error && <p className="text-sm font-bold text-accent-red break-words">{error}</p>}

            <Button
              type="submit"
              variant="cta"
              disabled={loading || code.length !== 6}
              className="w-full font-black uppercase tracking-wide sm:tracking-widest"
            >
              {loading ? "Verifying…" : "Verify & log in"}
            </Button>

            <button
              type="button"
              onClick={() => {
                setStep("request")
                setCode("")
                setError(null)
                setDevCode(null)
                otpSentRef.current = false
              }}
              className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline text-center"
            >
              Use a different email or number
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
