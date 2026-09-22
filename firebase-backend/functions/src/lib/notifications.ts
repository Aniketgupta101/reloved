import { waitlistIntentLine, waitlistWelcomeHtml } from "./waitlistWelcomeHtml"
import { opsEmailActionUrl, signOpsEmailAction } from "./dropEmailActions"

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "https://reloved.digital"

/** Every admin-alert email (donation/claim/partner) also goes here when not already in To. */
const ADMIN_BCC = "sheetalahuja99@gmail.com"

/** Ops triage — Us (Aniket + Totem) + Sheetal. */
export const OPS_ALERT_EMAILS = [
  "aniketgupta83003@gmail.com",
  "totemistaken@gmail.com",
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

  const payload = templateId
    ? { ...toField, templateId: Number(templateId), params, ...bccField, ...replyField }
    : {
        sender: {
          email: process.env.BREVO_SENDER_EMAIL || "no-reply@reloved.local",
          name: process.env.BREVO_SENDER_NAME || "reloved",
        },
        ...toField,
        subject: fallback.subject,
        htmlContent: fallback.htmlContent || `<p>${fallback.body}</p>`,
        ...bccField,
        ...replyField,
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

/** Donor-facing confirmation for the Give flow. Not currently called — see routes/publicWrite.ts. */
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
  const emailLine = params.donorEmail || "—"

  let removeUrl = dashboardUrl
  let contactUrl = dashboardUrl
  if (params.submissionId && params.itemId) {
    removeUrl = opsEmailActionUrl(
      PUBLIC_APP_URL,
      signOpsEmailAction({
        action: "remove_wall",
        kind: "donation",
        subjectId: params.submissionId,
        itemId: params.itemId,
      })
    )
    contactUrl = opsEmailActionUrl(
      PUBLIC_APP_URL,
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
  <p style="margin:0 0 16px;line-height:1.5">A drop was auto-published — no approval step. Review below or act with one tap.</p>
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
      subject: `New clothes on Wall — ${params.itemTitle}`,
      body: `${params.donorName} dropped ${params.itemTitle} (${params.category}) from ${params.locality}. Ref ${params.reference}. Phone ${phoneLine}.`,
      htmlContent,
    }
  )
}

/** Requester-facing confirmation for the Take flow. Not currently called — see routes/donor.ts. */
export async function sendClaimConfirmation(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle },
    {
      subject: "Your request is in! ❤️ — RE-LOVED",
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
      PUBLIC_APP_URL,
      signOpsEmailAction({
        action: "decline_claim",
        kind: "claim",
        subjectId: params.requestId,
        itemId: params.itemId,
      })
    )
    contactUrl = opsEmailActionUrl(
      PUBLIC_APP_URL,
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
      subject: `New item request — ${params.itemTitle}`,
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
      subject: "Welcome to the Waitlist — RE-LOVED",
      body: `Hi ${params.firstName}, welcome to the Reloved waitlist. We'll email you when we open in Mumbai.`,
      htmlContent: html,
    }
  )
}

/** Closes the loop the donor-confirmation email opened — tells them what happened after review. */
export async function sendDonationDecision(
  email: string,
  params: { firstName: string; itemTitle: string; approved: boolean; reason?: string }
): Promise<void> {
  const message = params.approved
    ? "Great news — your donation passed review and is now live on the Wall of Kindness."
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
      body: `Hi ${params.firstName}, re: ${params.itemTitle} — ${message}`,
    }
  )
}

/** Closes the loop the claim-confirmation email opened — tells them what happened after review. */
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
  const profileUrl = `${PUBLIC_APP_URL}/account`
  const wallUrl = `${PUBLIC_APP_URL}/drop`

  if (params.approved) {
    const message = "great news — you're matched."
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

  // Soft decline — never say "rejected"
  const message =
    "we couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby."
  const nextSteps =
    params.nextSteps ||
    "This isn't a rejection of you — sometimes distance or timing just doesn't line up. Keep exploring the Wall whenever you're ready."
  const htmlContent = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#111;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:24px 12px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:2px solid #111;max-width:560px;">
        <tr><td style="padding:28px 24px;">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#EC2F9B;">Couldn't match</p>
          <h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;text-transform:uppercase;">Hi ${escapeHtml(params.requesterName)}</h1>
          <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">About <strong>${escapeHtml(params.itemTitle)}</strong> — ${escapeHtml(message)}</p>
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
      subject: "Update on your RE-LOVED request — browse nearby",
      body: `Hi ${params.requesterName}, re: ${params.itemTitle} — ${message} ${nextSteps} ${wallUrl}`,
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
  const profileUrl =
    params.giftUrl ||
    `${PUBLIC_APP_URL}/account?tab=giving`
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

/** Giver-facing: claimer cancelled their request — item is back on the Wall. */
export async function sendClaimCancelledToGiver(
  email: string,
  params: { firstName: string; itemTitle: string }
): Promise<void> {
  const profileUrl = `${PUBLIC_APP_URL}/account`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_CLAIM_CANCELLED_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
    },
    {
      subject: `Claim cancelled — ${params.itemTitle} is back on the Wall`,
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
      subject: "We've received your partner application — RE-LOVED",
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
      subject: "New partner application — RE-LOVED",
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
      PUBLIC_APP_URL,
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
  <p style="font-size:13px"><a href="${dashboardUrl}">Open Contact in admin</a> — or hit Reply (Reply-To is the sender).</p>
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
      subject: `Contact: ${params.subject} — from ${params.name}`,
      body: `${params.name} (${params.email}${phoneLine ? ` · ${phoneLine}` : ""}) wrote:\n\n${params.message}`,
      htmlContent,
    },
    undefined,
    params.email
  )
}

