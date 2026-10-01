import { waitlistIntentLine, waitlistWelcomeHtml } from "./waitlistWelcomeHtml"
import { opsEmailActionUrl, signOpsEmailAction } from "./dropEmailActions"
import { shortenAppUrl, shortPublicUrl } from "./shortIo"

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "https://reloved.digital"

/** Every admin-alert email (donation/claim/partner) also goes here when not already in To. */
const ADMIN_BCC = "sheetalahuja99@gmail.com"

/** Ops triage - Us (Aniket + Totem) + Sheetal. */
export const OPS_ALERT_EMAILS = [
  "aniketgupta83003@gmail.com",
  "totemisnottaken@gmail.com",
  "sheetalahuja99@gmail.com",
] as const

/** @deprecated use OPS_ALERT_EMAILS */
export const DROP_ADMIN_ALERT_EMAILS = OPS_ALERT_EMAILS

export function opsAlertRecipients(extra?: string | null): string[] {
  const list = [...OPS_ALERT_EMAILS, ...(extra ? [extra] : [])]
  return [...new Set(list.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))]
}

function opsBtn(href: string, label: string, bg: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 18px;margin:4px 8px 4px 0;background:${bg};color:#fff;text-decoration:none;font-weight:700;border-radius:6px;font-family:system-ui,sans-serif;font-size:14px">${label}</a>`
}

async function sendBrevoTemplate(
  to: string | string[],
  templateId: string | undefined,
  params: Record<string, string>,
  fallback: { subject: string; body: string; htmlContent?: string },
  bcc?: string[],
  replyTo?: string
): Promise<void> {
  const key = process.env.BREVO_API_KEY
  if (!key) {
    throw new Error("BREVO_API_KEY is not configured")
  }

  const toList = (Array.isArray(to) ? to : [to])
    .map((e) => String(e || "").trim().toLowerCase())
    .filter(Boolean)
  const uniqueTo = [...new Set(toList)]
  if (!uniqueTo.length) throw new Error("No recipient email")

  const bccList = (bcc || [])
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => e && !uniqueTo.includes(e))
  const bccField = bccList.length ? { bcc: bccList.map((email) => ({ email })) } : {}
  const replyField = replyTo ? { replyTo: { email: replyTo } } : {}
  const toField = { to: uniqueTo.map((email) => ({ email })) }

  // Tip Gmail toward Primary: transactional tags + no marketing-list headers.
  const transactionalMeta = {
    tags: ["transactional", "reloved-delivery"],
    headers: {
      "X-Mailin-custom": "transactional=true;category=delivery",
      Precedence: "auto_reply",
    },
  }

  const payload = templateId
    ? { ...toField, templateId: Number(templateId), params, ...bccField, ...replyField, ...transactionalMeta }
    : {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "mail@reloved.digital",
          name: process.env.BREVO_SENDER_NAME || "reloved",
        },
        ...toField,
        subject: fallback.subject,
        htmlContent: fallback.htmlContent || `<p>${fallback.body}</p>`,
        ...bccField,
        ...replyField,
        ...transactionalMeta,
      }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": key },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error(`Brevo email failed: ${res.status} ${await res.text()}`)
  }
}

/** Donor-facing confirmation for the Give flow. */
export async function sendDonationConfirmation(
  email: string,
  params: { firstName: string; itemTitle: string; reference: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DONATION_CONFIRMATION_TEMPLATE_ID,
    { FIRST_NAME: params.firstName, ITEM_TITLE: params.itemTitle, REFERENCE: params.reference },
    {
      subject: "Your donation is live on RE-LOVED",
      body: `Thanks ${params.firstName}, your donation of ${params.itemTitle} is now live on the Wall of Kindness. Your reference is ${params.reference}.`,
    }
  )
}

/**
 * One consolidated email for a multi-item bulk drop (instead of one per item).
 * Brevo's stored-template params are HTML-escaped (no raw-HTML / triple-brace
 * support), so a per-item row list can't be injected via a template param —
 * this builds the full branded email in code instead, matching the single-item
 * template's design, and always sends it as direct HTML (never via templateId).
 */
