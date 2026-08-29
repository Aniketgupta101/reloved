import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { PostHogProvider } from "@posthog/react"
import App from "./App.tsx"
import { isPostHogEnabled, posthog } from "./lib/posthog"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isPostHogEnabled ? (
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    ) : (
      <App />
    )}
  </StrictMode>
)