/** Admin replies to a public contact-form submission — emails the original sender. */
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
      subject: `Re: ${params.subject} — RE-LOVED`,
      body: `Hi ${first},\n\n${params.replyBody}\n\n— Reloved team\n\n(Regarding your message: "${params.originalMessage.slice(0, 120)}")`,
      htmlContent: `<p>Hi ${first},</p><p>${params.replyBody.replace(/\n/g, "<br/>")}</p><p>— Reloved team</p><hr/><p style="color:#666;font-size:12px">Your message: ${params.originalMessage.replace(/\n/g, "<br/>")}</p>`,
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
    subjectType?: "donation" | "claim"
    subjectId?: string
    itemId?: string
  }
): Promise<void> {
  let contactUrl = params.dashboardUrl
  if (params.subjectType && params.subjectId) {
    contactUrl = opsEmailActionUrl(
      PUBLIC_APP_URL,
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
      subject: `New message — ${params.itemTitle}`,
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
  const profileUrl = `${PUBLIC_APP_URL}/account`
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
        ? `RE-LOVED replied — ${params.itemTitle}`
        : `New message — ${params.itemTitle}`,
      body: fromReloved
        ? `Hi ${params.firstName}, RE-LOVED ops replied on ${params.itemTitle}: "${params.preview}". Open your profile to reply: ${profileUrl}`
        : `Hi ${params.firstName}, new message on ${params.itemTitle}: "${params.preview}". Open your profile: ${profileUrl}`,
    }
  )
}

// --- Borzo/Porter delivery-stage updates (manual admin trigger — see
// routes/admin.ts PATCH /item-requests/:id/delivery) ---

/** Giver-facing: rider booked / on the way to their building gate — leave bag with security. */
export async function sendDeliveryRiderDispatchedToGiver(
  email: string,
  params: { firstName: string; itemTitle: string }
): Promise<void> {
  const profileUrl = `${PUBLIC_APP_URL}/account`
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID,
    {
      FIRST_NAME: params.firstName,
      ITEM_TITLE: params.itemTitle,
      PROFILE_URL: profileUrl,
    },
    {
      subject: `Action required — rider coming for ${params.itemTitle}`,
      body: `Hi ${params.firstName}, a Borzo rider has been dispatched to your building gate to collect ${params.itemTitle}. 1) Bag the item. 2) Hand it to main gate security now. 3) Tell them a courier is coming to pick it up.`,
    }
  )
}

/** Rider collected the item from the giver's building security — claimer side. */
export async function sendDeliveryPickedUpToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_PICKED_UP_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle, PROFILE_URL: `${PUBLIC_APP_URL}/account` },
    {
      subject: `On its way — ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, your rider has collected ${params.itemTitle} from the giver's building and is on the way to you.`,
    }
  )
}

/** Delivery completed — claimer side, closes the loop. */
export async function sendDeliveryDeliveredToClaimer(
  email: string,
  params: { requesterName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID,
    { REQUESTER_NAME: params.requesterName, ITEM_TITLE: params.itemTitle },
    {
      subject: `It’s yours! ♡ — ${params.itemTitle}`,
      body: `Hi ${params.requesterName}, It’s yours! ♡ Thank you for giving this piece a new chapter. It’s officially Reloved. Congratulations, you have benefited from someone's goodness. Don't forget to pay it forward.`,
    }
  )
}

/** Delivery completed — giver side, thank-you close for the person who paid the courier. */
export async function sendDeliveryDeliveredToGiver(
  email: string,
  params: { firstName: string; itemTitle: string }
): Promise<void> {
  await sendBrevoTemplate(
    email,
    process.env.BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID,
    { FIRST_NAME: params.firstName, ITEM_TITLE: params.itemTitle },
    {
      subject: `Thank you for passing it on. ♡ — ${params.itemTitle}`,
      body: `Hi ${params.firstName}, Thank you for passing it on. ♡ You just made something Reloved — ${params.itemTitle}.`,
    }
  )
}

/** Pickup or drop failed — sent to whichever side ops picks (giver at pickup, claimer at drop). */
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
    { subject: `Delivery issue — ${params.itemTitle}`, body: `Hi ${params.name}, ${message}` },
    [ADMIN_BCC]
  )
}

export async function sendDeliveryDetailsToGiver(
  email: string,
  params: { firstName: string; itemTitle: string; receiverAddress: string }
): Promise<void> {
  const profileUrl = `${PUBLIC_APP_URL}/account`
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
  const profileUrl = `${PUBLIC_APP_URL}/account`
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