export async function sendDonationConfirmationMulti(
  email: string,
  params: { firstName: string; items: { itemTitle: string; reference: string }[] }
): Promise<void> {
  const count = params.items.length
  const itemsList = params.items.map((it) => `${it.itemTitle} (ref ${it.reference})`).join(", ")
  const itemRowsHtml = params.items
    .map(
      (it) => `
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111; border-radius:6px; margin-bottom:10px;">
                      <tr>
                        <td style="padding: 0 3px 3px 0;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border:1.5px solid #111111; border-radius:6px;">
                            <tr>
                              <td style="padding: 14px 18px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="font-size:14px; font-weight:700; color:#111111;">${it.itemTitle}</td>
                                    <td align="right">
                                      <span style="display:inline-block; background-color:#C6F136; border:1px solid #111111; border-radius:4px; padding:3px 8px; font-size:11px; font-weight:800; letter-spacing:1px; color:#111111; white-space:nowrap;">${it.reference}</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>`
    )
    .join("")

  const htmlContent = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>We've got your items, RE-LOVED</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  body, table, td { font-family: 'Manrope', Arial, Helvetica, sans-serif; }
  body { margin: 0; padding: 0; background-color: #EBE7DF; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table { border-collapse: collapse; }
  img { border: 0; display: block; }
  a { text-decoration: none; }
  .fluid { width: 100%; max-width: 540px; }
  @media only screen and (max-width: 600px) {
    .outer-pad { padding-left: 12px !important; padding-right: 12px !important; }
    .pad { padding-left: 22px !important; padding-right: 22px !important; padding-top: 30px !important; padding-bottom: 26px !important; }
    .headline { font-size: 22px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#EBE7DF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EBE7DF;">
<tr>
<td align="center" class="outer-pad" style="padding: 40px 16px;">
  <table role="presentation" class="fluid" align="center" cellpadding="0" cellspacing="0" style="width:100%; max-width:540px;">
    <tr>
      <td align="center" style="padding-bottom: 26px;">
        <img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=16" width="260" height="71" alt="RELOVED" style="display:block; border:0; width:260px; height:71px; max-width:100%;">
      </td>
    </tr>
    <tr>
      <td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111; border-radius:8px;">
          <tr>
            <td style="padding: 0 4px 4px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border:1.5px solid #111111; border-radius:8px;">
                <tr>
                  <td class="pad" style="padding: 40px 44px 36px 44px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background-color:#5C8A22; border-radius:20px; padding: 6px 16px;">
                          <span style="font-size:11px; font-weight:900; letter-spacing:2px; text-transform:uppercase; color:#FFFFFF; white-space:nowrap;">Thank You</span>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-top: 20px; padding-bottom: 8px;">
                          <span class="headline" style="font-size:28px; line-height:1.15; font-weight:900; text-transform:uppercase; color:#111111;">We&rsquo;ve got your ${count} items</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom: 24px;">
                          <span style="font-size:14px; line-height:1.6; color:#595959;">Hi ${params.firstName}, thanks for giving these items a second life. We&rsquo;ll email you once each one is matched with someone who needs it.</span>
                        </td>
                      </tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr><td>${itemRowsHtml}</td></tr>
                    </table>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-top: 14px;">
                          <span style="font-size:13px; line-height:1.6; color:#595959;">Track these anytime from your RE&#8209;LOVED account. Sign in with this email or your phone number to see their status.</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding-top: 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#111111; border-radius:6px;">
          <tr>
            <td align="center" style="padding: 18px 20px;">
              <span style="font-style:italic; font-size:14px; font-weight:800; color:#C6F136;">&ldquo;Because preloved only costs kindness.&rdquo;</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 26px 16px 0 16px;">
        <span style="font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#595959;">RE&#8209;LOVED &middot; Preloved for Free</span>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding: 6px 16px 0 16px;">
        <span style="font-size:11px; color:#8a8a8a;">This is an automated message, please don't reply to this email.</span>
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`

  await sendBrevoTemplate(
    email,
    undefined,
    {},
    {
      subject: `We've got your ${count} items - RE-LOVED`,
      body: `Thanks ${params.firstName}, your ${count} donations are now live on the Wall of Kindness: ${itemsList}.`,
      htmlContent,
    }
  )
}

export async function sendDonationAdminAlert(
  email: string | string[],
  params: {
    donorName: string
    itemTitle: string
    category: string
    locality: string
    reference: string
    submissionId?: string
    itemId?: string
    phone?: string | null
    donorEmail?: string | null
  }
): Promise<void> {
  const dashboardUrl = `${PUBLIC_APP_URL}/admin/donations`
  const phoneDisplay = params.phone ? String(params.phone).replace(/\D/g, "").slice(-10) : ""
  const phoneLine = phoneDisplay ? `+91 ${phoneDisplay}` : "Not on file"
  const emailLine = params.donorEmail || "Not on file"

  let removeUrl = dashboardUrl
  let contactUrl = dashboardUrl
  if (params.submissionId && params.itemId) {
    removeUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "remove_wall",
        kind: "donation",
        subjectId: params.submissionId,
        itemId: params.itemId,
      })
    )
    contactUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "contact_user",
        kind: "donation",
        subjectId: params.submissionId,
        itemId: params.itemId,
      })
    )
  }

  const htmlContent = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">New clothes on the Wall of Kindness</h2>
  <p style="margin:0 0 16px;line-height:1.5">A drop was auto-published - no approval step. Review below or act with one tap.</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
    <tr><td style="padding:6px 0;color:#666;width:120px">Item</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.itemTitle)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Category</td><td style="padding:6px 0">${escapeHtml(params.category)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Dropper</td><td style="padding:6px 0">${escapeHtml(params.donorName)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Phone</td><td style="padding:6px 0">${escapeHtml(phoneLine)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0">${escapeHtml(emailLine)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Area</td><td style="padding:6px 0">${escapeHtml(params.locality)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Reference</td><td style="padding:6px 0">${escapeHtml(params.reference)}</td></tr>
  </table>
  <p style="margin:0 0 8px">
    ${opsBtn(removeUrl, "Remove from Wall of Kindness", "#dc2626")}
    ${opsBtn(contactUrl, "Contact user", "#2563eb")}
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#666">
    <strong>Contact user</strong> rings Reloved ops first, then bridges the dropper via masked call (number on file).
    Links expire in 7 days.
  </p>
  <p style="margin:12px 0 0;font-size:13px"><a href="${dashboardUrl}">Open Gives in admin</a></p>
</div>`.trim()

  const recipients = Array.isArray(email) ? email : [email]
  await sendBrevoTemplate(
    recipients,
    undefined,
    {
      DONOR_NAME: params.donorName,
      ITEM_TITLE: params.itemTitle,
      CATEGORY: params.category,
      LOCALITY: params.locality,
      REFERENCE: params.reference,
      DASHBOARD_URL: dashboardUrl,
      REMOVE_URL: removeUrl,
      CONTACT_URL: contactUrl,
      DONOR_PHONE: phoneLine,
    },
    {
      subject: `New clothes on Wall - ${params.itemTitle}`,
      body: `${params.donorName} dropped ${params.itemTitle} (${params.category}) from ${params.locality}. Ref ${params.reference}. Phone ${phoneLine}.`,
      htmlContent,
    }
  )
}

/** Requester-facing confirmation for the Take / claim flow. */
export async function sendClaimConfirmation(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle },
    {
      subject: "Your request is in! ❤️ - RE-LOVED",
      body: `Hi ${params.requesterName}, your request is in! ❤️ We’ll let you know when the dropper responds about ${params.itemTitle}.`,
    }
  )
}

export async function sendClaimAdminAlert(
  email: string | string[],
  params: {
    requesterName: string
    itemTitle: string
    requesterPhone: string
    requestId?: string
    itemId?: string
  }
): Promise<void> {
  const dashboardUrl = `${PUBLIC_APP_URL}/admin/item-requests`
  const phoneDisplay = params.requesterPhone ? String(params.requesterPhone).replace(/\D/g, "").slice(-10) : ""
  const phoneLine = phoneDisplay ? `+91 ${phoneDisplay}` : "Not on file"

  let declineUrl = dashboardUrl
  let contactUrl = dashboardUrl
  if (params.requestId) {
    declineUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "decline_claim",
        kind: "claim",
        subjectId: params.requestId,
        itemId: params.itemId,
      })
    )
    contactUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "contact_user",
        kind: "claim",
        subjectId: params.requestId,
        itemId: params.itemId,
      })
    )
  }

  const htmlContent = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">New item request</h2>
  <p style="margin:0 0 16px;line-height:1.5">Someone asked to Relove an item. Decline or call without opening the admin portal.</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
    <tr><td style="padding:6px 0;color:#666;width:120px">Item</td><td style="padding:6px 0;font-weight:600">${escapeHtml(params.itemTitle)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Claimer</td><td style="padding:6px 0">${escapeHtml(params.requesterName)}</td></tr>
    <tr><td style="padding:6px 0;color:#666">Phone</td><td style="padding:6px 0">${escapeHtml(phoneLine)}</td></tr>
  </table>
  <p style="margin:0 0 8px">
    ${opsBtn(declineUrl, "Decline request", "#dc2626")}
    ${opsBtn(contactUrl, "Contact user", "#2563eb")}
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#666">Links expire in 7 days. Accept still happens in admin or from the giver.</p>
  <p style="margin:12px 0 0;font-size:13px"><a href="${dashboardUrl}">Open Claim Requests</a></p>
</div>`.trim()

  await sendBrevoTemplate(
    Array.isArray(email) ? email : [email],
    undefined,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      REQUESTER_PHONE: params.requesterPhone,
      DASHBOARD_URL: dashboardUrl,
      DECLINE_URL: declineUrl,
      CONTACT_URL: contactUrl,
    },
    {
      subject: `New item request - ${params.itemTitle}`,
      body: `${params.requesterName} (${phoneLine}) requested ${params.itemTitle}.`,
      htmlContent,
    }
  )
}

/** First-time-onboarding welcome. Fires once, right after a brand-new donor profile is created. */
export async function sendWelcomeEmail(email: string, params: { firstName: string }): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_WELCOME_TEMPLATE_ID,
    { FIRST_NAME: params.firstName },
    {
      subject: "Welcome to RE-LOVED",
      body: `Hi ${params.firstName}, welcome to RE-LOVED! You're all set to give or claim preloved items.`,
    }
  )
}

