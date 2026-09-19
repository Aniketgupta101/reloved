# Reloved email flows

Living map of transactional emails: **when** they fire, **who** gets them, and which ops emails include **no-login action buttons**.

## Roles

| Role | Meaning |
|------|---------|
| **Giver** | Person who dropped clothes |
| **Claimer** | Person who requested an item |
| **Us (ops)** | `aniketgupta83003@gmail.com`, `totemistaken@gmail.com` |
| **Sheetal** | `sheetalahuja99@gmail.com` — same ops triage alerts as Us |

`ADMIN_NOTIFY_EMAIL` (env) is merged into ops To when set.

---

## Flow overview

```text
Drop → Wall live → ops (Remove + Contact) + giver confirmation
Claim → ops (Decline + Contact) + claimer confirmation + giver “someone wants…”
Decision → claimer matched / soft-decline
Reloved chat (user) → ops (Contact)
Admin chat reply → user email + in-app
Peer chat → other party email + in-app
Contact form → ops (Contact)
Partner apply → ops notify + applicant confirmation
Delivery stages → giver / claimer as relevant
```

---

## A. User-facing (not Sheetal)

| When | To | Subject / purpose |
|------|-----|-------------------|
| Drop submitted | Giver | Donation live on Wall |
| First profile created | User | Welcome |
| Waitlist join | User | Waitlist welcome |
| Claim submitted | Claimer | We’ve got your request |
| Claim submitted | Giver | Someone wants your item |
| Claim accept / decline | Claimer | Matched / couldn’t match |
| Legacy admin donation decision | Giver | Donation approved / update |
| Admin replies in Reloved chat | Thread owner | RE-LOVED replied |
| Peer handover message | Other party | New message |
| Delivery lifecycle | Giver / claimer | Rider / pickup / delivered / failed / details |
| Contact form reply | User | Re: their message |
| Partner apply | Applicant | Application received |
| OTP | User | Login code |

---

## B. Ops triage — Us + Sheetal

| When | Recipients | Action buttons (no admin login) |
|------|------------|----------------------------------|
| Drop auto-published | Us + Sheetal | **Remove from Wall**, **Contact user** |
| New claim | Us + Sheetal | **Decline request**, **Contact user** |
| Reloved chat needs human | Us + Sheetal | **Contact user** |
| Website contact form | Us + Sheetal | **Contact user** |
| Partner application | Us + Sheetal | Notify only (open admin) |

Signed links hit `GET /api/ops/drop-action?t=…` (HMAC, 7-day TTL).

| Button | Effect |
|--------|--------|
| Remove from Wall | Hide listing; mark submission rejected |
| Decline request | Reject claim; restore item to available; email claimer soft-decline |
| Contact user | Masked call ops → phone on file (or show number / “no phone”) |

---

## Code entry points

| Email | Function | Trigger |
|-------|----------|---------|
| Drop ops | `sendDonationAdminAlert` | `publicWrite` donations |
| Drop giver | `sendDonationConfirmation` | same |
| Claim ops | `sendClaimAdminAlert` | `donor` item-requests |
| Claim claimer | `sendClaimConfirmation` | same |
| Claim giver | `sendItemClaimNotifyGiver` | same |
| Claim decision | `sendClaimDecision` | admin / matchFlow / ops Decline |
| Soft decline (no match) | `sendClaimDecision` HTML fallback | same — uses `BREVO_CLAIM_DECLINE_TEMPLATE_ID` only if set to a real soft-decline template |
| Waitlist | `sendWaitlistWelcomeEmail` | `BREVO_WAITLIST_WELCOME_TEMPLATE_ID` (#27) |
| Contact ops | `sendContactMessageAdminAlert` | `publicWrite` contact |
| Chat → ops | `sendNewMessageAdminAlert` | donor Reloved chat |
| Chat → user | `sendNewMessageDonorAlert` | admin reply / peer |
| Partner | `sendPartnerApplication*` | `publicWrite` |

Implementation: `src/lib/notifications.ts`, actions: `src/lib/dropEmailActions.ts` + `src/routes/opsActions.ts`.
