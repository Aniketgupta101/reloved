import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/lib/api"
import { setAdminToken } from "@/lib/adminSession"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Card, CardContent } from "@/components/ui/Card"

export function AdminLogin() {
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
      const { token } = await api.post<{ token: string }>("/api/auth/login", { email, password })
      setAdminToken(token)
      navigate('/admin')
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
            <h1 className="text-2xl font-display font-black uppercase tracking-tight">reloved.ops</h1>
            <p className="text-foreground-muted">Sign in to the operator dashboard.</p>
          </div>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest">Email</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black uppercase tracking-widest">Password</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && <p className="text-sm text-accent-red font-medium">{error}</p>}

            <Button type="submit" disabled={loading} className="mt-4">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