/** Coming-soon waitlist join on reloved.digital. */
export async function sendWaitlistWelcomeEmail(
  email: string,
  params: { firstName: string; intent: "donate" | "claim" }
): Promise<void> {
  const intentLine = waitlistIntentLine(params.intent)
  const html = waitlistWelcomeHtml({ firstName: params.firstName, intentLine })
  await sendBrevoTemplate(
    email,
    process.env.BREVO_WAITLIST_WELCOME_TEMPLATE_ID,
    { FIRST_NAME: params.firstName, INTENT_LINE: intentLine },
    {
      subject: "Welcome to the Waitlist - RE-LOVED",
      body: `Hi ${params.firstName}, welcome to the Reloved waitlist. We'll email you when we open in Mumbai.`,
      htmlContent: html,
    }
  )
}

/** Closes the loop the donor-confirmation email opened - tells them what happened after review. */
export async function sendDonationDecision(
  email: string,
  params: { firstName: string; itemTitle: string; approved: boolean; reason?: string }
): Promise<void> {
  const message = params.approved
    ? "Great news - your donation passed review and is now live on the Wall of Kindness."
    : `Your donation wasn't approved this time.${params.reason ? ` Reason: ${params.reason}` : ""}`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DONATION_DECISION_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      DECISION_LABEL: params.approved ? "Approved" : "Not Approved",
      DECISION_COLOR: params.approved ? "#5C8A22" : "#E63946",
      DECISION_MESSAGE: message,
    },
    {
      subject: params.approved ? "Your donation is live on RE-LOVED" : "Update on your RE-LOVED donation",
      body: `Hi ${params.firstName}, re: ${params.itemTitle} - ${message}`,
    }
  )
}

