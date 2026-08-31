import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"
import { api } from "@/lib/api"
import { auth } from "@/lib/firebase"
import { setDonorToken, setDonorPrefs } from "@/lib/donorSession"
import { msg91SendOtp, msg91VerifyOtp, msg91WidgetConfigured } from "@/lib/msg91Widget"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { AnalyticsEvent, identifyDonor, track } from "@/lib/analytics"

export function DonorLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const [step, setStep] = useState<"request" | "verify">("request")
  const [channel, setChannel] = useState<"email" | "sms">("email")
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")
  const [devCode, setDevCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // MSG91 widget only when VITE_MSG91_WIDGET_* is set; otherwise backend OTP (SMS vendor / test fallback).
  const useMsg91Widget = channel === "sms" && msg91WidgetConfigured

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setDevCode(null)
    try {
      if (useMsg91Widget) {
        await msg91SendOtp(target)
      } else {
        const res = await api.post<{ ok: true; devCode?: string }>("/api/otp/request", { channel, target })
        if (res.devCode) setDevCode(res.devCode)
      }
      track(AnalyticsEvent.loginStarted, { channel, method: "otp" })
      setStep("verify")
    } catch (err: any) {
      setError(err?.message || "Failed to send code.")
    } finally {
      setLoading(false)
    }
  }

  async function finishLogin(token: string, loginChannel: "email" | "sms" | "google") {
    setDonorToken(token)

    const { profile } = await api.donor.get<{
      profile: { onboardedAt: string | null; username?: string | null; gender?: string | null } | null
    }>("/api/donor/profile")
    track(AnalyticsEvent.loginCompleted, {
      channel: loginChannel,
      onboarded: Boolean(profile?.onboardedAt),
    })
    if (profile?.username) {
      identifyDonor(`donor:${profile.username}`, { onboarded: Boolean(profile.onboardedAt) })
    }
    if (profile?.onboardedAt) {
      if (profile.gender || profile.username) {
        setDonorPrefs({ username: profile.username, gender: profile.gender })
      }
      navigate(redirect || "/drop")
    } else {
      navigate(`/account/onboarding${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (useMsg91Widget) {
        const accessToken = await msg91VerifyOtp(code)
        await api.post("/api/otp/verify-widget", { target, accessToken })
      } else {
        await api.post("/api/otp/verify", { channel, target, code })
      }
      const { token } = await api.post<{ token: string }>("/api/donor/session", { channel, target })
      await finishLogin(token, channel)
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
      await finishLogin(token, "google")
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

  return (
    <div className="w-full max-w-md mx-auto px-4 py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">Your reloved account</h1>
        <p className="text-foreground-muted mt-3">No password - just verify your phone or email to see everything you've given.</p>
      </div>

      <div className="bg-white border-2 border-foreground p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        {step === "request" ? (
          <form onSubmit={handleRequest} className="flex flex-col gap-5">
            <Button
              type="button"
              onClick={handleGoogle}
              disabled={loading}
              className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-white text-foreground hover:bg-white flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 6 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.5 5.5C41.3 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
              </svg>
              {loading ? "Signing in..." : "Continue with Google"}
            </Button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-foreground/20" />
              <span className="text-xs font-bold uppercase tracking-widest text-foreground-muted">Or</span>
              <div className="h-px flex-1 bg-foreground/20" />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setChannel("email")}
                className={`flex-1 h-10 text-xs font-black uppercase tracking-widest border-2 border-foreground ${channel === "email" ? "bg-foreground text-background" : "bg-white"}`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setChannel("sms")}
                className={`flex-1 h-10 text-xs font-black uppercase tracking-widest border-2 border-foreground ${channel === "sms" ? "bg-foreground text-background" : "bg-white"}`}
              >
                Phone
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold uppercase tracking-widest">{channel === "email" ? "Email address" : "Mobile number"}</label>
              {channel === "sms" ? (
                <div className="flex items-stretch border-2 border-foreground">
                  <span className="flex items-center px-3 bg-surface-muted text-sm font-bold border-r-2 border-foreground">+91</span>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={target}
                    onChange={(e) => setTarget(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    required
                    pattern="[6-9][0-9]{9}"
                    title="10-digit Indian mobile starting with 6-9"
                    className="rounded-none border-0"
                  />
                </div>
              ) : (
                <Input
                  type="email"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  required
                  className="rounded-none border-2 border-foreground"
                />
              )}
              {channel === "sms" && !msg91WidgetConfigured && (
                <p className="text-xs text-foreground-muted">
                  Live SMS delivery isn&apos;t fully configured yet - after you send, the code will be shown on the next step for testing.
                </p>
              )}
            </div>

            {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

            <Button type="submit" disabled={loading || (channel === "sms" && target.length !== 10)} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-pink text-foreground hover:bg-accent-pink">
              {loading ? "Sending..." : "Send code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-5">
            <p className="text-sm text-foreground-muted">
              Enter the 6-digit code sent to <strong className="text-foreground">{channel === "sms" ? `+91 ${target}` : target}</strong>.
            </p>

            {devCode && (
              <p className="text-sm font-bold border-2 border-foreground bg-accent-pink/40 px-3 py-2">
                Test code (SMS not delivering yet): <span className="font-mono tracking-widest">{devCode}</span>
              </p>
            )}

            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              required
              className="rounded-none border-2 border-foreground text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="------"
            />

            {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

            <Button type="submit" disabled={loading || code.length !== 6} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">
              {loading ? "Verifying..." : "Verify & sign in"}
            </Button>
            <button type="button" onClick={() => setStep("request")} className="text-xs font-bold uppercase tracking-widest text-foreground-muted underline">
              Use a different phone/email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
