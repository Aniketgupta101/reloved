// Two vendors, split by channel — see Docs/BACKEND_PLAN.md "Email + SMS"
// section for why (email needed campaign/broadcast tooling MSG91 doesn't
// really offer; SMS stayed on MSG91 for its India DLT compliance handling).
// Route handlers should only ever call the functions below, never the
// MSG91/Brevo APIs directly, so swapping either vendor later is a one-file
// change.
//
// Dev fallback: when a vendor's key isn't set, sends are logged to the
// console instead of failing, so the rest of the app is testable locally
// without real accounts.

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY
const MSG91_SMS_TEMPLATE_ID = process.env.MSG91_SMS_TEMPLATE_ID
const msg91Configured = Boolean(MSG91_AUTH_KEY)

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.local"
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const BREVO_OTP_TEMPLATE_ID = process.env.BREVO_OTP_TEMPLATE_ID
const brevoConfigured = Boolean(BREVO_API_KEY)

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (!msg91Configured || !MSG91_SMS_TEMPLATE_ID) {
    console.log(`[dev] SMS OTP to ${phone}: ${code}`)
    return
  }

  const res = await fetch("https://control.msg91.com/api/v5/otp", {
    method: "POST",
    headers: { "Content-Type": "application/json", authkey: MSG91_AUTH_KEY! },
    body: JSON.stringify({
      template_id: MSG91_SMS_TEMPLATE_ID,
      mobile: phone,
      otp: code,
    }),
  })

  if (!res.ok) {
    throw new Error(`MSG91 SMS send failed: ${res.status} ${await res.text()}`)
  }
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  // Uses the "Email_login" Brevo template (merge var: OTP) if configured;
  // falls back to a plain inline email otherwise, same as before.
  if (!brevoConfigured) {
    console.log(`[dev] OTP email to ${email}: ${code}`)
    return
  }

  if (!BREVO_OTP_TEMPLATE_ID) {
    await sendEmail(email, "Your reloved verification code", `Your verification code is ${code}. It expires in 10 minutes.`)
    return
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY! },
    body: JSON.stringify({
      to: [{ email }],
      templateId: Number(BREVO_OTP_TEMPLATE_ID),
      params: { OTP: code },
    }),
  })

  if (!res.ok) {
    throw new Error(`Brevo OTP template send failed: ${res.status} ${await res.text()}`)
  }
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (!brevoConfigured) {
    console.log(`[dev] Email to ${to}: ${subject}\n${body}`)
    return
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY! },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent: `<p>${body}</p>`,
    }),
  })

  if (!res.ok) {
    throw new Error(`Brevo email send failed: ${res.status} ${await res.text()}`)
  }
}

/**
 * Broadcast send to a Brevo contact list (e.g. "new item available" to
 * subscribed donors) — distinct from sendEmail's one-off transactional
 * sends. Needs a Brevo list ID and template ID set up in their dashboard
 * first; contact-list membership isn't modeled in our schema yet (see
 * Docs/BACKEND_PLAN.md — donors aren't currently a standing mailing list).
 */
export async function sendBroadcast(listId: number, templateId: number, params: Record<string, unknown> = {}): Promise<void> {
  if (!brevoConfigured) {
    console.log(`[dev] Broadcast to list ${listId} via template ${templateId}`, params)
    return
  }

  const res = await fetch("https://api.brevo.com/v3/emailCampaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY! },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      templateId,
      recipients: { listIds: [listId] },
      params,
    }),
  })

  if (!res.ok) {
    throw new Error(`Brevo broadcast send failed: ${res.status} ${await res.text()}`)
  }
}
