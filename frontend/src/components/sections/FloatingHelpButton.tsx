import { useState } from "react"
import { Link } from "react-router-dom"
import { HelpCircle, X, Send } from "lucide-react"
import { FAQ_GROUPS, type FaqItem } from "@/data/faqContent"
import { AnalyticsEvent, track } from "@/lib/analytics"
import { api } from "@/lib/api"

interface Message {
  from: "user" | "bot"
  content: React.ReactNode
}

function findExactFaq(query: string): FaqItem | null {
  const q = query.trim().toLowerCase()
  for (const group of FAQ_GROUPS) {
    for (const item of group.items) {
      if (item.q.toLowerCase() === q) return item
    }
  }
  return null
}

const GREETING: Message = {
  from: "bot",
  content:
    "Hi! Pick a preset question below. Reloved support is human-backed — if you still need help, escalate and our team gets an email.",
}

// Launch support = preset questions only (not an open AI bot).
const SUGGESTED_QUESTIONS = [
  "Where is my order?",
  "What is the status of my claim?",
  "How does delivery / handover work?",
  "How do I contact Reloved?",
  "How do I give an item?",
  "How many items can I claim?",
]

function presetAnswer(query: string): Message {
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
          (Available → Claimed → Handed over → Reloved). Emails also go out for key updates.
        </>
      ),
    }
  }
  if (lower.includes("delivery") || lower.includes("handover")) {
    return {
      from: "bot",
      content:
        "After a match, use in-app chat to coordinate. Options are gate pickup, giver-send within ~3 km, or prepaid Borzo (no COD). Exact flats stay private.",
    }
  }
  if (lower.includes("contact")) {
    return {
      from: "bot",
      content: (
        <>
          Email <a href="mailto:hello@reloved.digital" className="underline font-bold">hello@reloved.digital</a> or use{" "}
          <Link to="/contact" className="underline font-bold">Contact</Link>. You can also escalate from this chat.
        </>
      ),
    }
  }
  return {
    from: "bot",
    content: (
      <>
        Please pick a preset question, or{" "}
        <strong>Escalate to Reloved</strong> so a human can help by email.
      </>
    ),
  }
}

export function FloatingHelpButton() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [escalating, setEscalating] = useState(false)
  const [escalateNote, setEscalateNote] = useState("")
  const [escalated, setEscalated] = useState(false)

  function submitQuestion(query: string) {
    if (!query) return
    track(AnalyticsEvent.helpQuestionAsked, {
      query: query.slice(0, 120),
      matched: true,
      matched_q: query.slice(0, 120),
    })
    setMessages((prev) => [...prev, { from: "user", content: query }, presetAnswer(query)])
  }

  async function escalate() {
    const note = escalateNote.trim()
    if (note.length < 5) return
    setEscalating(true)
    try {
      await api.post("/api/contact", {
        name: "Reloved support chat",
        email: "support-escalation@reloved.digital",
        message: `[Support chat escalation]\n${note}`,
      })
      setEscalated(true)
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          content: "Thanks — your note was emailed to the Reloved team. We'll follow up soon.",
        },
      ])
      setEscalateNote("")
      track(AnalyticsEvent.helpContactCta, { source: "help_chat_escalate" })
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          content: (
            <>
              Couldn&apos;t send automatically. Please email{" "}
              <a href="mailto:hello@reloved.digital" className="underline font-bold">hello@reloved.digital</a> or use{" "}
              <Link to="/contact" className="underline font-bold">Contact</Link>.
            </>
          ),
        },
      ])
    } finally {
      setEscalating(false)
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm h-[28rem] max-h-[70vh] flex flex-col bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
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
                key={i}
                className={`text-sm leading-relaxed max-w-[85%] px-3 py-2 border-2 border-foreground ${
                  m.from === "bot" ? "bg-surface-muted self-start" : "bg-accent-pink self-end font-bold"
                }`}
              >
                {m.content}
              </div>
            ))}
            <div className="flex flex-col gap-2 self-start max-w-[95%]">
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Preset questions</span>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => submitQuestion(q)}
                  className="text-left text-xs font-bold px-3 py-2 border-2 border-foreground bg-white hover:bg-accent-pink transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t-2 border-foreground shrink-0 p-3 flex flex-col gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest">Escalate to human (email)</label>
            <div className="flex items-stretch gap-2">
              <input
                value={escalateNote}
                onChange={(e) => setEscalateNote(e.target.value)}
                placeholder="Short note for Reloved team..."
                className="flex-1 px-3 py-2 text-sm outline-none border-2 border-foreground"
                disabled={escalated}
              />
              <button
                type="button"
                aria-label="Escalate"
                disabled={escalating || escalated || escalateNote.trim().length < 5}
                onClick={escalate}
                className="px-3 bg-accent-pink border-2 border-foreground disabled:opacity-50"
              >
                <Send size={16} className="stroke-[2.5]" />
              </button>
            </div>
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
        className="fixed bottom-5 right-5 z-40 w-14 h-14 flex items-center justify-center bg-accent-pink border-2 border-foreground shadow-[4px_4px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
      >
        {open ? <X size={24} className="stroke-[2.5] text-foreground" /> : <HelpCircle size={24} className="stroke-[2.5] text-foreground" />}
      </button>
    </>
  )
}