/** Closes the loop the claim-confirmation email opened - tells them what happened after review. */
export async function sendClaimDecision(
  email: string,
  params: {
    requesterName: string
    itemTitle: string
    approved: boolean
    nextSteps?: string
    softDecline?: boolean
  }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  const wallUrl = shortPublicUrl("wall")

  if (params.approved) {
    const message = "great news - you're matched."
    const nextSteps =
      params.nextSteps ||
      "Your item has been accepted! Open your profile to share handover details with the giver."
    await sendBrevoTemplate(
      email,
      process.env.BREVO_CLAIM_DECISION_TEMPLATE_ID,
      {
        REQUESTER_NAME: params.requesterName,
        ITEM_TITLE: params.itemTitle,
        DECISION_LABEL: "Matched",
        DECISION_COLOR: "#5C8A22",
        DECISION_MESSAGE: message,
        HEADLINE: "You're matched",
        NEXT_STEPS: nextSteps,
        PROFILE_URL: profileUrl,
        CTA_LABEL: "Open your profile",
        WALL_URL: wallUrl,
      },
      {
        subject: "Yayyy! 🎉 The dropper has accepted your request",
        body: `Hi ${params.requesterName}, Yayyy! 🎉 The dropper has accepted your request for ${params.itemTitle}. ${nextSteps} ${profileUrl}`,
      }
    )
    return
  }

  // Soft decline - never say "rejected"
  const message =
    "we couldn't match you this time - distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby."
  const nextSteps =
    params.nextSteps ||
    "This isn't a rejection of you - sometimes distance or timing just doesn't line up. Keep exploring the Wall whenever you're ready."
  const htmlContent = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:560px;">
        <tr><td style="padding:28px 24px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#EC2F9B;">Couldn't match</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;text-transform:uppercase;">Hi ${escapeHtml(params.requesterName)}</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">About <strong>${escapeHtml(params.itemTitle)}</strong> - ${escapeHtml(message)}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;color:#444;">${escapeHtml(nextSteps)}</p>
          <a href="${wallUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Browse the Wall</a>
          <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · The digital Wall of Kindness</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  await sendBrevoTemplate(
    email,
    // Soft-decline has dedicated template when set; otherwise use HTML fallback
    // (do not reuse the "Matched" decision template).
    process.env.BREVO_CLAIM_DECLINE_TEMPLATE_ID || undefined,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      DECISION_LABEL: "Couldn't match",
      DECISION_COLOR: "#EC2F9B",
      DECISION_MESSAGE: message,
      HEADLINE: "Couldn't match this time",
      NEXT_STEPS: nextSteps,
      PROFILE_URL: wallUrl,
      CTA_LABEL: "Browse the Wall",
      WALL_URL: wallUrl,
    },
    {
      subject: "Update on your RE-LOVED request - browse nearby",
      body: `Hi ${params.requesterName}, re: ${params.itemTitle} - ${message} ${nextSteps} ${wallUrl}`,
      htmlContent,
    }
  )
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Giver-facing alert when someone requests their Wall item (before admin decision). */
export async function sendItemClaimNotifyGiver(
  email: string,
  params: { firstName: string; itemTitle: string; giftUrl?: string }
): Promise<void> {
  const longUrl =
    params.giftUrl ||
    `${PUBLIC_APP_URL}/account?tab=giving`
  const profileUrl = await shortenAppUrl(longUrl, {
    title: `Gift: ${params.itemTitle}`.slice(0, 80),
    tags: ["reloved", "gift", "claim-notify"],
  })
  await sendBrevoTemplate(
    email,
    process.env.BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
    },
    {
      subject: `Someone would love to Relove your drop! ❤️`,
      body: `Hi ${params.firstName}, someone would love to Relove your drop! ❤️ Your item (${params.itemTitle}) is being matched. Open that gift to Accept or Decline (no need to browse the whole list): ${profileUrl}`,
    }
  )
}

/** Giver-facing: claimer cancelled their request - item is back on the Wall. */
export async function sendClaimCancelledToGiver(
  email: string,
  params: { firstName: string; itemTitle: string }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  await sendBrevoTemplate(
    email,
    process.env.BREVO_CLAIM_CANCELLED_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
    },
    {
      subject: `Claim cancelled - ${params.itemTitle} is back on the Wall`,
      body: `Hi ${params.firstName}, the requester cancelled their claim on ${params.itemTitle}. It's live on the Wall again for someone else.`,
    }
  )
}

export async function sendPartnerApplicationConfirmation(
  email: string,
  params: { orgName: string; contactPerson: string; reference: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_PARTNER_CONFIRMATION_TEMPLATE_ID,
    { ORG_NAME: params.orgName, CONTACT_PERSON: params.contactPerson, REFERENCE: params.reference },
    {
      subject: "We've received your partner application - RE-LOVED",
      body: `Thanks ${params.contactPerson}, we've received ${params.orgName}'s partner application. Reference ${params.reference}. Our team will verify and respond within 48 hours.`,
    }
  )
}

export async function sendPartnerApplicationAdminAlert(
  email: string | string[],
  params: { orgName: string; contactPerson: string; phone: string; email: string; locality: string; reference: string }
): Promise<void> {
  const dashboardUrl = `${PUBLIC_APP_URL}/admin/partners`
  await sendBrevoTemplate(
    Array.isArray(email) ? email : [email],
    process.env.BREVO_PARTNER_ADMIN_TEMPLATE_ID,
    {
      ORG_NAME: params.orgName,
      CONTACT_PERSON: params.contactPerson,
      PHONE: params.phone,
      EMAIL: params.email,
      LOCALITY: params.locality,
      REFERENCE: params.reference,
      DASHBOARD_URL: dashboardUrl,
    },
    {
      subject: "New partner application - RE-LOVED",
      body: `${params.orgName} (${params.contactPerson}, ${params.phone}) applied to partner from ${params.locality}. Reference ${params.reference}.`,
      htmlContent: `<p><strong>${escapeHtml(params.orgName)}</strong> applied to partner.</p><p>${escapeHtml(params.contactPerson)} · ${escapeHtml(params.phone)} · ${escapeHtml(params.email)}</p><p>${escapeHtml(params.locality)} · Ref ${escapeHtml(params.reference)}</p><p><a href="${dashboardUrl}">Open Partners in admin</a></p>`,
    }
  )
}

