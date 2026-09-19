import { useEffect } from "react"
import { api } from "@/lib/api"
import { getDonorToken } from "@/lib/donorSession"

/**
 * Keeps donor login alive: token lives in localStorage, JWT lasts ~1 year,
 * and each successful profile read refreshes the expiry (sliding session).
 * Cleared only on explicit Sign out or a confirmed expired/invalid session.
 */
export function DonorSessionKeepAlive() {
  useEffect(() => {
    async function refresh() {
      if (!getDonorToken()) return
      try {
        await api.donor.get("/api/donor/profile")
      } catch {
        /* auth failure handled where sessions are required */
      }
    }
    void refresh()
    const onFocus = () => void refresh()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [])

  return null
}
