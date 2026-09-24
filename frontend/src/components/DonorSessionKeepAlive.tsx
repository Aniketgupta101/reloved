import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { api } from "@/lib/api"
import { clearDonorToken, getDonorToken, subscribeDonorAuth } from "@/lib/donorSession"
import { resetAnalyticsIdentity } from "@/lib/analytics"

/**
 * Keeps donor login alive via sliding profile refresh, and syncs logout
 * across tabs / browsers (epoch revoke + BroadcastChannel).
 */
export function DonorSessionKeepAlive() {
  const navigate = useNavigate()

  useEffect(() => {
    async function refresh() {
      if (!getDonorToken()) return
      try {
        await api.donor.get("/api/donor/profile")
      } catch (err: any) {
        const msg = String(err?.message || "")
        if (/not signed in|invalid or expired|401/i.test(msg)) {
          // Broadcast once so other tabs drop too (sessionEpoch revoked server-side).
          clearDonorToken()
          resetAnalyticsIdentity()
        }
      }
    }
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  useEffect(() => {
    return subscribeDonorAuth({
      onLogout: () => {
        // Silent — must not rebroadcast or tabs ping-pong until the browser freezes.
        clearDonorToken({ silent: true })
        resetAnalyticsIdentity()
        if (window.location.pathname.startsWith("/account")) {
          navigate("/account/login", { replace: true })
        }
      },
    })
  }, [navigate])

  return null
}