export async function sendContactMessageAdminAlert(
  email: string | string[],
  params: {
    name: string
    email: string
    phone?: string | null
    subject: string
    message: string
    contactMessageId?: string
  }
): Promise<void> {
  const dashboardUrl = `${PUBLIC_APP_URL}/admin/messages`
  const phoneDisplay = params.phone ? String(params.phone).replace(/\D/g, "").slice(-10) : ""
  const phoneLine = phoneDisplay ? `+91 ${phoneDisplay}` : ""

  let contactUrl = dashboardUrl
  if (params.contactMessageId) {
    contactUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "contact_user",
        kind: "contact",
        subjectId: params.contactMessageId,
      })
    )
  }

  const htmlContent = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">Contact form</h2>
  <p><strong>${escapeHtml(params.name)}</strong> (${escapeHtml(params.email)}${phoneLine ? ` · ${escapeHtml(phoneLine)}` : ""})</p>
  <p><strong>${escapeHtml(params.subject)}</strong></p>
  <p>${escapeHtml(params.message).replace(/\n/g, "<br/>")}</p>
  <p style="margin:16px 0 8px">
    ${phoneDisplay ? opsBtn(contactUrl, "Contact user", "#2563eb") : ""}
  </p>
  <p style="font-size:13px"><a href="${dashboardUrl}">Open Contact in admin</a> - or hit Reply (Reply-To is the sender).</p>
</div>`.trim()

  await sendBrevoTemplate(
    Array.isArray(email) ? email : [email],
    undefined,
    {
      NAME: params.name,
      EMAIL: params.email,
      PHONE: phoneLine,
      SUBJECT: params.subject,
      MESSAGE: params.message,
      DASHBOARD_URL: dashboardUrl,
      CONTACT_URL: contactUrl,
    },
    {
      subject: `Contact: ${params.subject} - from ${params.name}`,
      body: `${params.name} (${params.email}${phoneLine ? ` · ${phoneLine}` : ""}) wrote:\n\n${params.message}`,
      htmlContent,
    },
    undefined,
    params.email
  )
}

/** Admin replies to a public contact-form submission - emails the original sender. */
export async function sendContactReplyToUser(
  email: string,
  params: { name: string; subject: string; originalMessage: string; replyBody: string }
): Promise<void> {
  const first = (params.name || "there").split(" ")[0] || "there"
  await sendBrevoTemplate(
    email,
    process.env.BREVO_CONTACT_REPLY_TEMPLATE_ID,
    {
      FIRST_NAME: first,
      SUBJECT: params.subject,
      ORIGINAL_MESSAGE: params.originalMessage,
      REPLY_BODY: params.replyBody,
    },
    {
      subject: `Re: ${params.subject} - RE-LOVED`,
      body: `Hi ${first},\n\n${params.replyBody}\n\n -  Reloved team\n\n(Regarding your message: "${params.originalMessage.slice(0, 120)}")`,
      htmlContent: `<p>Hi ${first},</p><p>${params.replyBody.replace(/\n/g, "<br/>")}</p><p> -  Reloved team</p><hr/><p style="color:#666;font-size:12px">Your message: ${params.originalMessage.replace(/\n/g, "<br/>")}</p>`,
    }
  )
}

/** Pings ops when a donor/claimer sends a chat message on an approved order thread. */
export async function sendNewMessageAdminAlert(
  email: string | string[],
  params: {
    senderName: string
    itemTitle: string
    preview: string
    dashboardUrl: string
    subjectType?: "donation" | "claim" | "support"
    subjectId?: string
    itemId?: string
  }
): Promise<void> {
  let contactUrl = params.dashboardUrl
  if (params.subjectType && params.subjectId) {
    contactUrl = opsEmailActionUrl(
      signOpsEmailAction({
        action: "contact_user",
        kind: params.subjectType,
        subjectId: params.subjectId,
        itemId: params.itemId,
      })
    )
  }

  const htmlContent = `
<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">New Reloved chat message</h2>
  <p><strong>${escapeHtml(params.senderName)}</strong> on <strong>${escapeHtml(params.itemTitle)}</strong></p>
  <p style="background:#f5f5f5;padding:12px;border-radius:6px">"${escapeHtml(params.preview)}"</p>
  <p style="margin:16px 0 8px">
    ${params.subjectId ? opsBtn(contactUrl, "Contact user", "#2563eb") : ""}
  </p>
  <p style="font-size:13px"><a href="${escapeHtml(params.dashboardUrl)}">Reply in admin</a></p>
