import { Router } from "express"
import { FieldValue } from "firebase-admin/firestore"
import { collections, getDb } from "../lib/firestore"
import { verifyOpsEmailAction } from "../lib/dropEmailActions"
import { callMaskingConfigured, connectMaskedCall, relovedOpsDialPhone } from "../lib/callMasking"
import { findDonorProfileDoc } from "../lib/donorIdentity"
import { sendClaimDecision } from "../lib/notifications"

export const opsActionRouter = Router()

function htmlPage(title: string, body: string, ok: boolean): string {
  const color = ok ? "#16a34a" : "#dc2626"
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#111}
.box{border:2px solid #111;padding:24px;box-shadow:6px 6px 0 #111}
h1{font-size:1.25rem;margin:0 0 12px;color:${color}}p{line-height:1.5;margin:0 0 8px}</style></head>
<body><div class="box"><h1>${title}</h1>${body}</div></body></html>`
}

function normalizePhone(raw: unknown): string {
  let phone = String(raw || "").replace(/\D/g, "")
  if (phone.length > 10) phone = phone.slice(-10)
  return /^[6-9]\d{9}$/.test(phone) ? phone : ""
}

/**
 * Signed email button actions (no admin login).
 * GET /api/ops/drop-action?t=...
 */
opsActionRouter.get("/drop-action", async (req, res) => {
  const token = String(req.query.t || "")
  const payload = verifyOpsEmailAction(token)
  if (!payload) {
    res
      .status(400)
      .send(
        htmlPage(
          "Link expired or invalid",
          "<p>Request a fresh alert from the Reloved admin, or open the dashboard.</p>",
          false
        )
      )
    return
  }

  const db = getDb()
  try {
    if (payload.a === "remove_wall") {
      const itemId = String(payload.i || "")
      if (!itemId) {
        res.status(400).send(htmlPage("Missing item", "<p>This remove link is incomplete.</p>", false))
        return
      }
      const itemRef = db.collection(collections.items).doc(itemId)
      const itemSnap = await itemRef.get()
      if (!itemSnap.exists) {
        res.status(404).send(htmlPage("Item not found", "<p>This listing may already have been removed.</p>", false))
        return
      }
      await itemRef.set(
        {
          publicVisibility: false,
          publicStatus: "withdrawn",
          status: "rejected",
          rejectionReason: "Removed from Wall via ops email action",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      const subRef = db.collection(collections.donationSubmissions).doc(payload.s)
      if ((await subRef.get()).exists) {
        await subRef.set(
          {
            status: "rejected",
            rejectionReason: "Removed from Wall via ops email action",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
      res
        .status(200)
        .send(
          htmlPage(
            "Removed from Wall",
            "<p>This item is no longer visible on the Wall of Kindness.</p><p>You can still find it under Gives → Declined in admin.</p>",
            true
          )
        )
      return
    }

    if (payload.a === "decline_claim") {
      const requestRef = db.collection(collections.itemRequests).doc(payload.s)
      const before = await requestRef.get()
      if (!before.exists) {
        res.status(404).send(htmlPage("Request not found", "<p>This claim may already have been handled.</p>", false))
        return
      }
      const data = before.data()!
      const current = String(data.status || "")
      if (current === "rejected") {
        res
          .status(200)
          .send(htmlPage("Already declined", "<p>This request was already declined.</p>", true))
        return
      }
      if (current === "approved") {
        res
          .status(400)
          .send(
            htmlPage(
              "Already matched",
              "<p>This request was already approved. Decline from admin if you still need to reverse it.</p>",
              false
            )
          )
        return
      }
      await requestRef.set(
        {
          status: "rejected",
          reviewedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          rejectionReason: "Declined via ops email action",
        },
        { merge: true }
      )
      const itemId = String(payload.i || data.itemId || "")
      if (itemId) {
        await db.collection(collections.items).doc(itemId).set(
          {
            publicStatus: "available",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
      const requesterTarget = String(data.requesterTarget || "")
      let requesterEmail = requesterTarget.includes("@") ? requesterTarget : null
      if (!requesterEmail && requesterTarget) {
        const profileDoc = await findDonorProfileDoc(db, requesterTarget)
        requesterEmail = (profileDoc?.data()?.email as string | undefined) || null
      }
      if (requesterEmail) {
        await sendClaimDecision(requesterEmail, {
          requesterName: String(data.requesterName || "there"),
          itemTitle: String(data.itemTitle || "your item"),
          approved: false,
          softDecline: true,
        }).catch((err) => console.error("ops decline claim email", err))
      }
      res
        .status(200)
        .send(
          htmlPage(
            "Request declined",
            "<p>The claim was declined and the item is available on the Wall again.</p><p>The claimer was emailed a soft update.</p>",
            true
          )
        )
      return
    }

    // contact_user
    let phone = ""
    let emailHint = "—"
    let label = "user"
    let subjectType: "donation" | "claim" | "contact" | "support" = payload.k
    let subjectId = payload.s
    let toLabel = "user"

    if (payload.k === "donation") {
      label = "dropper"
      toLabel = "giver"
      const subSnap = await db.collection(collections.donationSubmissions).doc(payload.s).get()
      if (!subSnap.exists) {
        res.status(404).send(htmlPage("Drop not found", "<p>Submission missing — open Gives in admin.</p>", false))
        return
      }
      const sub = subSnap.data() || {}
      phone = normalizePhone(sub.phone)
      emailHint = String(sub.email || "—")
      if (!phone && sub.donorTarget) {
        const profileDoc = await findDonorProfileDoc(db, String(sub.donorTarget))
        phone = normalizePhone(profileDoc?.data()?.phone)
        if (emailHint === "—") emailHint = String(profileDoc?.data()?.email || "—")
      }
    } else if (payload.k === "claim") {
      label = "claimer"
      toLabel = "claimer"
      const reqSnap = await db.collection(collections.itemRequests).doc(payload.s).get()
      if (!reqSnap.exists) {
        res.status(404).send(htmlPage("Claim not found", "<p>Open Claim Requests in admin.</p>", false))
        return
      }
      const claim = reqSnap.data() || {}
      phone = normalizePhone(claim.requesterPhone || claim.phone)
      const requesterTarget = String(claim.requesterTarget || "")
      emailHint = requesterTarget.includes("@") ? requesterTarget : "—"
      if (!phone && requesterTarget) {
        const profileDoc = await findDonorProfileDoc(db, requesterTarget)
        phone = normalizePhone(profileDoc?.data()?.phone)
        if (emailHint === "—") emailHint = String(profileDoc?.data()?.email || "—")
      }
    } else if (payload.k === "support") {
      label = "Ask Reloved visitor"
      toLabel = "visitor"
      const { threadDocId } = await import("../lib/messageThreads")
      const threadSnap = await db.collection(collections.messageThreads).doc(threadDocId("support", payload.s)).get()
      if (!threadSnap.exists) {
        res
          .status(404)
          .send(htmlPage("Chat not found", "<p>Open Ask Reloved chats under Admin → Messages.</p>", false))
        return
      }
      const thread = threadSnap.data() || {}
      const ownerTarget = String(thread.ownerTarget || "")
      emailHint = String(thread.ownerEmail || (ownerTarget.includes("@") ? ownerTarget : "—"))
      phone = normalizePhone(ownerTarget)
      if (!phone && ownerTarget) {
        const profileDoc = await findDonorProfileDoc(db, ownerTarget)
        phone = normalizePhone(profileDoc?.data()?.phone)
        if (emailHint === "—" || !emailHint) {
          emailHint = String(profileDoc?.data()?.email || emailHint || "—")
        }
      }
    } else {
      label = "contact sender"
      toLabel = "contact"
      const msgSnap = await db.collection(collections.contactMessages).doc(payload.s).get()
      if (!msgSnap.exists) {
        res.status(404).send(htmlPage("Message not found", "<p>Open Contact in admin.</p>", false))
        return
      }
      const msg = msgSnap.data() || {}
      phone = normalizePhone(msg.phone)
      emailHint = String(msg.email || "—")
    }

    if (!phone) {
      res
        .status(400)
        .send(
          htmlPage(
            "No phone on file",
            `<p>This ${label} has no mobile number saved.</p><p>Email: <strong>${emailHint.replace(/</g, "")}</strong></p><p>Reply from admin chat or email instead.</p>`,
            false
          )
        )
      return
    }

    if (!callMaskingConfigured()) {
      res
        .status(200)
        .send(
          htmlPage(
            "Call this number",
            `<p>Masking isn't configured — dial directly:</p><p style="font-size:1.5rem;font-weight:800"><a href="tel:+91${phone}">+91 ${phone}</a></p>`,
            true
          )
        )
      return
    }

    const opsPhone = relovedOpsDialPhone()
    if (!opsPhone) {
      res.status(500).send(htmlPage("Ops phone missing", "<p>Set RELOVED_OPS_PRIMARY_PHONE / BORZO_OPS_PHONE.</p>", false))
      return
    }

    const result = await connectMaskedCall({
      fromPhone: opsPhone,
      toPhone: phone,
      customField: `ops-email:${subjectType}:${subjectId}`,
      timeLimitSec: 180,
    })

    await db.collection(collections.callBridges).add({
      provider: "edesy",
      subjectType,
      subjectId,
      mode: `ops_to_${toLabel}_email`,
      fromLabel: "ops",
      toLabel,
      fromPhoneLast4: String(opsPhone).replace(/\D/g, "").slice(-4),
      toPhoneLast4: phone.slice(-4),
      callSid: result.callSid,
      status: result.status,
      maskedNumber: result.maskedNumber,
      createdAt: FieldValue.serverTimestamp(),
    })

    res
      .status(200)
      .send(
        htmlPage(
          "Calling now",
          `<p>Your ops phone should ring first, then we connect the ${label} (masked).</p><p>Status: <strong>${result.status}</strong>${result.maskedNumber ? ` · mask ${result.maskedNumber}` : ""}</p>`,
          true
        )
      )
  } catch (err: any) {
    console.error("ops drop-action", err)
    res
      .status(500)
      .send(
        htmlPage(
          "Action failed",
          `<p>${String(err?.message || "Try again from the admin dashboard.").replace(/</g, "")}</p>`,
          false
        )
      )
  }
})
