import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"

type FunnelBlock = Record<string, number>
type DayRow = {
  day: string
  gives: number
  claims: number
  accounts: number
  waitlist: number
  contacts: number
  partners: number
}

interface AnalyticsPayload {
  days: number
  range: { from: string; to: string }
  shortIo?: {
    configured: boolean
    domain: string
    links: Array<{
      shortURL: string
      originalURL: string
      path: string
      title?: string
    }>
  }
  totals: FunnelBlock
  periodTotals?: FunnelBlock
  itemStatus: FunnelBlock
  claimStatus: FunnelBlock
  giveFunnel: FunnelBlock
  claimFunnel: FunnelBlock
  accountFunnel: FunnelBlock
  series: DayRow[]
  insights?: {
    supplyDemand: Array<{ label: string; given: number; claimed: number; gap: number }>
    byGender: {
      supply: Array<{ label: string; count: number }>
      demand: Array<{ label: string; count: number }>
    }
    topAreas: {
      gives: Array<{ label: string; count: number }>
      claims: Array<{ label: string; count: number }>
    }
    speed: {
      medianMatchLabel: string
      matchSampleSize: number
      medianReloveLabel: string
      reloveSampleSize: number
    }
    stuck: {
      availableOver7d: Array<{ id: string; title: string; days: number; area: string; category: string }>
      matchingOver3d: Array<{ id: string; title: string; days: number; area: string; category: string }>
      availableCount: number
      matchingCount: number
    }
    people: {
      givers: number
      claimers: number
      both: number
      giversOnly: number
      claimersOnly: number
    }
    declines: {
      rejected: number
      softDeclines: number
      withdrawn: number
      acceptRate: number | null
    }
  }
}