</div>`.trim()

  await sendBrevoTemplate(
    Array.isArray(email) ? email : [email],
    undefined,
    {
      SENDER_NAME: params.senderName,
      ITEM_TITLE: params.itemTitle,
      PREVIEW: params.preview,
      DASHBOARD_URL: params.dashboardUrl,
      CONTACT_URL: contactUrl,
    },
    {
      subject: `New message - ${params.itemTitle}`,
      body: `${params.senderName} wrote on ${params.itemTitle}: "${params.preview}". Reply: ${params.dashboardUrl}`,
      htmlContent,
    }
  )
}

/** Tells a donor/claimer ops (or peer) replied on their order thread. */
export async function sendNewMessageDonorAlert(
  email: string,
  params: { firstName: string; itemTitle: string; preview: string; fromReloved?: boolean }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  const fromReloved = params.fromReloved !== false
  await sendBrevoTemplate(
    email,
    process.env.BREVO_NEW_MESSAGE_DONOR_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PREVIEW: params.preview,
      PROFILE_URL: profileUrl,
    },
    {
      subject: fromReloved
        ? `RE-LOVED replied - ${params.itemTitle}`
        : `New message - ${params.itemTitle}`,
      body: fromReloved
        ? `Hi ${params.firstName}, RE-LOVED ops replied on ${params.itemTitle}: "${params.preview}". Open your profile to reply: ${profileUrl}`
        : `Hi ${params.firstName}, new message on ${params.itemTitle}: "${params.preview}". Open your profile: ${profileUrl}`,
    }
  )
}

// --- Borzo/Porter delivery-stage updates (manual admin trigger - see
// routes/admin.ts PATCH /item-requests/:id/delivery) ---

/** Giver-facing: rider booked / on the way to their building gate - leave bag with security. */
export async function sendDeliveryRiderDispatchedToGiver(
  email: string,
  params: { firstName: string; itemTitle: string; giftUrl?: string; borzoTrackingUrl?: string }
): Promise<void> {
  const profileUrl = params.giftUrl
    ? await shortenAppUrl(params.giftUrl, { title: `Gift ${params.itemTitle}`.slice(0, 80) })
    : shortPublicUrl("account")
  const liveTracking = params.borzoTrackingUrl || profileUrl
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
      BORZO_TRACKING_URL: liveTracking,
    },
    {
      subject: `Action required — rider coming for ${params.itemTitle}`,
      body: `Hi ${params.firstName}, a courier rider has been dispatched to collect ${params.itemTitle}.\n\n1) Bag the item.\n2) Hand it to main gate security now.\n\nTrack Borzo courier: ${liveTracking}\nTrack in Reloved: ${profileUrl}`,
      htmlContent: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <h2 style="margin:0 0 12px;font-size:20px">Action required — rider coming for ${escapeHtml(params.itemTitle)}</h2>
  <p style="margin:0 0 12px;line-height:1.5">A courier rider has been dispatched to your building gate to collect <strong>${escapeHtml(params.itemTitle)}</strong>.</p>
  <ol style="margin:0 0 20px;padding-left:20px;line-height:1.6">
    <li>Bag the item cleanly.</li>
    <li>Hand it to main gate security now.</li>
    <li>Inform security a courier rider will pick it up.</li>
  </ol>
  <p style="margin:20px 0 8px">
    <a href="${escapeHtml(liveTracking)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;border-radius:6px;margin-right:8px;font-size:14px">Track Borzo Courier Live 🚴</a>
    <a href="${escapeHtml(profileUrl)}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;font-weight:700;border-radius:6px;font-size:14px">Open Reloved Account</a>
  </p>
</div>`.trim(),
    }
  )
}

/** @deprecated Mid-stage ping removed - prefer rider_dispatched + delivered only. Kept for HTML fallback if re-enabled. */
export async function sendDeliveryPickedUpToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_PICKED_UP_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle, PROFILE_URL: shortPublicUrl("account") },
    {
      subject: `On its way - ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, your rider has collected ${params.itemTitle} from the giver's building and is on the way to you.`,
    }
  )
}

/** Delivery completed - claimer side, closes the loop. */
export async function sendDeliveryDeliveredToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle },
    {
      subject: `It’s yours! ♡ - ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, It’s yours! ♡ Thank you for giving this piece a new chapter. It’s officially Reloved. Congratulations, you have benefited from someone's goodness. Don't forget to pay it forward.`,
    }
  )
}

/** Delivery completed - giver side, thank-you close for the person who paid the courier. */
export async function sendDeliveryDeliveredToGiver(
  email: string,
  params: { firstName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID,
    { FIRST_NAME: params.firstName, ITEM_TITLE: params.itemTitle },
    {
      subject: `Thank you for passing it on. ♡ - ${params.itemTitle}`,
      body: `Hi ${params.firstName}, Thank you for passing it on. ♡ You just made something Reloved - ${params.itemTitle}.`,
    }
  )
}

/** Pickup or drop failed - sent to whichever side ops picks (giver at pickup, claimer at drop). */
export async function sendDeliveryFailedNotice(
  email: string,
  params: { name: string; itemTitle: string; audience: "giver" | "claimer"; reason?: string }
): Promise<void> {
  const reasonLine = params.reason?.trim() ? ` (${params.reason.trim()})` : ""
  const message =
    params.audience === "giver"
      ? `the rider couldn't collect ${params.itemTitle}${reasonLine}. Our team will reach out to reschedule pickup.`
      : `delivery of ${params.itemTitle}${reasonLine} didn't go through. Our team will reach out to reschedule.`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_FAILED_TEMPLATE_ID,
    {
      NAME: params.name,
      ITEM_TITLE: params.itemTitle,
      AUDIENCE: params.audience,
      REASON: params.reason || "",
      MESSAGE: message,
    },
    { subject: `Delivery issue - ${params.itemTitle}`, body: `Hi ${params.name}, ${message}` },
    [ADMIN_BCC]
  )
}

export async function sendDeliveryDetailsToGiver(
  email: string,
  params: { firstName: string; itemTitle: string; receiverAddress: string }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_DETAILS_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      RECEIVER_ADDRESS: params.receiverAddress,
      PROFILE_URL: profileUrl,
    },
    {
      subject: "Delivery details received 📍",
      body: `Hi ${params.firstName}, delivery details received 📍\n${params.receiverAddress}\nPlease arrange the handover for ${params.itemTitle}. ${profileUrl}`,
    }
  )
}

export async function sendReloveDeliveredToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  await sendBrevoTemplate(
    email,
    process.env.BREVO_RELOVE_DELIVERED_CLAIMER_TEMPLATE_ID,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
    },
    {
      subject: "Your Relove has been delivered ❤️",
      body: `Hi ${params.requesterName}, your Relove (${params.itemTitle}) has been delivered ❤️ Confirm Received on your profile: ${profileUrl}`,
    }
  )
}

