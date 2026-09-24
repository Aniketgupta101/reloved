import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

interface WaitlistSignup {
  id: string
  fullName: string | null
  email: string
  phone: string
  intent: "donate" | "claim" | string
  welcomeEmailSent?: boolean
  createdAt: string | null
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function AdminWaitlist() {
  const [signups, setSignups] = useState<WaitlistSignup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "donate" | "claim">("all")
  const [query, setQuery] = useState("")

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.admin.get<{ signups: WaitlistSignup[]; count: number }>("/api/admin/waitlist")
      setSignups(data.signups || [])
    } catch (err: any) {
      console.error(err)
      setError(err?.message || "Failed to load waitlist")
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return signups.filter((s) => {
      if (filter !== "all" && s.intent !== filter) return false
      if (!q) return true
      const hay = `${s.fullName || ""} ${s.email || ""} ${s.phone || ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [signups, filter, query])

  const donateCount = signups.filter((s) => s.intent === "donate").length
  const claimCount = signups.filter((s) => s.intent === "claim").length

  function exportCsv() {
    const header = ["fullName", "email", "phone", "intent", "welcomeEmailSent", "createdAt"]
    const rows = filtered.map((s) =>
      [
        s.fullName || "",
        s.email || "",
        s.phone || "",
        s.intent || "",
        s.welcomeEmailSent ? "yes" : "no",
        s.createdAt || "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    )
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `reloved-waitlist-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">Waitlist</h1>
          <p className="text-foreground-muted mt-2 max-w-2xl">
            Coming-soon signups from reloved.digital (email + mobile, Donate / Claim preference).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" type="button" onClick={exportCsv} disabled={filtered.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Total</p>
            <p className="text-2xl font-display font-black tabular-nums mt-1">{signups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Donate</p>
            <p className="text-2xl font-display font-black tabular-nums mt-1">{donateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Claim</p>
            <p className="text-2xl font-display font-black tabular-nums mt-1">{claimCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone…"
          className="h-12 flex-1 bg-background px-4 text-sm font-medium border-2 border-foreground rounded-none placeholder:text-foreground-muted/60 focus:outline-none focus:bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] focus:shadow-[4px_4px_0px_rgba(0,0,0,1)] transition-all"
        />
        <div className="flex gap-2">
          {(["all", "donate", "claim"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
                filter === key
                  ? "bg-foreground text-background shadow-none translate-x-[2px] translate-y-[2px]"
                  : "bg-white text-foreground shadow-[3px_3px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px]"
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm font-bold text-accent-red border-2 border-accent-red px-3 py-2">{error}</p>
      )}

      {loading ? (
        <p className="text-foreground-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground-muted text-sm">No waitlist signups match.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-display font-black uppercase truncate">
                      {s.fullName?.trim() || "No name"}
                    </p>
                    <span
                      className={`px-2 py-0.5 border-2 border-foreground text-[10px] font-black uppercase tracking-widest ${
                        s.intent === "donate" ? "bg-accent-green text-foreground" : "bg-accent-yellow text-foreground"
                      }`}
                    >
                      {s.intent || "—"}
                    </span>
                    {s.welcomeEmailSent ? (
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Email sent
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-accent-red">
                        Email pending
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground-muted mt-1 break-all">
                    {s.email} · {s.phone}
                  </p>
                  <p className="text-xs text-foreground-muted mt-0.5">{formatWhen(s.createdAt)}</p>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => window.open(`mailto:${s.email}`, "_self")}
                  >
                    Email
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() =>
                      window.open(
                        `https://wa.me/91${String(s.phone || "").replace(/\D/g, "").slice(-10)}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