function CompareBars({
  title,
  subtitle,
  rows,
  leftLabel,
  rightLabel,
}: {
  title: string
  subtitle: string
  rows: Array<{ label: string; left: number; right: number }>
  leftLabel: string
  rightLabel: string
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.left, r.right]))
  return (
    <Card className="bg-white h-full">
      <CardContent className="p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-display font-black uppercase tracking-tight">{title}</h3>
          <p className="text-xs text-foreground-muted mt-1 font-medium">{subtitle}</p>
        </div>
        <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 bg-accent-pink border border-foreground" /> {leftLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 bg-accent-green border border-foreground" /> {rightLabel}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          {rows.length === 0 ? (
            <p className="text-xs text-foreground-muted">No data yet</p>
          ) : (
            rows.map((row) => (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="capitalize">{row.label}</span>
                  <span className="tabular-nums text-foreground-muted">
                    {row.left} / {row.right}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-2.5 bg-black/5 border border-foreground/15">
                    <div
                      className="h-full bg-accent-pink"
                      style={{ width: `${Math.max(row.left ? 6 : 0, Math.round((row.left / max) * 100))}%` }}
                    />
                  </div>
                  <div className="h-2.5 bg-black/5 border border-foreground/15">
                    <div
                      className="h-full bg-accent-green"
                      style={{ width: `${Math.max(row.right ? 6 : 0, Math.round((row.right / max) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RankList({
  title,
  subtitle,
  rows,
  empty = "Nothing here yet",
}: {
  title: string
  subtitle: string
  rows: Array<{ label: string; count: number }>
  empty?: string
}) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <Card className="bg-white h-full">
      <CardContent className="p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-display font-black uppercase tracking-tight">{title}</h3>
          <p className="text-xs text-foreground-muted mt-1 font-medium">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.length === 0 ? (
            <p className="text-xs text-foreground-muted">{empty}</p>
          ) : (
            rows.map((row, i) => (
              <div key={row.label} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-xs">
                  <span className="font-bold truncate">
                    <span className="text-foreground-muted mr-1">{i + 1}.</span>
                    {row.label}
                  </span>
                  <span className="font-display font-black tabular-nums">{row.count}</span>
                </div>
                <div className="h-2 bg-black/5 border border-foreground/15">
                  <div
                    className="h-full bg-foreground/80"
                    style={{ width: `${Math.max(6, Math.round((row.count / max) * 100))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function pct(part: number, whole: number): string {
  if (!whole || whole <= 0) return "—"
  return `${Math.round((part / whole) * 100)}%`
}

function formatDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
}

/** Horizontal journey steps — numbers always visible, bar scales to max. */
function JourneyFunnel({
  title,
  subtitle,
  steps,
  accent = "bg-accent-pink",
}: {
  title: string
  subtitle: string
  steps: { label: string; hint?: string; value: number }[]
  accent?: string
}) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <Card className="bg-white h-full">
      <CardContent className="p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-display font-black uppercase tracking-tight">{title}</h3>
          <p className="text-xs text-foreground-muted mt-1 font-medium">{subtitle}</p>
        </div>
        <div className="flex flex-col gap-3">
          {steps.map((step, i) => {
            const width = step.value <= 0 ? 0 : Math.max(8, Math.round((step.value / max) * 100))
            const prior = i > 0 ? steps[i - 1].value : 0
            return (
              <div key={step.label} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-sm font-bold">
                      <span className="text-foreground-muted mr-1.5">{i + 1}.</span>
                      {step.label}
                    </span>
                    {step.hint ? (
                      <p className="text-[10px] text-foreground-muted font-medium mt-0.5">{step.hint}</p>
                    ) : null}
                  </div>
                  <span className="text-2xl font-display font-black tabular-nums shrink-0">{step.value}</span>
                </div>
                <div className="h-3 bg-black/5 border border-foreground/15">
                  {step.value > 0 ? (
                    <div className={`h-full ${accent}`} style={{ width: `${width}%` }} />
                  ) : (
                    <div className="h-full w-full bg-[repeating-linear-gradient(-45deg,transparent,transparent_4px,rgba(0,0,0,0.04)_4px,rgba(0,0,0,0.04)_8px)]" />
                  )}
                </div>
                {i > 0 && prior > 0 && (
                  <p className="text-[10px] font-medium text-foreground-muted">
                    {pct(step.value, prior)} of previous step
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/** Simple multi-series bar chart from daily series. */
function ActivityChart({
  series,
  days,
}: {
  series: DayRow[]
  days: number
}) {
  const rows = series.slice(-Math.min(days, series.length))
  const max = Math.max(
    1,
    ...rows.map((r) => Math.max(r.gives || 0, r.claims || 0, r.accounts || 0)),
  )
  const chartH = 140
  const barGroupW = Math.max(28, Math.floor(560 / Math.max(rows.length, 1)))

  return (
    <Card className="bg-white">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-display font-black uppercase tracking-tight">
              Activity over time
            </h3>
            <p className="text-xs text-foreground-muted mt-1 font-medium">
              New accounts, drops, and claims each day
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[10px] font-black uppercase tracking-widest">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 bg-accent-pink border border-foreground" /> Gives
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 bg-accent-green border border-foreground" /> Claims
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 bg-foreground border border-foreground" /> Accounts
            </span>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1 px-1">
          <svg
            width={Math.max(320, rows.length * barGroupW)}
            height={chartH + 36}
            role="img"
            aria-label="Daily gives, claims, and accounts"
          >
            {rows.map((row, i) => {
              const x0 = i * barGroupW + 6
              const bw = Math.max(4, Math.floor((barGroupW - 10) / 3))
              const hGive = Math.round(((row.gives || 0) / max) * chartH)
              const hClaim = Math.round(((row.claims || 0) / max) * chartH)
              const hAcct = Math.round(((row.accounts || 0) / max) * chartH)
              return (
                <g key={row.day}>
                  <rect
                    x={x0}
                    y={chartH - hGive}
                    width={bw}
                    height={Math.max(hGive, row.gives ? 2 : 1)}
                    fill="#EC2F9B"
                    opacity={row.gives ? 1 : 0.12}
                  />
                  <rect
                    x={x0 + bw + 2}
                    y={chartH - hClaim}
                    width={bw}
                    height={Math.max(hClaim, row.claims ? 2 : 1)}
                    fill="#8BC34A"
                    opacity={row.claims ? 1 : 0.12}
                  />
                  <rect
                    x={x0 + (bw + 2) * 2}
                    y={chartH - hAcct}
                    width={bw}
                    height={Math.max(hAcct, row.accounts ? 2 : 1)}
                    fill="#111111"
                    opacity={row.accounts ? 1 : 0.1}
                  />
                  <text
                    x={x0 + barGroupW / 2 - 6}
                    y={chartH + 16}
                    textAnchor="middle"
                    className="fill-current"
                    style={{ fontSize: 9, fontWeight: 700 }}
                  >
                    {formatDay(row.day)}
                  </text>
                </g>
              )
            })}
            <line x1={0} y1={chartH} x2="100%" y2={chartH} stroke="#111" strokeWidth={1} opacity={0.2} />
          </svg>
        </div>
      </CardContent>
    </Card>
  )
}

/** Stacked status bar for wall items. */
function StatusStack({
  title,
  subtitle,
  segments,
}: {
  title: string
  subtitle: string
  segments: { label: string; value: number; color: string }[]
}) {
  const total = segments.reduce((n, s) => n + s.value, 0) || 1
  return (
    <Card className="bg-white h-full">
      <CardContent className="p-5 flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-display font-black uppercase tracking-tight">{title}</h3>
          <p className="text-xs text-foreground-muted mt-1 font-medium">{subtitle}</p>
        </div>
        <div className="flex h-8 w-full border-2 border-foreground overflow-hidden">
          {segments.map((seg) => {
            if (seg.value <= 0) return null
            const w = Math.max(4, (seg.value / total) * 100)
            return (
              <div
                key={seg.label}
                className={`${seg.color} border-r border-foreground/30 last:border-r-0`}
                style={{ width: `${w}%` }}
                title={`${seg.label}: ${seg.value}`}
              />
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-2 text-xs font-medium">
              <span className={`w-3 h-3 border border-foreground shrink-0 ${seg.color}`} />
              <span className="text-foreground-muted">{seg.label}</span>
              <span className="ml-auto font-display font-black tabular-nums">{seg.value}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-foreground-muted font-medium">Total {total === 1 && segments.every((s) => !s.value) ? 0 : segments.reduce((n, s) => n + s.value, 0)} items</p>
      </CardContent>
    </Card>
  )
}

export function AdminAnalytics() {
  const [days, setDays] = useState(14)
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await api.admin.get<AnalyticsPayload>(`/api/admin/analytics?days=${days}`)
        if (!cancelled) setData(res)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load analytics")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [days])

  const kpis = useMemo(() => {
    if (!data) return []
    return [
      {
        label: "People signed up",
        value: data.totals.accounts || 0,
        note: `${data.totals.onboarded || data.accountFunnel.onboarded || 0} finished profile`,
      },
      {
        label: "Items given",
        value: data.totals.gives || 0,
        note: "Drops submitted by givers",
      },
      {
        label: "On the Wall",
        value: data.totals.onWall || data.giveFunnel.on_wall || 0,
        note: "Live for people to claim",
      },
      {
        label: "Claims made",
        value: data.totals.claims || 0,
        note: `${data.claimFunnel.matched || 0} matched · ${data.totals.reloved || 0} Reloved`,
      },
    ]
  }, [data])

  const period = data?.periodTotals

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-black uppercase tracking-tight">How Reloved is used</h1>
          <p className="text-foreground-muted mt-2 max-w-xl">
            Follow the real journey: someone joins, drops an item, it goes on the Wall, someone claims it, then
            it becomes Reloved.
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <div className="flex items-center gap-2">
            {[7, 14, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDays(n)}
                className={`px-3 py-2 border-2 border-foreground text-xs font-black uppercase tracking-widest ${
                  days === n
                    ? "bg-foreground text-background"
                    : "bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
                }`}
              >
                Last {n} days
              </button>
            ))}
          </div>
          {data && (
            <p className="text-[10px] font-medium text-foreground-muted">
              Showing {formatDay(data.range.from)} – {formatDay(data.range.to)}
            </p>
          )}
        </div>
      </div>

      {loading && <p className="text-sm font-medium text-foreground-muted">Loading…</p>}
      {error && (
        <div className="border-2 border-foreground bg-accent-red/10 px-4 py-3 text-sm font-medium">{error}</div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {kpis.map((k) => (
              <Card key={k.label} className="bg-white">
                <CardContent className="p-4 flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                    {k.label}
                  </span>
                  <span className="text-4xl font-display font-black tabular-nums leading-none">{k.value}</span>
                  <span className="text-[11px] font-medium text-foreground-muted mt-1">{k.note}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {period && (
            <div className="border-2 border-foreground bg-accent-pink/30 px-4 py-3 text-sm font-medium">
              <span className="font-black uppercase tracking-widest text-xs block mb-1">
                In the last {days} days
              </span>
              <span>
                <strong>{period.accounts || 0}</strong> new accounts ·{" "}
                <strong>{period.gives || 0}</strong> new drops ·{" "}
                <strong>{period.claims || 0}</strong> new claims
                {(period.waitlist || 0) > 0 ? (
                  <>
                    {" "}
                    · <strong>{period.waitlist}</strong> waitlist
                  </>
                ) : null}
              </span>
            </div>
          )}

          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
              User journeys
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <JourneyFunnel
                title="1. Join"
                subtitle="Create an account and finish onboarding"
                accent="bg-foreground"
                steps={[
                  {
                    label: "Signed up",
                    hint: "Account profiles",
                    value: data.totals.accounts || 0,
                  },
                  {
                    label: "Profile complete",
                    hint: "Ready to give or claim",
                    value: data.totals.onboarded || data.accountFunnel.onboarded || 0,
                  },
                ]}
              />
              <JourneyFunnel
                title="2. Give"
                subtitle="Someone drops an item onto the Wall"
                accent="bg-accent-pink"
                steps={[
                  {
                    label: "Drop submitted",
                    hint: "Photos + details sent",
                    value: data.giveFunnel.submitted || data.totals.gives || 0,
                  },
                  {
                    label: "On the Wall",
                    hint: "Visible to claimers",
                    value: data.giveFunnel.on_wall || data.totals.onWall || 0,
                  },
                  {
                    label: "Reloved",
                    hint: "Happy ending — handed over",
                    value: data.giveFunnel.reloved || data.totals.reloved || 0,
                  },
                ]}
              />
              <JourneyFunnel
                title="3. Claim"
                subtitle="Someone asks for an item and gets matched"
                accent="bg-accent-green"
                steps={[
                  {
                    label: "Claim requested",
                    hint: "“I want this”",
                    value: data.claimFunnel.claim_submitted || data.totals.claims || 0,
                  },
                  {
                    label: "Waiting on giver",
                    hint: "Pending decision",
                    value: data.claimFunnel.pending || data.claimStatus.pending || 0,
                  },
                  {
                    label: "Matched",
                    hint: "Accepted / in handover",
                    value: data.claimFunnel.matched || 0,
                  },
                  {
                    label: "Reloved",
                    hint: "Received successfully",
                    value: data.claimFunnel.reloved || data.totals.reloved || 0,
                  },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ActivityChart series={data.series || []} days={days} />
            <StatusStack
              title="What’s on the Wall right now"
              subtitle="Where each item sits today"
              segments={[
                { label: "Free to claim", value: data.itemStatus.available || 0, color: "bg-accent-green" },
                {
                  label: "Being matched",
                  value: data.itemStatus.being_matched || 0,
                  color: "bg-accent-pink",
                },
                { label: "Claimed", value: data.itemStatus.claimed || 0, color: "bg-foreground/80" },
                { label: "Reloved", value: data.itemStatus.reloved || 0, color: "bg-foreground" },
                { label: "Other", value: data.itemStatus.other || 0, color: "bg-black/20" },
              ]}
            />
          </div>

          {data.insights && (
            <>
              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
                  Supply vs demand
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CompareBars
                    title="By category"
                    subtitle="What people give vs what people claim"
                    leftLabel="Given"
                    rightLabel="Claimed"
                    rows={(data.insights.supplyDemand || []).map((r) => ({
                      label: r.label,
                      left: r.given,
                      right: r.claimed,
                    }))}
                  />
                  <CompareBars
                    title="By gender / kids"
                    subtitle="Who the clothes are for"
                    leftLabel="On Wall (supply)"
                    rightLabel="In claims (demand)"
                    rows={(() => {
                      const labels = new Set([
                        ...(data.insights.byGender.supply || []).map((r) => r.label),
                        ...(data.insights.byGender.demand || []).map((r) => r.label),
                      ])
                      const sMap = Object.fromEntries(
                        (data.insights.byGender.supply || []).map((r) => [r.label, r.count]),
                      )
                      const dMap = Object.fromEntries(
                        (data.insights.byGender.demand || []).map((r) => [r.label, r.count]),
                      )
                      return [...labels].map((label) => ({
                        label,
                        left: sMap[label] || 0,
                        right: dMap[label] || 0,
                      }))
                    })()}
                  />
                </div>
              </div>

              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
                  Where
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <RankList
                    title="Top areas (gives)"
                    subtitle="Neighbourhoods items come from"
                    rows={data.insights.topAreas.gives || []}
                  />
                  <RankList
                    title="Top areas (claims)"
                    subtitle="Where claimers are asking from"
                    rows={data.insights.topAreas.claims || []}
                  />
                </div>
              </div>

              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
                  Speed & people
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <Card className="bg-white">
                    <CardContent className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Median time to match
                      </span>
                      <span className="text-3xl font-display font-black tabular-nums">
                        {data.insights.speed.medianMatchLabel}
                      </span>
                      <span className="text-[11px] text-foreground-muted font-medium">
                        From claim → accept ({data.insights.speed.matchSampleSize} samples)
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Median to Reloved
                      </span>
                      <span className="text-3xl font-display font-black tabular-nums">
                        {data.insights.speed.medianReloveLabel}
                      </span>
                      <span className="text-[11px] text-foreground-muted font-medium">
                        Claim → received ({data.insights.speed.reloveSampleSize} samples)
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Claim accept rate
                      </span>
                      <span className="text-3xl font-display font-black tabular-nums">
                        {data.insights.declines.acceptRate != null
                          ? `${data.insights.declines.acceptRate}%`
                          : "—"}
                      </span>
                      <span className="text-[11px] text-foreground-muted font-medium">
                        Soft declines {data.insights.declines.softDeclines} · withdrawn{" "}
                        {data.insights.declines.withdrawn}
                      </span>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-4 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-foreground-muted">
                        Givers / claimers
                      </span>
                      <span className="text-3xl font-display font-black tabular-nums">
                        {data.insights.people.givers}/{data.insights.people.claimers}
                      </span>
                      <span className="text-[11px] text-foreground-muted font-medium">
                        {data.insights.people.both} do both · {data.insights.people.giversOnly} give only ·{" "}
                        {data.insights.people.claimersOnly} claim only
                      </span>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div>
                <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">
                  Needs attention on the Wall
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-white">
                    <CardContent className="p-5 flex flex-col gap-3">
                      <div>
                        <h3 className="text-sm font-display font-black uppercase tracking-tight">
                          Free too long (7+ days)
                        </h3>
                        <p className="text-xs text-foreground-muted mt-1 font-medium">
                          {data.insights.stuck.availableCount} items still available — maybe boost or review
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                        {(data.insights.stuck.availableOver7d || []).length === 0 ? (
                          <p className="text-xs text-foreground-muted">None stuck — nice.</p>
                        ) : (
                          data.insights.stuck.availableOver7d.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between gap-2 border border-foreground/20 px-2.5 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-bold truncate">{item.title}</p>
                                <p className="text-foreground-muted">
                                  {item.category} · {item.area}
                                </p>
                              </div>
                              <span className="font-display font-black tabular-nums shrink-0">{item.days}d</span>
                            </div>
                          ))
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-white">
                    <CardContent className="p-5 flex flex-col gap-3">
                      <div>
                        <h3 className="text-sm font-display font-black uppercase tracking-tight">
                          Matching stuck (3+ days)
                        </h3>
                        <p className="text-xs text-foreground-muted mt-1 font-medium">
                          {data.insights.stuck.matchingCount} waiting on a giver decision
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                        {(data.insights.stuck.matchingOver3d || []).length === 0 ? (
                          <p className="text-xs text-foreground-muted">None stuck — nice.</p>
                        ) : (
                          data.insights.stuck.matchingOver3d.map((item) => (
                            <div
                              key={item.id}
                              className="flex justify-between gap-2 border border-foreground/20 px-2.5 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-bold truncate">{item.title}</p>
                                <p className="text-foreground-muted">
                                  {item.category} · {item.area}
                                </p>
                              </div>
                              <span className="font-display font-black tabular-nums shrink-0">{item.days}d</span>
                            </div>
                          ))
                        )}
                      </div>
                      <Link
                        to="/admin/item-requests"
                        className="text-xs font-bold underline text-foreground"
                      >
                        Open Claims →
                      </Link>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatusStack
              title="Claim pipeline"
              subtitle="Status of every claim request"
              segments={[
                { label: "Pending", value: data.claimStatus.pending || 0, color: "bg-accent-pink" },
                {
                  label: "Matched / accepted",
                  value: (data.claimStatus.matched || 0) + (data.claimStatus.accepted || 0),
                  color: "bg-accent-green",
                },
                { label: "Completed", value: data.claimStatus.completed || 0, color: "bg-foreground" },
                { label: "Declined", value: data.claimStatus.rejected || 0, color: "bg-black/25" },
                { label: "Withdrawn", value: data.claimStatus.withdrawn || 0, color: "bg-black/10" },
              ]}
            />
            <Card className="bg-white">
              <CardContent className="p-5 flex flex-col gap-3">
                <h3 className="text-sm font-display font-black uppercase tracking-tight">
                  Quick share links
                </h3>
                <p className="text-xs text-foreground-muted font-medium">
                  Short links for WhatsApp, print QR, and SMS. Full QR sheet:{" "}
                  <Link to="/qr" className="underline font-bold text-foreground">
                    QR codes
                  </Link>
                </p>
                <div className="flex flex-col gap-2">
                  {(data.shortIo?.links || [])
                    .filter((l) => ["go", "wall", "give", "account", "home"].includes(l.path))
                    .map((link) => (
                      <a
                        key={link.shortURL}
                        href={link.shortURL}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 border-2 border-foreground px-3 py-2 bg-surface-muted hover:bg-accent-pink/30 transition-colors"
                      >
                        <span className="text-xs font-bold">{link.title || link.path}</span>
                        <span className="font-mono text-[11px] text-foreground-muted truncate">
                          {link.shortURL.replace("https://", "")}
                        </span>
                      </a>
                    ))}
                  {!(data.shortIo?.links || []).length && (
                    <p className="text-xs text-foreground-muted">
                      go.reloved.digital/go · /wall · /give · /account
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
