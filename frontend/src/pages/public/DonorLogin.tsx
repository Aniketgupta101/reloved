import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { api } from "@/lib/api"
import { setDonorToken } from "@/lib/donorSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"

export function DonorLogin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect")
  const [step, setStep] = useState<"request" | "verify">("request")
  const [channel, setChannel] = useState<"email" | "sms">("email")
  const [target, setTarget] = useState("")
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post("/api/otp/request", { channel, target })
      setStep("verify")
    } catch (err: any) {
      setError(err?.message || "Failed to send code.")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await api.post("/api/otp/verify", { channel, target, code })
      const { token } = await api.post<{ token: string }>("/api/donor/session", { channel, target })
      setDonorToken(token)

      const { profile } = await api.donor.get<{ profile: { onboardedAt: string | null } | null }>("/api/donor/profile")
      if (profile?.onboardedAt) {
        navigate(redirect || "/account")
      } else {
        navigate(`/account/onboarding${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
      }
    } catch (err: any) {
      setError(err?.message || "Incorrect code.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-24 flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-display font-black uppercase tracking-tight">Your reloved account</h1>
        <p className="text-foreground-muted mt-3">No password — just verify your phone or email to see everything you've given.</p>
      </div>

      <div className="bg-white border-2 border-foreground p-8 shadow-[8px_8px_0px_rgba(0,0,0,1)]">
        {step === "request" ? (
          <form onSubmit={handleRequest} className="flex flex-col gap-5">
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
              <Input
                type={channel === "email" ? "email" : "tel"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                required
                className="rounded-none border-2 border-foreground"
              />
            </div>

            {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

            <Button type="submit" disabled={loading} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all bg-accent-green text-foreground hover:bg-accent-green">
              {loading ? "Sending..." : "Send code"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="flex flex-col gap-5">
            <p className="text-sm text-foreground-muted">Enter the 6-digit code sent to <strong className="text-foreground">{target}</strong>.</p>

            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              required
              className="rounded-none border-2 border-foreground text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="------"
            />

            {error && <p className="text-sm font-bold text-accent-red">{error}</p>}

            <Button type="submit" disabled={loading} className="font-black uppercase tracking-widest border-2 border-foreground rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all">
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
