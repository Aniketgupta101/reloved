import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

interface Message {
  id: string
  name: string
  email: string
  phone: string | null
  subject: string
  message: string
  status: string
  createdAt: string
}

export function AdminMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Messages</h1>
        <p className="text-foreground-muted mt-2">Contact form submissions from the public site.</p>
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : messages.length === 0 ? (
        <p className="text-foreground-muted">No messages yet.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {messages.map(msg => (
            <Card key={msg.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="font-display font-black uppercase">{msg.subject}</p>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">{msg.status}</span>
                </div>
                <p className="text-sm text-foreground-muted">{msg.name} &bull; {msg.email}{msg.phone ? ` • ${msg.phone}` : ""}</p>
                <p className="text-sm">{msg.message}</p>
                <p className="text-xs text-foreground-muted">{new Date(msg.createdAt).toLocaleString()}</p>
                {msg.status === "new" && (
                  <div className="flex gap-2 pt-2 border-t-2 border-foreground/10">
                    <Button size="sm" variant="secondary" onClick={() => setStatus(msg.id, "actioned")}>Mark actioned</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
