import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import { claimRequestStatusLabel, handoverStageLabel } from "@/lib/adminStatusLabels"

interface PeerThreadRow {
  id: string
  subjectId: string
  itemTitle: string
  giverName: string
  claimerName: string
  lastMessageAt: string | null
  lastMessagePreview: string
  unreadForAdmin: boolean
  claimStatus: string | null
  handoverStage: string | null
  hasMessages: boolean
}

export function AdminPeerChats() {
  const [threads, setThreads] = useState<PeerThreadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      // Prefer /peer-chats (cache-bust older CDN 404s on /peer-threads).
      const res = await api.admin.get<{ threads: PeerThreadRow[] }>("/api/admin/peer-chats")
      setThreads(res.threads || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load peer chats"
      // Fallback for mid-deploy / cached 404 on the new path name.
      if (/404|failed \(404\)/i.test(msg)) {
        try {
          const res = await api.admin.get<{ threads: PeerThreadRow[] }>("/api/admin/peer-threads")
          setThreads(res.threads || [])
          setError(null)
          return
        } catch (err2: unknown) {
          setError(err2 instanceof Error ? err2.message : msg)
          return
        }
      }
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full min-w-0">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Peer chats</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl text-sm">
          End-to-end giver ↔ claimer chats after a match. Use this to spot abuse or handover issues.
          Read-only here — if you need to intervene, message either party from{" "}
          <Link to="/admin/item-requests" className="underline font-bold text-foreground">
            Claims
          </Link>
          .
        </p>
      </div>

      {error && (
        <p className="text-sm font-bold text-accent-red border-2 border-accent-red px-3 py-2">{error}</p>
      )}

      {loading && threads.length === 0 ? (
        <p className="text-foreground-muted">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="text-foreground-muted">
          No giver ↔ claimer threads yet. They appear once a claim is matched and either party opens{" "}
          <strong>Chat with giver / receiver</strong>.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {threads.map((t) => {
            const isOpen = openId === t.id
            return (
              <Card key={t.id} className="overflow-hidden">
                <CardContent className="p-4 sm:p-5 flex flex-col gap-3 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-black uppercase text-base leading-tight break-words">
                          {t.itemTitle || "Item"}
                        </p>
                        {t.unreadForAdmin && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-2 border-foreground bg-accent-green">
                            New activity
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground-muted">
                        <span className="font-bold text-foreground">{t.giverName}</span>
                        {" ↔ "}
                        <span className="font-bold text-foreground">{t.claimerName}</span>
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {t.claimStatus ? claimRequestStatusLabel(t.claimStatus) : "—"}
                        {t.handoverStage ? ` · ${handoverStageLabel(t.handoverStage)}` : ""}
                        {t.lastMessageAt ? ` · ${new Date(t.lastMessageAt).toLocaleString()}` : ""}
                      </p>
                      {t.lastMessagePreview ? (
                        <p className="text-sm line-clamp-2 mt-0.5">&ldquo;{t.lastMessagePreview}&rdquo;</p>
                      ) : (
                        <p className="text-xs text-foreground-muted italic">No messages yet</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <Link
                        to={`/admin/item-requests`}
                        className="inline-flex items-center px-3 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-foreground bg-white hover:bg-surface-muted"
                      >
                        Open Claims
                      </Link>
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : t.id)}
                        className="inline-flex items-center px-3 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-foreground bg-accent-pink hover:bg-accent-pink/80"
                      >
                        {isOpen ? "Hide transcript" : "View full chat"}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <OrderChatThread
                      key={t.id}
                      subjectType="peer"
                      subjectId={t.subjectId}
                      client="admin"
                      defaultOpen
                      readOnly
                      hasUnread={t.unreadForAdmin}
                      title={`${t.giverName} ↔ ${t.claimerName}`}
                      subtitle={`Full end-to-end transcript for “${t.itemTitle}”.`}
                    />
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