/** User must add missing email/phone — no BCC/CC (ops leave this quiet). */
export async function sendProfileActionRequired(
  email: string,
  params: { firstName: string; itemTitle?: string }
): Promise<void> {
  const accountUrl = shortPublicUrl("account")
  const itemLine = params.itemTitle
    ? ` Your claim for <strong>${escapeHtml(params.itemTitle)}</strong> needs this before we can continue delivery.`
    : ""
  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#EC2F9B;color:#fff;display:inline-block;padding:6px 12px;">Action required</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">Update your Reloved profile</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(params.firstName || "there")}, please take action: open your Reloved account and <strong>complete your profile</strong> (add your email if missing).${itemLine}</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444;">We need this for the next delivery steps — confirming building and time so Reloved can book Porter.</p>
  <a href="${accountUrl}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Open your account</a>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
  await sendBrevoTemplate(
    email,
    undefined,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle || "",
      ACCOUNT_URL: accountUrl,
    },
    {
      subject: "Action required — update your Reloved profile for delivery",
      body: `Hi ${params.firstName}, please update your Reloved profile (add email if missing) so we can continue delivery${params.itemTitle ? ` for ${params.itemTitle}` : ""}. ${accountUrl}`,
      htmlContent,
    }
    // no bcc / no replyTo
  )
}

/** Flow #4 — dropper: delivery is lined up, keep the item ready. */
export async function sendDeliveryReadyToGiver(
  email: string,
  params: { firstName: string; itemTitle: string; slotLabel?: string }
): Promise<void> {
  const profileUrl = shortPublicUrl("account")
  const when = params.slotLabel ? ` Pickup window: ${params.slotLabel}.` : ""
  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#C6F136;color:#111;display:inline-block;padding:6px 12px;">Delivery ready</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">Please be ready with your item</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(params.firstName || "there")}, delivery for <strong>${escapeHtml(params.itemTitle)}</strong> is ready.${escapeHtml(when)}</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444;">Bag the item and leave it with your building’s main gate security when the rider is due.</p>
  <a href="${profileUrl}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Open your account</a>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_READY_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      SLOT_LABEL: params.slotLabel || "",
      PROFILE_URL: profileUrl,
    },
    {
      subject: `Delivery ready — please be ready with ${params.itemTitle}`,
      body: `Hi ${params.firstName}, delivery for ${params.itemTitle} is ready.${when} Bag it and leave it with building gate security. ${profileUrl}`,
      htmlContent,
    }
  )
}

/** Flow #5 — date/time set; open account to modify or cancel. */
export async function sendScheduleSetEmail(
  email: string,
  params: {
    firstName: string
    itemTitle: string
    slotLabel: string
    audience: "giver" | "claimer"
    claimId?: string
    giftUrl?: string
  }
): Promise<void> {
  const accountUrl =
    params.audience === "claimer" && params.claimId
      ? await shortenAppUrl(`/account/claims/${params.claimId}`, {
          title: `Claim ${params.itemTitle}`.slice(0, 80),
          tags: ["reloved", "claim"],
        })
      : params.giftUrl
        ? await shortenAppUrl(params.giftUrl, {
            title: `Gift ${params.itemTitle}`.slice(0, 80),
            tags: ["reloved", "gift"],
          })
        : shortPublicUrl("account")
  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#EC2F9B;color:#fff;display:inline-block;padding:6px 12px;">Schedule set</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">Date &amp; time confirmed</h1>
  <p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(params.firstName || "there")}, the date and time for <strong>${escapeHtml(params.itemTitle)}</strong> have been set${params.slotLabel ? ` (<strong>${escapeHtml(params.slotLabel)}</strong>)` : ""}.</p>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#444;">Please check your email / Reloved account to make any modifications, or get in touch with us if you need help.</p>
  <a href="${accountUrl}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;">Open Reloved account</a>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_SCHEDULE_SET_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      SLOT_LABEL: params.slotLabel,
      AUDIENCE: params.audience,
      ACCOUNT_URL: accountUrl,
    },
    {
      subject: `Date & time set — ${params.itemTitle}`,
      body: `Hi ${params.firstName}, the date and time have been set for ${params.itemTitle}${params.slotLabel ? ` (${params.slotLabel})` : ""}. Please check your email / Reloved account to make any modifications, or get in touch with us. ${accountUrl}`,
      htmlContent,
    }
  )
}

/** Flow #6 — claimer: order dispatched / on the way. */
export async function sendOrderDispatchedToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string; claimId?: string; borzoTrackingUrl?: string }
): Promise<void> {
  const profileUrl = params.claimId
    ? await shortenAppUrl(`/account/claims/${params.claimId}`, {
        title: `Claim ${params.itemTitle}`.slice(0, 80),
        tags: ["reloved", "claim"],
      })
    : shortPublicUrl("account")
  const liveTracking = params.borzoTrackingUrl || profileUrl
  const htmlContent = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#EBE7DF;padding:32px 16px;"><tr><td align="center">
  <table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:540px;">
  <tr><td style="padding:32px 28px;">
  <p style="margin:0 0 8px;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;background:#2563eb;color:#fff;display:inline-block;padding:6px 12px;">Dispatched</p>
  <h1 style="margin:16px 0;font-size:26px;line-height:1.15;text-transform:uppercase;">Your order is on the way 🚚</h1>
  <p style="margin:0 0 20px;font-size:15px;line-height:1.55;">Hi ${escapeHtml(params.requesterName || "there")}, your Reloved order <strong>${escapeHtml(params.itemTitle)}</strong> has been dispatched! Please be available at your building gate for delivery.</p>
  <p style="margin:20px 0 8px">
    <a href="${escapeHtml(liveTracking)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin-right:8px;border-radius:4px;">Track Borzo Courier Live 🚴</a>
    <a href="${escapeHtml(profileUrl)}" style="display:inline-block;background:#111;color:#C6F136;text-decoration:none;padding:14px 20px;font-size:12px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;border-radius:4px;">Track in Account</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#777;">RE-LOVED · Preloved for Free</p>
  </td></tr></table></td></tr></table></body></html>`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_ORDER_DISPATCHED_CLAIMER_TEMPLATE_ID,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
      BORZO_TRACKING_URL: liveTracking,
    },
    {
      subject: `Your order has been dispatched — ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, your Reloved order ${params.itemTitle} has been dispatched. Track live courier: ${liveTracking} | Account: ${profileUrl}`,
      htmlContent,
    }
  )
}

/**
 * Share-a-pic invite after delivery (ops Mark delivered, or claimer Confirm received).
 * Subject/copy stay transactional so Gmail is less likely to file under Promotions.
 */
export async function sendHandoverSuccessToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string; claimId: string }
): Promise<void> {
  const claimUrl = await shortenAppUrl(`/account/claims/${params.claimId}`, {
    title: `Claim ${params.itemTitle}`.slice(0, 80),
    tags: ["reloved", "claim"],
  })
  await sendBrevoTemplate(
    email,
    process.env.BREVO_HANDOVER_SUCCESS_CLAIMER_TEMPLATE_ID,
    {
      REQUESTER_NAME: params.requesterName,
      ITEM_TITLE: params.itemTitle,
      CLAIM_URL: claimUrl,
    },
    {
      subject: `Your Reloved item was delivered — ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, your Reloved delivery of ${params.itemTitle} is complete.\n\nIf you'd like, upload a photo from your claim page so we can feature it.\n\n${claimUrl}`,
    }
  )
}

