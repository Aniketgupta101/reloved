import { useEffect, useState } from "react"
import { api, resolveImageUrl } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { SafeImage } from "@/components/ui/SafeImage"
import { OrderChatThread } from "@/components/chat/OrderChatThread"
import { submissionStatusLabel, categoryDisplayLabel, genderAudienceLabel } from "@/lib/adminStatusLabels"
import { formatWallLocality } from "@/lib/formatLocality"
import { NoticeModal, type NoticeState } from "@/components/ui/NoticeModal"

interface Submission {
  id: string
  reference: string
  donorFirstName: string
  donorLastName: string | null
  phone: string
  locality: string
  status: string
  submittedAt: string
  unreadChat?: boolean
  items: { id: string; title: string; category: string; gender: string | null; status: string; images: { storagePath: string }[] }[]
}

const STATUS_FILTERS = ["submitted", "under_review", "approved", "rejected", "all"] as const
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Declined",
  all: "All",
}

export function AdminDonations() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState<(typeof STATUS_FILTERS)[number]>("all")
  const [loading, setLoading] = useState(true)
  const [actingId, setActingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  async function load() {
    setLoading(true)
    try {
      const qs = filter !== "all" ? `?status=${filter}` : ""
      const { submissions } = await api.admin.get<{ submissions: Submission[] }>(`/api/admin/submissions${qs}`)
      const list = (submissions || []).filter((s) => s.status !== "withdrawn")
      // Surface unread chats first so "badge says 2" is not an empty Submitted filter.
      list.sort((a, b) => Number(!!b.unreadChat) - Number(!!a.unreadChat))
      setSubmissions(list)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function setStatus(id: string, status: string) {
    setActingId(id)
    try {
      await api.admin.patch(`/api/admin/submissions/${id}`, { status })
      await load()
    } catch (err: any) {
      setNotice({
        title: "Update failed",
        body: err?.message || "Failed to update status",
        tone: "error",
      })
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Gives</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl">
          Review items people Give. New Gives auto-publish — open <strong>All</strong> or <strong>Approved</strong> to see them.
          Green chat dots = unread Reloved chat (check Message user).
        </p>
        <ol className="mt-3 list-decimal pl-5 text-sm font-medium space-y-1 text-foreground/90 max-w-2xl">
          <li>
            <strong>Submitted</strong> — Approve to publish on the Wall, Mark reviewing while you check photos, or Decline.
          </li>
          <li>
            <strong>Message user</strong> — Two-way chat with the giver. Green dot = unread message from them.
          </li>
          <li>
            <strong>Courier / Borzo</strong> — Book from <strong>Claims</strong> only when handover is <strong>Use Borzo</strong> (not on this screen).
          </li>
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest transition-all ${
              filter === s
                ? "bg-foreground text-background"
                : "bg-white text-foreground shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
            }`}
          >
            {STATUS_FILTER_LABELS[s]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground-muted">Loading...</p>
      ) : submissions.length === 0 ? (
        <p className="text-foreground-muted">No submissions in this state.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {submissions.map(sub => (
            <Card key={sub.id}>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display font-black uppercase text-lg">{sub.donorFirstName} {sub.donorLastName || ""}</p>
                    <p className="text-sm text-foreground-muted break-words">{sub.phone} &bull; {formatWallLocality(sub.locality)}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-bold bg-surface-muted border border-foreground/20 px-2 py-1">{sub.reference}</span>
                    {sub.unreadChat && (
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-green">
                        New chat
                      </span>
                    )}
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 border-2 border-foreground bg-accent-blue text-white">
                      {submissionStatusLabel(sub.status)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {sub.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 bg-surface-muted border-2 border-foreground p-2 pr-3">
                      {item.images?.[0] && (
                        <SafeImage src={resolveImageUrl(item.images[0].storagePath)} alt={item.title} className="w-12 h-12 object-cover border border-foreground/20" />
                      )}
                      <div>
                        <p className="text-sm font-bold">{item.title}</p>
                        <p className="text-xs text-foreground-muted">
                          {categoryDisplayLabel(item.category)}
                          {item.gender && (
                            <span className="ml-1.5 px-1.5 py-0.5 border border-foreground/20 uppercase font-bold text-[10px] tracking-widest">
                              {genderAudienceLabel(item.gender)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {sub.status !== "approved" && sub.status !== "rejected" ? (
                  <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-foreground/10">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actingId === sub.id}
                      onClick={() => void setStatus(sub.id, "approved")}
                    >
                      {actingId === sub.id ? "Saving…" : "Approve"}
                    </Button>
                    {sub.status !== "under_review" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actingId === sub.id}
                        onClick={() => void setStatus(sub.id, "under_review")}
                      >
                        Mark Reviewing
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actingId === sub.id}
                      onClick={() => void setStatus(sub.id, "rejected")}
                    >
                      Decline
                    </Button>
                  </div>
                ) : sub.status === "approved" ? (
                  <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-foreground/10 items-center">
                    <span className="text-xs font-bold text-foreground-muted uppercase tracking-widest">Approved · on Wall</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actingId === sub.id}
                      onClick={() => void setStatus(sub.id, "under_review")}
                    >
                      Unpublish / review again
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actingId === sub.id}
                      onClick={() => void setStatus(sub.id, "rejected")}
                    >
                      Decline
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-2 border-t-2 border-foreground/10 items-center">
                    <span className="text-xs font-bold text-foreground-muted uppercase tracking-widest">Declined</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={actingId === sub.id}
                      onClick={() => void setStatus(sub.id, "approved")}
                    >
                      Approve anyway
                    </Button>
                  </div>
                )}

                {(sub.status === "submitted" ||
                  sub.status === "under_review" ||
                  sub.status === "pending" ||
                  sub.status === "approved") && (
                  <div className="pt-2 flex flex-col gap-2 border-t-2 border-foreground/10">
                    <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                      Two-way chat — message the giver
                    </span>
                    <OrderChatThread
                      subjectType="donation"
                      subjectId={sub.id}
                      client="admin"
                      hasUnread={!!sub.unreadChat}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {notice && (
        <NoticeModal
          title={notice.title}
          body={notice.body}
          tone={notice.tone}
          primaryLabel={notice.primaryLabel}
          onPrimary={notice.onPrimary}
          secondaryLabel={notice.secondaryLabel}
          onSecondary={notice.onSecondary}
          onClose={() => setNotice(null)}
        />
      )}
    </div>
  )
}
