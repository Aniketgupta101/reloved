import { useCallback, useEffect, useState } from "react"
import { api } from "@/lib/api"
import { collapseNotificationsByTransaction } from "@/lib/collapseNotifications"
import { getDonorToken, subscribeDonorAuth } from "@/lib/donorSession"

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!getDonorToken()) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      setError(null)
      return
    }
    try {
      const data = await api.donor.get<{ notifications: DonorNotification[]; unreadCount: number }>(
        "/api/donor/notifications"
      )
      const collapsed = collapseNotificationsByTransaction(data.notifications || [])
      setNotifications(collapsed)
      setUnreadCount(collapsed.filter((n) => !n.read).length)
      setError(null)
      window.dispatchEvent(new Event("reloved-notifications"))
    } catch (err: unknown) {
      // Keep last-good list on transient failures so the tab doesn't flash empty.
      const msg = err instanceof Error ? err.message : "Couldn't load notifications"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void refresh()
    const onFocus = () => {
      if (document.visibilityState !== "visible") return
      void refresh()
    }
    window.addEventListener("focus", onFocus)
    const t = window.setInterval(() => void refresh(), 8000)
    const unsub = subscribeDonorAuth({
      onLogin: () => {
        setLoading(true)
        void refresh()
      },
      onLogout: () => {
        setNotifications([])
        setUnreadCount(0)
        setLoading(false)
        setError(null)
      },
    })
    return () => {
      window.removeEventListener("focus", onFocus)
      window.clearInterval(t)
      unsub()
    }
  }, [refresh])

  const markRead = useCallback(async (id: string, opts?: { requestId?: string | null }) => {
    if (!id.startsWith("live-")) {
      await api.donor.patch(`/api/donor/notifications/${id}/read`, {}).catch(() => undefined)
    }
    const requestId = String(opts?.requestId || "").trim()
    setNotifications((prev) => {
      const next = prev.map((n) => {
        if (n.id === id) return { ...n, read: true }
        if (requestId && String(n.requestId || "") === requestId) return { ...n, read: true }
        return n
      })
      setUnreadCount(next.filter((n) => !n.read).length)
      return next
    })
    window.dispatchEvent(new Event("reloved-notifications"))
    try {
      const data = await api.donor.get<{ notifications: DonorNotification[]; unreadCount: number }>(
        "/api/donor/notifications",
      )
      const collapsed = collapseNotificationsByTransaction(data.notifications || [])
      setNotifications(collapsed)
      setUnreadCount(collapsed.filter((n) => !n.read).length)
      window.dispatchEvent(new Event("reloved-notifications"))
    } catch {
      /* keep optimistic */
    }
  }, [])

  const markAllRead = useCallback(async () => {
    await api.donor.patch("/api/donor/notifications/read-all", {}).catch(() => undefined)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
    window.dispatchEvent(new Event("reloved-notifications"))
  }, [])

  return { notifications, unreadCount, loading, error, refresh, markRead, markAllRead }
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
        /* keep previous count */
      }
    }
    void tick()
    const t = window.setInterval(tick, 8000)
    window.addEventListener("focus", tick)
    window.addEventListener("reloved-notifications", tick)
    const unsub = subscribeDonorAuth({
      onLogin: () => void tick(),
      onLogout: () => {
        if (!cancelled) setUnread(0)
      },
    })
    return () => {
      cancelled = true
      window.clearInterval(t)
      window.removeEventListener("focus", tick)
      window.removeEventListener("reloved-notifications", tick)
      unsub()
    }
  }, [])

  return unread
}