/** Both sides done - thank the giver/donor. */
export async function sendHandoverSuccessToGiver(
  email: string,
  params: { firstName: string; claimerName: string; itemTitle: string; giftUrl: string }
): Promise<void> {
  const giftUrl = await shortenAppUrl(params.giftUrl, {
    title: `Gift ${params.itemTitle}`.slice(0, 80),
    tags: ["reloved", "gift"],
  })
  await sendBrevoTemplate(
    email,
    process.env.BREVO_HANDOVER_SUCCESS_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      CLAIMER_NAME: params.claimerName,
      ITEM_TITLE: params.itemTitle,
      GIFT_URL: giftUrl,
    },
    {
      subject: "Thank you for passing it on. ♡ Your gift was Reloved",
      body: `Hi ${params.firstName}, ${params.claimerName} confirmed they received ${params.itemTitle}. You just made something Reloved. ${giftUrl}`,
    }
  )
}

/** Morning ops digest recipients (Aniket + Totem by default). */
export function opsDailyDeliveriesRecipients(): string[] {
  const fromEnv = String(process.env.OPS_DAILY_DELIVERIES_EMAILS || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (fromEnv.length) return [...new Set(fromEnv)]
  return []
}

function deliveriesRowsHtml(
  rows: Array<{
    itemTitle: string
    slotLabel: string
    giverName: string
    claimerName: string
    area: string
    statusLabel: string
  }>
): string {
  if (!rows.length) {
    return `<p style="margin:0;font-size:14px;line-height:1.6;color:#595959;">No deliveries on the board for today.</p>`
  }
  return rows
    .map(
      (r, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid #E5E1D8;border-radius:8px;">
<tr><td style="padding:14px 16px;">
<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#888;">#${i + 1} · ${escapeHtml(r.slotLabel)}</p>
<p style="margin:0 0 6px;font-size:15px;font-weight:800;color:#111;">${escapeHtml(r.itemTitle)}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#595959;">Giver: <strong style="color:#111;">${escapeHtml(r.giverName)}</strong> → Claimer: <strong style="color:#111;">${escapeHtml(r.claimerName)}</strong><br/>${escapeHtml(r.area)} · ${escapeHtml(r.statusLabel)}</p>
</td></tr></table>`
    )
    .join("")
}

/** Ops morning reminder — today's deliveries board (Brevo template #32). */
export async function sendOpsDailyDeliveriesReminder(params: {
  dateLabel: string
  deliveries: Array<{
    itemTitle: string
    slotLabel: string
    giverName: string
    claimerName: string
    area: string
    statusLabel: string
  }>
  recipients?: string[]
}): Promise<void> {
  const count = params.deliveries.length
  const countLabel = count === 1 ? "delivery" : "deliveries"
  // Live admin board (Firebase Hosting). Prefer explicit ops URL over PUBLIC_APP_URL
  // so the email always opens the working /admin dashboard.
  const adminUrl =
    String(process.env.OPS_ADMIN_URL || "").trim() ||
    "https://reloved-digital.web.app/admin"
  const listHtml = deliveriesRowsHtml(params.deliveries)
  const recipients = params.recipients?.length ? params.recipients : opsDailyDeliveriesRecipients()

  const fallbackHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#EBE7DF;font-family:Manrope,Arial,Helvetica,sans-serif;color:#111;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  <h2 style="margin:0 0 8px;">Today's deliveries</h2>
  <p style="margin:0 0 16px;color:#595959;">${escapeHtml(params.dateLabel)} — <strong>${count}</strong> ${countLabel}</p>
  ${listHtml}
  <p style="margin:24px 0 0;"><a href="${adminUrl}">Open admin</a></p>
</div></body></html>`

  await sendBrevoTemplate(
    recipients,
    process.env.BREVO_OPS_DAILY_DELIVERIES_TEMPLATE_ID,
    {
      DATE_LABEL: params.dateLabel,
      COUNT: String(count),
      COUNT_LABEL: countLabel,
      DELIVERIES_HTML: listHtml,
      ADMIN_URL: adminUrl,
    },
    {
      subject: `Today's deliveries (${count}) — ${params.dateLabel}`,
      body: `${count} ${countLabel} scheduled for ${params.dateLabel}. Open ${adminUrl}`,
      htmlContent: fallbackHtml,
    }
  )
}
