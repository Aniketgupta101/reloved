import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Textarea } from "@/components/ui/Textarea"
import { OrderChatThread } from "@/components/chat/OrderChatThread"

interface Message {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  status: string
  createdAt: string
  adminReply?: string | null
  repliedAt?: string | null
}

interface SupportThread {
  id: string
  subjectId: string
  ownerName: string
  ownerEmail: string | null
  ownerTarget: string | null
  lastMessageAt: string | null
  lastMessagePreview: string
  unreadForAdmin: boolean
  hasMessages: boolean
}

export function AdminMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [supportThreads, setSupportThreads] = useState<SupportThread[]>([])
  const [loading, setLoading] = useState(true)
  const [openSupportId, setOpenSupportId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [contact, support] = await Promise.all([
        api.admin.get<{ messages: Message[] }>("/api/admin/contact-messages"),
        api.admin.get<{ threads: SupportThread[] }>("/api/admin/support-chats").catch(() => ({ threads: [] })),
      ])
      setMessages(contact.messages)
      setSupportThreads(support.threads || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    const id = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(id)
  }, [])

  async function setStatus(id: string, status: string) {
    await api.admin.patch(`/api/admin/contact-messages/${id}`, { status })
    void load()
  }

  async function sendReply(id: string) {
    const reply = (replyDrafts[id] || "").trim()
    if (reply.length < 2) {
      setError("Write a reply before sending.")
      return
    }
    setSendingId(id)
    setError(null)
    try {
      await api.admin.post(`/api/admin/contact-messages/${id}/reply`, { reply })
      setReplyDrafts((prev) => ({ ...prev, [id]: "" }))
      await load()
    } catch (err: any) {
      setError(err?.message || "Failed to send reply email.")
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Contact</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl">
          <strong>Ask Reloved</strong> live chats (reply in the popup) and website contact-form emails.
        </p>
        <p className="mt-2 text-sm font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5 max-w-2xl">
          Help chats appear in the visitor&apos;s Ask Reloved popup. Contact-form rows still reply by email.
          Give/Claim handover chat is on <strong>Gives</strong> / <strong>Claims</strong>.
        </p>
      </div>

      {error && <p className="text-sm font-bold text-accent-red border-2 border-accent-red px-3 py-2">{error}</p>}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-display font-black uppercase tracking-tight">Ask Reloved chats</h2>
        {loading && supportThreads.length === 0 ? (
          <p className="text-foreground-muted">Loading…</p>
        ) : supportThreads.length === 0 ? (
          <p className="text-foreground-muted text-sm">
            No help chats yet. They appear when a signed-in visitor messages from Ask Reloved.
          </p>
        ) : (
          supportThreads.map((t) => {
            const open = openSupportId === t.id
            const openKey = String(t.ownerTarget || t.subjectId)
            return (
              <Card key={t.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-black uppercase">{t.ownerName || "Visitor"}</p>
                        {t.unreadForAdmin && (
                          <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-2 border-foreground bg-accent-green">
                            New
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground-muted">{t.ownerEmail || t.ownerTarget || "—"}</p>
                      {t.lastMessagePreview ? (
                        <p className="text-sm mt-1 line-clamp-2">&ldquo;{t.lastMessagePreview}&rdquo;</p>
                      ) : null}
                      <p className="text-xs text-foreground-muted mt-1">
                        {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleString() : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenSupportId(open ? null : t.id)}
                      className="shrink-0 px-3 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-foreground bg-accent-pink"
                    >
                      {open ? "Hide chat" : "Reply in popup chat"}
                    </button>
                  </div>
                  {open && (
                    <OrderChatThread
                      key={t.id}
                      subjectType="support"
                      subjectId={openKey}
                      client="admin"
                      defaultOpen
                      hasUnread={t.unreadForAdmin}
                      title={`Ask Reloved · ${t.ownerName}`}
                      subtitle="Your reply appears in their Ask Reloved popup."
                    />
                  )}
                </CardContent>
              </Card>
            )
          })
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-display font-black uppercase tracking-tight">Contact form (email)</h2>
        {loading && messages.length === 0 ? (
          <p className="text-foreground-muted">Loading...</p>
        ) : messages.length === 0 ? (
          <p className="text-foreground-muted">No contact-form messages yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((msg) => (
              <Card key={msg.id}>
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-black uppercase">{msg.subject || "General Inquiry"}</p>
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white shrink-0">
                      {msg.status}
                    </span>
                  </div>
                  <p className="text-sm text-foreground-muted">
                    {msg.name} &bull;{" "}
                    <a
                      className="underline font-bold text-foreground"
                      href={`mailto:${msg.email}?subject=${encodeURIComponent("Re: " + msg.subject)}`}
                    >
                      {msg.email}
                    </a>
                    {msg.phone ? ` • ${msg.phone}` : ""}
                  </p>
                  <p className="text-sm">{msg.message}</p>
                  <p className="text-xs text-foreground-muted">{new Date(msg.createdAt).toLocaleString()}</p>

                  {msg.adminReply && (
                    <div className="mt-1 border-2 border-foreground bg-accent-green/15 px-3 py-2 text-sm">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-1">Your reply (emailed)</p>
                      <p>{msg.adminReply}</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2 pt-2 border-t-2 border-foreground/10">
                    <Textarea
                      value={replyDrafts[msg.id] || ""}
                      onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [msg.id]: e.target.value }))}
                      placeholder="Type your reply — this emails them…"
                      className="rounded-none border-2 border-foreground min-h-[80px]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="cta"
                        disabled={sendingId === msg.id || !(replyDrafts[msg.id] || "").trim()}
                        onClick={() => void sendReply(msg.id)}
                      >
                        {sendingId === msg.id ? "Sending…" : "Email reply"}
                      </Button>
                      {msg.status !== "actioned" && (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(msg.id, "actioned")}>
                          Mark done
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
