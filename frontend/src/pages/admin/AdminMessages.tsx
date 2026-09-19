import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { Textarea } from "@/components/ui/Textarea"

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

export function AdminMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const { messages } = await api.admin.get<{ messages: Message[] }>("/api/admin/contact-messages")
      setMessages(messages)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function setStatus(id: string, status: string) {
    await api.admin.patch(`/api/admin/contact-messages/${id}`, { status })
    load()
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
          Contact-form submissions from the public website (general help / press / partnerships).
        </p>
        <p className="mt-2 text-sm font-medium border-2 border-foreground bg-surface-muted px-3 py-2.5 max-w-2xl">
          Reply here emails the sender. This is <strong>not</strong> Give/Claim chat — for handover chats open{" "}
          <strong>Gives</strong> or <strong>Claims</strong> and click <strong>Message user</strong>.
        </p>
      </div>

      {error && <p className="text-sm font-bold text-accent-red border-2 border-accent-red px-3 py-2">{error}</p>}

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : messages.length === 0 ? (
        <p className="text-foreground-muted">No messages yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map(msg => (
            <Card key={msg.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display font-black uppercase">{msg.subject}</p>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white shrink-0">{msg.status}</span>
                </div>
                <p className="text-sm text-foreground-muted">
                  {msg.name} &bull;{" "}
                  <a className="underline font-bold text-foreground" href={`mailto:${msg.email}?subject=${encodeURIComponent("Re: " + msg.subject)}`}>
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
                      {sendingId === msg.id ? "Sending…" : "Reply by email"}
                    </Button>
                    {msg.status === "new" && (
                      <Button size="sm" variant="secondary" onClick={() => setStatus(msg.id, "actioned")}>
                        Mark actioned
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
