// MSG91 OTP Widget — client-side widget that owns the whole send+verify
// lifecycle itself, so this bypasses our own /api/otp/request +
// /api/otp/verify flow entirely for the "sms" channel.
// exposeMethods:true lets us drive it with our own UI (DonorLogin.tsx's
// existing phone/code inputs) instead of MSG91's own popup widget.
// On successful verify it hands back a short-lived access token, which the
// backend then confirms via MSG91's server-side verifyAccessToken API
// (see /api/otp/verify-widget) before a donor session is issued.
const WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID as string | undefined
const WIDGET_TOKEN_AUTH = import.meta.env.VITE_MSG91_WIDGET_TOKEN as string | undefined

export const msg91WidgetConfigured = Boolean(WIDGET_ID && WIDGET_TOKEN_AUTH)

declare global {
  interface Window {
    initSendOTP?: (config: Record<string, unknown>) => void
    sendOtp?: (identifier: string, onSuccess: (data: unknown) => void, onFailure: (err: unknown) => void) => void
    verifyOtp?: (otp: string, onSuccess: (data: { message?: string }) => void, onFailure: (err: { message?: string }) => void) => void
  }
}

let loadPromise: Promise<void> | null = null

function loadWidgetScript(): Promise<void> {
  if (loadPromise) return loadPromise
  loadPromise = new Promise((resolve, reject) => {
    if (!msg91WidgetConfigured) {
      reject(new Error("SMS login isn't configured yet."))
      return
    }
    const configuration = {
      widgetId: WIDGET_ID,
      tokenAuth: WIDGET_TOKEN_AUTH,
      exposeMethods: true,
      success: () => {},
      failure: () => {},
    }
    const urls = ["https://verify.msg91.com/otp-provider.js", "https://verify.phone91.com/otp-provider.js"]
    let i = 0
    function attempt() {
      const s = document.createElement("script")
      s.src = urls[i]
      s.async = true
      s.onload = () => {
        if (typeof window.initSendOTP !== "function") {
          reject(new Error("MSG91 widget script loaded but did not initialize."))
          return
        }
        window.initSendOTP(configuration)
        // initSendOTP() kicks off the widget's own async setup — sendOtp/
        // verifyOtp aren't attached to window immediately after it returns.
        // Poll briefly instead of assuming they're ready synchronously.
        const start = Date.now()
        const timeoutMs = 8000
        function waitForMethods() {
          if (window.sendOtp && window.verifyOtp) {
            resolve()
            return
          }
          if (Date.now() - start > timeoutMs) {
            reject(new Error("SMS verification widget took too long to initialize."))
            return
          }
          setTimeout(waitForMethods, 100)
        }
        waitForMethods()
      }
      s.onerror = () => {
        i++
        if (i < urls.length) attempt()
        else reject(new Error("Couldn't load the SMS verification widget."))
      }
      document.head.appendChild(s)
    }
    attempt()
  })
  return loadPromise
}

// MSG91's widget expects the identifier with the country code prefixed and
// no "+" (e.g. "917304382922") — a bare 10-digit number silently "succeeds"
// client-side (an access token still gets issued) but never actually routes
// an SMS. Confirmed by comparing widget logs: our bare-number sends showed
// "OTP unverified", a manual 91-prefixed test on MSG91's own console didn't.
function toMsg91Identifier(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("91") && digits.length === 12) return digits
  return `91${digits}`
}

export async function msg91SendOtp(identifier: string): Promise<void> {
  await loadWidgetScript()
  return new Promise((resolve, reject) => {
    if (!window.sendOtp) {
      reject(new Error("SMS verification isn't ready yet — try again in a moment."))
      return
    }
    window.sendOtp(
      toMsg91Identifier(identifier),
      () => resolve(),
      (err: any) => reject(new Error(err?.message || "Couldn't send the code right now."))
    )
  })
}

/** Resolves to the widget's access token on a correct code. */
export async function msg91VerifyOtp(otp: string): Promise<string> {
  await loadWidgetScript()
  return new Promise((resolve, reject) => {
    if (!window.verifyOtp) {
      reject(new Error("SMS verification isn't ready yet — try again in a moment."))
      return
    }
    window.verifyOtp(
      otp,
      (data) => {
        if (data?.message) resolve(data.message)
        else reject(new Error("Verification succeeded but no token was returned."))
      },
      (err) => reject(new Error(err?.message || "Incorrect code."))
    )
  })
}
