import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { HelpCircle, X, Send } from "lucide-react"
import { FAQ_GROUPS, type FaqItem } from "@/data/faqContent"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { api } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"

interface UiMessage {
  from: "user" | "bot" | "admin"
  content: React.ReactNode
  id?: string
}

interface ThreadMessage {
  id: string
  senderRole: "donor" | "claimer" | "admin" | "system"
  senderName: string
  text: string
  createdAt: string | null
}

interface OpenThreadResponse {
  thread: { id: string; unreadForOwner?: boolean }
  messages: ThreadMessage[]
}

const GREETING: UiMessage = {
  from: "bot",
  content: "Hi! Pick a preset below, or type a message — Reloved replies here in this chat.",
}

const SUGGESTED_QUESTIONS = [
  "Where is my order?",
  "What is the status of my claim?",
  "How does delivery / handover work?",
]

const POLL_MS = 5000

function findExactFaq(query: string): FaqItem | null {
  const q = query.trim().toLowerCase()
  for (const group of FAQ_GROUPS) {
    for (const item of group.items) {
      if (item.q.toLowerCase() === q) return item
    }
  }
  return null
}

function presetAnswer(query: string): UiMessage {
  const exact = findExactFaq(query)
  if (exact) {
    return { from: "bot", content: <><strong>{exact.q}</strong><div className="mt-1">{exact.a}</div></> }
  }
  const lower = query.toLowerCase()
  if (lower.includes("where is my order") || lower.includes("status")) {
    return {
      from: "bot",
      content: (
        <>
          Open <Link to="/account" className="underline font-bold">My account</Link> → Claims / Gifts to see live status
          (Available → Being Matched → Claimed → Reloved). Emails also go out for key updates.
        </>
      ),
    }
  }
  if (lower.includes("delivery") || lower.includes("handover")) {
    return {
      from: "bot",
      content:
        "After a match, use in-app chat to coordinate. Options are gate pickup, giver-send within ~3 km, or Shiprocket courier. Exact flats stay private.",
    }
  }
  return {
    from: "bot",
    content: (
      <>
        Please pick a preset, or send a short message below so Reloved can reply here.
      </>
    ),
  }
}

function threadToUi(messages: ThreadMessage[]): UiMessage[] {
  return messages.map((m) => {
    if (m.senderRole === "admin" || m.senderRole === "system") {
      return { id: m.id, from: "admin", content: m.text }
    }
    return { id: m.id, from: "user", content: m.text }
  })
}

