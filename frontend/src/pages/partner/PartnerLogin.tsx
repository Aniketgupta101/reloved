import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/lib/api"
import { setPartnerToken } from "@/lib/partnerSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Card, CardContent } from "@/components/ui/Card"
import { AnalyticsEvent, track } from "@/lib/analytics"

export function PartnerLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      track(AnalyticsEvent.loginStarted, { channel: "password", role: "partner" })
      const { token } = await api.post<{ token: string }>("/api/partner/login", { email, password })
      setPartnerToken(token)
      track(AnalyticsEvent.loginCompleted, { role: "partner", channel: "password" })
      navigate("/partner/dashboard")
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-8 p-8">
          <div>
            <h1 className="text-2xl font-display font-black uppercase tracking-tight">reloved.partners</h1>
            <p className="text-foreground-muted">Sign in to request items for your organisation.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest">Password</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <p className="text-sm text-accent-red font-medium">{error}</p>}

            <Button type="submit" disabled={loading} className="mt-4">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-foreground-muted">
            Your login was emailed to you when your partner application was approved. Contact reloved if you need it resent.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
