// Two vendors, split by channel — see Docs/BACKEND_PLAN.md "Email + SMS"
// section for why (email needed campaign/broadcast tooling MSG91 doesn't
// really offer; SMS stayed on MSG91 for its India DLT compliance handling).
// Route handlers should only ever call the functions below, never the
// MSG91/Brevo APIs directly, so swapping either vendor later is a one-file
// change.
//
// Note: the actual donor-login SMS OTP path doesn't call sendOtpSms at all —
// it uses the MSG91 OTP Widget client-side (see frontend/src/lib/msg91Widget.ts),
// which needs no DLT-approved template. sendOtpSms/MSG91_SMS_TEMPLATE_ID below
// stay in place for any flow that generates its own code server-side instead
// (e.g. donation phone verification), for whenever a DLT template exists.
//
// Dev fallback: when a vendor's key isn't set, sends are logged to the
// console instead of failing, so the rest of the app is testable locally
// without real accounts.

const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY
const MSG91_SMS_TEMPLATE_ID = process.env.MSG91_SMS_TEMPLATE_ID
const msg91Configured = Boolean(MSG91_AUTH_KEY)

// 2Factor — India-focused OTP vendor, no DLT registration needed for the
// OTP SMS category, free trial credits on signup. Tried as a fallback when
// MSG91 isn't configured, so either can be set for local testing without
// touching call sites.
const TWO_FACTOR_API_KEY = process.env.TWO_FACTOR_API_KEY
const twoFactorConfigured = Boolean(TWO_FACTOR_API_KEY)

const BREVO_API_KEY = process.env.BREVO_API_KEY
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.local"
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "reloved"
const BREVO_OTP_TEMPLATE_ID = process.env.BREVO_OTP_TEMPLATE_ID
// Design source for all four: backend/email-templates/*.html — upload each
// to Brevo (Campaigns → Templates → import HTML), then paste the numeric
// Template ID Brevo assigns into the matching env var below. Any one left
// unset falls back to a plain-text sendEmail() with the same information,
// so nothing breaks before these are set up.
const BREVO_DONATION_CONFIRMATION_TEMPLATE_ID = process.env.BREVO_DONATION_CONFIRMATION_TEMPLATE_ID
const BREVO_DONATION_ADMIN_TEMPLATE_ID = process.env.BREVO_DONATION_ADMIN_TEMPLATE_ID
const BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID = process.env.BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID
const BREVO_CLAIM_ADMIN_TEMPLATE_ID = process.env.BREVO_CLAIM_ADMIN_TEMPLATE_ID
const brevoConfigured = Boolean(BREVO_API_KEY)

// Used to build the "Review in Dashboard" link in admin notification emails.
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "https://reloved.digital"

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (msg91Configured && MSG91_SMS_TEMPLATE_ID) {
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
    return
  }

  if (twoFactorConfigured) {
    // Custom-OTP send: we generate/track the code ourselves (see otp.ts),
    // 2Factor is just the SMS pipe — same contract as the MSG91 path above.
    const target = phone.startsWith("+") ? phone : `+91${phone}`
    const res = await fetch(`https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/${target}/${code}`, {
      method: "POST",
    })

    if (!res.ok) {
      throw new Error(`2Factor SMS send failed: ${res.status} ${await res.text()}`)
    }
    const body = await res.json() as { Status?: string; Details?: string }
    if (body.Status !== "Success") {
      throw new Error(`2Factor SMS send failed: ${JSON.stringify(body)}`)
    }
    return
  }

  console.log(`[dev] SMS OTP to ${phone}: ${code}`)
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
    const detail = await res.text()
    // Vendor IP allowlists (common on Brevo) shouldn't block login during deploys.
    // OTP is still stored in DB — log it so ops can unblock or read from journal.
    if (process.env.OTP_VENDOR_FALLBACK_LOG === "true") {
      console.error(`Brevo OTP send failed (${res.status}): ${detail}`)
      console.log(`[otp-fallback] email to ${email}: ${code}`)
      return
    }
    throw new Error(`Brevo OTP template send failed: ${res.status} ${detail}`)
  }
}

/** Generic Brevo template sender shared by the four transactional emails below — each just supplies its own template-id env var, params, and a plain-text fallback. */
async function sendBrevoTemplate(
  to: string,
  templateId: string | undefined,
  params: Record<string, string>,
  fallback: { subject: string; body: string }
): Promise<void> {
  if (!brevoConfigured) {
    console.log(`[dev] Email to ${to}: ${fallback.subject}\n${fallback.body}`)
    return
  }
  if (!templateId) {
    await sendEmail(to, fallback.subject, fallback.body)
    return
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": BREVO_API_KEY! },
    body: JSON.stringify({ to: [{ email: to }], templateId: Number(templateId), params }),
  })
  if (!res.ok) {
    throw new Error(`Brevo template send failed: ${res.status} ${await res.text()}`)
  }
}

/** Donation confirmation — sent to the donor right after they submit (Give flow). */
export async function sendDonationConfirmation(
  email: string,
  params: { firstName: string; itemTitle: string; reference: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    BREVO_DONATION_CONFIRMATION_TEMPLATE_ID,
    { FIRST_NAME: params.firstName, ITEM_TITLE: params.itemTitle, REFERENCE: params.reference },
    {
      subject: `We received your donation — ${params.reference}`,
      body: `Thank you for dropping "${params.itemTitle}" through reloved. Your reference is ${params.reference}. We'll update you once it's matched with a community partner.`,
    }
  )
}

/** New-donation alert — sent to admin every time a donor submits (Give flow). */
export async function sendDonationAdminAlert(
  email: string,
  params: { donorName: string; itemTitle: string; category: string; locality: string; reference: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    BREVO_DONATION_ADMIN_TEMPLATE_ID,
    {
      DONOR_NAME: params.donorName,
      ITEM_TITLE: params.itemTitle,
      CATEGORY: params.category,
      LOCALITY: params.locality,
      REFERENCE: params.reference,
      DASHBOARD_URL: `${PUBLIC_APP_URL}/admin/donations`,
    },
    {
      subject: `New donation submitted — ${params.reference}`,
      body: `${params.donorName} submitted "${params.itemTitle}" (${params.category}, ${params.locality}). Reference ${params.reference}. Review it in the admin dashboard.`,
    }
  )
}

/** Claim confirmation — sent to the requester right after they ask to take an item. */
export async function sendClaimConfirmation(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle },
    {
      subject: `We've got your request — ${params.itemTitle}`,
      body: `Thanks for requesting "${params.itemTitle}" through reloved. Our team reviews every request by hand — you'll hear back within 24-48 hours.`,
    }
  )
}

/** New-claim alert — sent to admin every time someone requests to take an item. */
export async function sendClaimAdminAlert(
  email: string,
  params: { requesterName: string; itemTitle: string; requesterPhone: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    BREVO_CLAIM_ADMIN_TEMPLATE_ID,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      REQUESTER_PHONE: params.requesterPhone,
      DASHBOARD_URL: `${PUBLIC_APP_URL}/admin/item-requests`,
    },
    {
      subject: `New claim request — ${params.itemTitle}`,
      body: `${params.requesterName} requested to claim "${params.itemTitle}". Review it in the admin dashboard to approve or reject.`,
    }
  )
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
