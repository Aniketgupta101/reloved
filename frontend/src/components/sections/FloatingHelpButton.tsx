import { useState } from "react"
import { Link } from "react-router-dom"
import { HelpCircle, X, Send } from "lucide-react"
import { FAQ_GROUPS, extractText, type FaqItem } from "@/data/faqContent"
import { AnalyticsEvent, track } from "@/lib/analytics"

interface Message {
  from: "user" | "bot"
  content: React.ReactNode
}

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "do", "does", "i", "my", "to", "for", "and", "of", "in", "on",
  "with", "can", "will", "how", "what", "need", "about", "you", "your", "it", "if", "or", "me",
])

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

// Word-boundary regex, so "cat" scores against "category" only at a word start,
// not as a raw substring anywhere (avoids false-positive matches mid-word).
function topMatches(query: string, limit: number): FaqItem[] {
  const tokens = tokenize(query)
  if (!tokens.length) return []
  const patterns = tokens.map((t) => new RegExp(`\\b${t}`))
  const scored: { item: FaqItem; score: number }[] = []
  for (const group of FAQ_GROUPS) {
    for (const item of group.items) {
      const haystack = (item.q + " " + extractText(item.a)).toLowerCase()
      const score = patterns.reduce((n, re) => n + (re.test(haystack) ? 1 : 0), 0)
      if (score > 0) scored.push({ item, score })
    }
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item)
}

function findBestMatch(query: string): FaqItem | null {
  return topMatches(query, 1)[0] ?? null
}

const GREETING: Message = {
  from: "bot",
  content: "Hi! Ask me anything about giving, claiming, your account, or tracking a donation.",
}

// Exact FAQ question text, so clicking a chip guarantees a real match.
const SUGGESTED_QUESTIONS = [
  "How do I give an item?",
  "How many items can I claim?",
  "Do I need a password?",
]

function faqReply(query: string): Message {
  const match = findBestMatch(query)
  return match
    ? { from: "bot", content: <><strong>{match.q}</strong><div className="mt-1">{match.a}</div></> }
    : {
        from: "bot",
        content: (
          <>
            I couldn&apos;t find a good match for that. Try the{" "}
            <Link to="/faq" className="underline font-bold" onClick={() => track(AnalyticsEvent.footerLink, { label: "FAQs", path: "/faq", source: "help_chat" })}>FAQs</Link>, or{" "}
            <Link to="/contact" className="underline font-bold" onClick={() => track(AnalyticsEvent.helpContactCta, { source: "help_chat" })}>contact us</Link> directly.
          </>
        ),
      }
}

export function FloatingHelpButton() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState("")
  const [lastMatched, setLastMatched] = useState(true)

  const liveSuggestions = input.trim().length >= 2 ? topMatches(input, 4) : []

  function submitQuestion(query: string) {
    if (!query) return
    const match = findBestMatch(query)
    track(AnalyticsEvent.helpQuestionAsked, {
      query: query.slice(0, 120),
      matched: Boolean(match),
      matched_q: match?.q?.slice(0, 120),
    })
    setMessages((prev) => [...prev, { from: "user", content: query }, faqReply(query)])
    setLastMatched(Boolean(match))
    setInput("")
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    submitQuestion(input.trim())
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-5 z-40 w-[calc(100vw-2.5rem)] max-w-sm h-[28rem] max-h-[70vh] flex flex-col bg-white border-2 border-foreground shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between px-4 py-3 border-b-2 border-foreground bg-foreground text-white shrink-0">
            <span className="font-display font-black uppercase text-sm tracking-wide">Ask reloved</span>
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
            {(messages.length === 1 || !lastMatched) && (
              <div className="flex flex-col gap-2 self-start max-w-[95%]">
                {!lastMatched && messages.length > 1 && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">Try asking</span>
                )}
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
            )}
          </div>

          {liveSuggestions.length > 0 && (
            <div className="border-t-2 border-foreground bg-surface-muted px-2 py-2 flex flex-col gap-1 max-h-32 overflow-y-auto shrink-0">
              {liveSuggestions.map((item) => (
                <button
                  key={item.q}
                  type="button"
                  onClick={() => submitQuestion(item.q)}
                  className="text-left text-xs font-bold px-2 py-1.5 hover:bg-white border border-transparent hover:border-foreground transition-colors truncate"
                >
                  {item.q}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-stretch border-t-2 border-foreground shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your question..."
              className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <button type="submit" aria-label="Send" className="px-3 bg-accent-pink border-l-2 border-foreground">
              <Send size={16} className="stroke-[2.5]" />
            </button>
          </form>
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
