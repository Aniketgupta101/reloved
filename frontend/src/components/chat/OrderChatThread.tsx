import { useEffect, useRef, useState } from "react"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/Button"
import { MessageCircle, Send } from "lucide-react"

interface ThreadMessage {
  id: string
  senderRole: "donor" | "claimer" | "admin" | "system"
  senderName: string
  text: string
  quickReplyKey: string | null
  createdAt: string | null
}

interface ThreadSummary {
  id: string
  itemTitle: string
  unreadForAdmin: boolean
  unreadForOwner: boolean
}

interface OpenThreadResponse {
  thread: ThreadSummary
  messages: ThreadMessage[]
  quickQuestions?: { key: string; label: string }[]
}

const POLL_MS = 6000

/**
 * Chat panel for one approved donation/claim, mounted on both the donor
 * dashboard and the matching admin card. `client` picks which token/API base
 * to use — the two sides share the same thread via subjectType+subjectId.
 */
export function OrderChatThread({
  subjectType,
  subjectId,
  client,
  defaultOpen = false,
  hasUnread = false,
}: {
  subjectType: "donation" | "claim"
  subjectId: string
  client: "donor" | "admin"
  defaultOpen?: boolean
  /** Server-known unread flag before the thread is opened (admin list cards). */
  hasUnread?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [loading, setLoading] = useState(false)
  const [thread, setThread] = useState<ThreadSummary | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [quickQuestions, setQuickQuestions] = useState<{ key: string; label: string }[]>([])
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const apiClient = client === "donor" ? api.donor : api.admin
  const basePath = client === "donor" ? "/api/donor" : "/api/admin"

  async function openThread() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.post<OpenThreadResponse>(`${basePath}/threads/open`, { subjectType, subjectId })
      setThread(res.thread)
      setMessages(res.messages)
      if (res.quickQuestions) setQuickQuestions(res.quickQuestions)
    } catch (err: any) {
      setError(err?.message || "Couldn't open chat")
    } finally {
      setLoading(false)
    }
  }

  async function refresh(threadId: string) {
    try {
      const res = await apiClient.get<OpenThreadResponse>(`${basePath}/threads/${threadId}`)
      setThread(res.thread)
      setMessages(res.messages)
      if (res.quickQuestions) setQuickQuestions(res.quickQuestions)
    } catch {
      // silent — next poll retries
    }
  }

  useEffect(() => {
    if (!open) return
    if (!thread) {
      openThread()
      return
    }
    const id = window.setInterval(() => refresh(thread.id), POLL_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thread?.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send(text: string, quickReplyKey?: string) {
    if (!thread || !text.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await apiClient.post<OpenThreadResponse>(`${basePath}/threads/${thread.id}/messages`, {
        text: text.trim(),
        ...(quickReplyKey ? { quickReplyKey } : {}),
      })
      setThread(res.thread)
      setMessages(res.messages)
      setDraft("")
    } catch (err: any) {
      setError(err?.message || "Couldn't send message")
    } finally {
      setSending(false)
    }
  }

  const unread =
    (client === "admin" ? thread?.unreadForAdmin : thread?.unreadForOwner) || (!thread && hasUnread)

  if (!open) {
    return (
      <Button size="sm" variant="outline" type="button" onClick={() => setOpen(true)} className="relative">
        <MessageCircle size={14} className="mr-1.5" />
        {client === "donor" ? "Message Reloved" : "Message user"}
        {unread ? (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent-green border border-foreground" />
        ) : null}
      </Button>
    )
  }

  return (
    <div className="border-2 border-foreground bg-white flex flex-col w-full shadow-[4px_4px_0px_rgba(0,0,0,1)]">
      <div className="flex items-start justify-between gap-3 border-b-2 border-foreground px-4 py-3 bg-accent-green/15">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest flex items-center gap-1.5">
            <MessageCircle size={14} />
            {client === "donor" ? "Chat with Reloved" : "Message user"}
          </p>
          <p className="text-[11px] text-foreground-muted font-medium mt-0.5 leading-snug">
            {client === "donor"
              ? "Ask anything — quick answers auto-reply; our team also replies here."
              : "Two-way chat. You can message first; they see it on their claim or gift page."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[10px] font-black uppercase tracking-widest shrink-0 px-2 py-1 border-2 border-foreground bg-white hover:bg-surface-muted"
        >
          Close
        </button>
      </div>

      <div ref={scrollRef} className="flex flex-col gap-3 p-4 min-h-[220px] max-h-[340px] overflow-y-auto bg-[#faf8f5]">
        {loading && <p className="text-xs text-foreground-muted">Loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="text-xs text-foreground-muted text-center py-6 px-2">
            {client === "donor"
              ? "No messages yet. Tap a quick question below or write your own."
              : "No messages yet. Send the first reply below."}
          </p>
        )}
        {messages.map((m) => {
          const isOwn =
            client === "donor" ? m.senderRole === "donor" || m.senderRole === "claimer" : m.senderRole === "admin"
          const isSystem = m.senderRole === "system"
          const displayName =
            m.senderRole === "admin" || m.senderRole === "system"
              ? "Reloved"
              : m.senderName
          return (
            <div key={m.id} className={`flex ${isSystem ? "justify-center" : isOwn ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[88%] px-3.5 py-2 text-sm leading-snug ${
                  isSystem
                    ? "bg-white/80 border border-foreground/15 text-foreground-muted text-center text-xs italic max-w-[95%]"
                    : isOwn
                      ? "bg-accent-green border-2 border-foreground font-medium shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                      : "bg-white border-2 border-foreground font-medium shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                }`}
              >
                {!isSystem && (
                  <p className="font-black uppercase tracking-widest text-[9px] mb-1 opacity-70">{displayName}</p>
                )}
                {m.text}
              </div>
            </div>
          )
        })}
      </div>

      {client === "donor" && quickQuestions.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-t border-foreground/10 bg-white">
          {quickQuestions.map((q) => (
            <button
              key={q.key}
              type="button"
              disabled={sending}
              onClick={() => send(q.label, q.key)}
              className="text-[11px] font-bold px-3 py-1.5 border-2 border-foreground bg-surface-muted hover:bg-accent-blue/15 disabled:opacity-50 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-bold text-accent-red px-4 pb-1">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
        className="flex gap-2 border-t-2 border-foreground p-3 bg-white"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={client === "donor" ? "Write Reloved a message…" : "Reply to the user…"}
          maxLength={1000}
          className="flex-1 h-11 px-3 text-sm border-2 border-foreground bg-background focus:outline-none focus:bg-white"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          aria-label="Send message"
          className="h-11 w-11 flex items-center justify-center border-2 border-foreground bg-foreground text-background disabled:opacity-50 hover:opacity-90"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