export function FloatingHelpButton() {
  const signedIn = !!getDonorToken()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<UiMessage[]>([GREETING])
  const [showPresets, setShowPresets] = useState(true)
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, open, showPresets])

  async function ensureThread(): Promise<string | null> {
    if (!getDonorToken()) return null
    if (threadId) return threadId
    const res = await api.donor.post<OpenThreadResponse>("/api/donor/threads/open", {
      subjectType: "support",
      subjectId: "me",
    })
    setThreadId(res.thread.id)
    const remote = threadToUi(res.messages)
    setMessages((prev) => {
      const greeting = prev.find((m) => !m.id) || GREETING
      return remote.length ? [greeting, ...remote] : [greeting]
    })
    return res.thread.id
  }

  async function refreshThread(id: string) {
    try {
      const res = await api.donor.get<OpenThreadResponse>(`/api/donor/threads/${id}`)
      const remote = threadToUi(res.messages)
      setMessages((prev) => {
        const localOnly = prev.filter((m) => !m.id && m.from === "bot")
        const head = localOnly[0] || GREETING
        return remote.length ? [head, ...remote] : [head]
      })
    } catch {
      // next poll retries
    }
  }

  useEffect(() => {
    if (!open || !getDonorToken()) return
    let cancelled = false
    void (async () => {
      try {
        const id = await ensureThread()
        if (cancelled || !id) return
      } catch {
        // presets still work offline of chat
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open || !threadId) return
    const id = window.setInterval(() => void refreshThread(threadId), POLL_MS)
    return () => window.clearInterval(id)
  }, [open, threadId])

  function submitQuestion(query: string) {
    if (!query) return
    track(AnalyticsEvent.helpQuestionAsked, {
      query: query.slice(0, 120),
      matched: true,
      matched_q: query.slice(0, 120),
    })
    setShowPresets(false)
    setMessages((prev) => [...prev, { from: "user", content: query }, presetAnswer(query)])
  }

  async function sendToTeam() {
    const text = note.trim()
    if (text.length < 2) {
      setFormError("Type a short message.")
      return
    }
    if (!getDonorToken()) {
      setFormError("Sign in to chat with Reloved.")
      return
    }

    setFormError(null)
    setSending(true)
    setShowPresets(false)
    setNote("")

    try {
      const id = await ensureThread()
      if (!id) throw new Error("Couldn't open chat")
      const res = await api.donor.post<OpenThreadResponse>(`/api/donor/threads/${id}/messages`, { text })
      setThreadId(res.thread.id)
      const remote = threadToUi(res.messages)
      setMessages((prev) => {
        const head = prev.find((m) => !m.id && m.from === "bot") || GREETING
        return [head, ...remote]
      })
      track(AnalyticsEvent.helpContactCta, { source: "help_chat_thread" })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Couldn't send"
      setMessages((prev) => [
        ...prev,
        { from: "user", content: text },
        {
          from: "bot",
          content: (
            <>
              Couldn&apos;t send ({msg}). Try again or use{" "}
              <Link to="/contact" className="underline font-bold">Contact</Link>.
            </>
          ),
        },
      ])
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {open && (
        <div
          className="floating-help-panel fixed z-40 w-[calc(100vw-1.5rem-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px))] max-w-md sm:max-w-lg h-[min(36rem,78dvh)] sm:h-[min(40rem,80dvh)] flex flex-col bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]"
          style={{
            bottom: "max(5.5rem, calc(env(safe-area-inset-bottom, 0px) + 4.5rem))",
            right: "max(0.75rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground bg-foreground text-white shrink-0">
            <span className="font-display font-black uppercase text-sm tracking-wide">Ask Reloved</span>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                track(AnalyticsEvent.helpClosed, { source: "help_chat_header" })
              }}
              aria-label="Close"
              className="p-1"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={m.id || i}
                className={`text-sm leading-relaxed max-w-[85%] px-3 py-2 border-2 border-foreground ${
                  m.from === "user"
                    ? "bg-accent-pink self-end font-bold"
                    : m.from === "admin"
                      ? "bg-accent-green/25 self-start"
                      : "bg-surface-muted self-start"
                }`}
              >
                {m.from === "admin" && (
                  <p className="font-black uppercase tracking-widest text-[9px] mb-1 opacity-70">Reloved</p>
                )}
                {m.content}
              </div>
            ))}

            {showPresets && (
              <div className="flex flex-col gap-2 self-start max-w-[95%] w-full">
                <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                  Preset questions
                </span>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => submitQuestion(q)}
                    className="text-left text-xs sm:text-sm font-bold px-3 py-2.5 border-2 border-foreground bg-white hover:bg-accent-pink transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {!showPresets && (
              <button
                type="button"
                onClick={() => setShowPresets(true)}
                className="self-start text-[10px] font-black uppercase tracking-widest text-foreground-muted underline"
              >
                Show presets again
              </button>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t-2 border-foreground shrink-0 p-3 flex flex-col gap-2">
            <div className="flex items-stretch gap-2">
              <input
                value={note}
                onChange={(e) => {
                  setNote(e.target.value)
                  if (formError) setFormError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    void sendToTeam()
                  }
                }}
                placeholder={signedIn ? "Type your message…" : "Sign in to message Reloved…"}
                className="flex-1 px-3 py-2.5 text-sm outline-none border-2 border-foreground"
                disabled={sending}
              />
              <button
                type="button"
                aria-label="Send message"
                disabled={sending}
                onClick={() => void sendToTeam()}
                className="px-3.5 bg-accent-pink border-2 border-foreground disabled:opacity-50"
              >
                <Send size={16} className="stroke-[2.5]" />
              </button>
            </div>
            {formError && (
              <p className="text-xs font-bold text-accent-red" data-testid="help-escalate-warn">
                {formError}{" "}
                {!signedIn && (
                  <Link to="/account/login" className="underline">
                    Sign in
                  </Link>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v
            track(next ? AnalyticsEvent.helpOpened : AnalyticsEvent.helpClosed, { source: "floating_button" })
            return next
          })
        }}
        aria-label={open ? "Close help" : "Open help"}
        className="floating-help-btn fixed z-40 w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center bg-accent-pink border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
        style={{
          bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
          right: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        {open ? <X size={24} className="stroke-[2.5] text-foreground" /> : <HelpCircle size={24} className="stroke-[2.5] text-foreground" />}
      </button>
    </>
  )
}
