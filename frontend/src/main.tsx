import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { PostHogProvider } from "@posthog/react"
import App from "./App.tsx"
import { isPostHogEnabled, posthog } from "./lib/posthog"
import "./index.css"

const WAITLIST_HOSTS = new Set(["reloved.digital", "www.reloved.digital"])
if (
  WAITLIST_HOSTS.has(window.location.hostname) &&
  !window.location.pathname.endsWith("/coming-soon.html")
) {
  window.location.replace("/coming-soon.html")
} else {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      {isPostHogEnabled ? (
        <PostHogProvider client={posthog}>
          <App />
        </PostHogProvider>
      ) : (
        <App />
      )}
    </StrictMode>,
  )
}
