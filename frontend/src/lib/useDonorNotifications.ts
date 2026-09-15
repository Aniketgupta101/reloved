import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"

export type DonorNotification = {
  id: string
  role: "giver" | "claimer"
  type: string
  title: string
  body: string
  href: string
  itemTitle?: string | null
  requestId?: string | null
  read: boolean
  createdAt: string
}

export function useDonorNotifications() {
  const [notifications, setNotifications] = useState<DonorNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!getDonorToken()) {
      setNotifications([])
      setUnreadCount(0)
      return
    }
    try {
      const data = await api.donor.get<{ notifications: DonorNotification[]; unreadCount: number }>(
        "/api/donor/notifications"
      )
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
      window.dispatchEvent(new Event("reloved-notifications"))
    } catch {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [])

  useEffect(() => {
    refresh()
    const onFocus = () => refresh()
    window.addEventListener("focus", onFocus)
    const t = window.setInterval(refresh, 25000)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.clearInterval(t)
    }
  }, [refresh])

  async function markRead(id: string) {
    if (!id.startsWith("live-")) {
      await api.donor.patch(`/api/donor/notifications/${id}/read`, {}).catch(() => undefined)
    }
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function markAllRead() {
    await api.donor.patch("/api/donor/notifications/read-all", {}).catch(() => undefined)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, refresh, markRead, markAllRead }
}

export function useDonorUnreadCount() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function tick() {
      if (!getDonorToken()) {
        if (!cancelled) setUnread(0)
        return
      }
      try {
        const data = await api.donor.get<{ unreadCount: number }>("/api/donor/notifications")
        if (!cancelled) setUnread(data.unreadCount || 0)
      } catch {
        if (!cancelled) setUnread(0)
      }
    }
    tick()
    const t = window.setInterval(tick, 30000)
    window.addEventListener("focus", tick)
    window.addEventListener("reloved-notifications", tick)
    return () => {
      cancelled = true
      window.clearInterval(t)
      window.removeEventListener("focus", tick)
      window.removeEventListener("reloved-notifications", tick)
    }
  }, [])

  return unread
}
