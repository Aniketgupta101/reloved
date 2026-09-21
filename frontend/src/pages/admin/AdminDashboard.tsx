import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "@/lib/api"
import { Card, CardContent } from "@/components/ui/Card"

interface Metrics {
  completedDonations: number
  pendingSubmissions: number
  approvedInventory: number
  activePartners: number
  activeAllocations: number
  pendingClaims: number
  pendingPartners: number
  openMessages: number
  unreadChats: number
  unreadClaimChats: number
  unreadDonationChats: number
  unreadPeerChats: number
  peerChatCount: number
  needsAttention: number
}

export function AdminDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const data = await api.admin.get<Metrics>("/api/admin/metrics")
        setMetrics(data)
      } catch (err) {
        console.error("Error fetching metrics:", err)
      }
    }
    fetchMetrics()
    const id = window.setInterval(fetchMetrics, 20000)
    return () => window.clearInterval(id)
  }, [])

  const m = metrics || {
    completedDonations: 0,
    pendingSubmissions: 0,
    approvedInventory: 0,
    activePartners: 0,
    activeAllocations: 0,
    pendingClaims: 0,
    pendingPartners: 0,
    openMessages: 0,
    unreadChats: 0,
    unreadClaimChats: 0,
    unreadDonationChats: 0,
    unreadPeerChats: 0,
    peerChatCount: 0,
    needsAttention: 0,
  }

  const actionCards = [
    {
      label: "Pending Gives to approve",
      value: m.pendingSubmissions,
      href: "/admin/donations",
      hint: "Open Gives → Approve so items hit the Wall of Kindness",
    },
    {
      label: "Pending Claims to decide",
      value: m.pendingClaims,
      href: "/admin/item-requests",
      hint: "Open Claims → Accept or soft-decline (Couldn't match). Borzo only for Use Borzo handover.",
    },
    {
      label: "Unread Give / Claim chats",
      value: (m.unreadClaimChats || 0) + (m.unreadDonationChats || 0),
      href: m.unreadClaimChats >= m.unreadDonationChats ? "/admin/item-requests" : "/admin/donations",
      hint: "Open the card → Message user (two-way chat)",
    },
    {
      label: "Giver ↔ claimer chats",
      value: m.unreadPeerChats || m.peerChatCount || 0,
      href: "/admin/peer-chats",
      hint: "Safety monitor — full peer transcripts (read-only)",
    },
    {
      label: "Contact messages",
      value: m.openMessages,
      href: "/admin/messages",
      hint: "Website contact form — not Give/Claim chat",
    },
    {
      label: "Partner applications",
      value: m.pendingPartners,
      href: "/admin/partners",
      hint: "Review NGO / partner applications",
    },
  ]

  const stats = [
    { label: "Completed (Reloved)", value: m.completedDonations, highlight: true },
    { label: "On Wall of Kindness", value: m.approvedInventory },
    { label: "Active partners", value: m.activePartners },
  ]

  return (
    <div className="flex flex-col gap-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tight">Overview</h1>
        <p className="text-foreground-muted mt-2 max-w-2xl">
          Your ops home. Green numbers need action. Tap a card to jump there. Give/Claim Reloved chat is on{" "}
          <strong>Gives</strong> and <strong>Claims</strong>. Giver ↔ claimer handover chat is under{" "}
          <strong>Peer chats</strong>.
        </p>
      </div>

      {m.needsAttention > 0 && (
        <div className="border-2 border-foreground bg-accent-green/20 px-4 py-3 text-sm font-medium">
          <span className="font-black uppercase tracking-widest text-xs block mb-1">
            {m.needsAttention} items need attention
          </span>
          Start with pending Gives and Claims, then reply to unread chats.
        </div>
      )}

      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">Needs your input</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {actionCards.map((card) => (
            <Link key={card.label} to={card.href} className="block group">
              <Card className={card.value > 0 ? "bg-accent-green" : "bg-white"}>
                <CardContent className="flex flex-col gap-2 p-5">
                  <span className="text-xs font-black uppercase tracking-widest text-black/60">{card.label}</span>
                  <span className="text-5xl font-display font-black text-foreground">{card.value}</span>
                  <span className="text-xs font-medium text-foreground/80 group-hover:underline">{card.hint}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xs font-black uppercase tracking-widest text-foreground-muted mb-3">Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={stat.highlight ? "bg-white" : "bg-white"}>
              <CardContent className="flex flex-col gap-2 p-5">
                <span className="text-xs font-black uppercase tracking-widest text-foreground-muted">{stat.label}</span>
                <span className="text-4xl font-display font-black text-foreground">{stat.value}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
