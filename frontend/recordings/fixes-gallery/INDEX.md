# Fixes gallery + order chat

Generated: 2026-09-17T09:45:11.232Z

Open folder: `frontend/recordings/fixes-gallery/`

## Screenshots

| File | What it proves |
|------|----------------|
| `00-cover.png` | **Cover** — Gallery index |
| `01-give-photo-privacy-notice.png` | **Give photo privacy notice** — Sensitive image: warn + allow drop |
| `02-peer-chat-phone-block.png` | **Peer chat scrub** — Phone blocked · landmark allowed |
| `03-handover-address-mask.png` | **Handover address mask** — toPublicArea strips flat/wing |
| `04-ai-error-sanitize.png` | **AI error sanitize** — No Gemini detail in UI |
| `05-help-escalate-phone-warn.png` | **Help escalate phone warn** — Soft-warn · not sent |
| `06-user-claim-chat-with-reloved.png` | **User ↔ Reloved chat (claim in process)** — Claim T8xnWHUunP50SDpSzD9f · status approved |
| `07-user-chat-composer-ready.png` | **User can keep messaging while order is open** — Composer visible on claim detail |
| `08-admin-claim-chat-reply.png` | **Admin — Message user on Matched claim** — Same Reloved thread · two-way while order in process |
| `09-order-chat-transcript.png` | **Order chat transcript** — User + admin messages on one in-process claim |
| `10-gallery-complete.png` | **Gallery complete** — 10 screenshots |

## In-process order chat

- Claim: `T8xnWHUunP50SDpSzD9f` (status `approved`)
- Thread: `claim_T8xnWHUunP50SDpSzD9f`
- Messages: **2**
- User: "[UAT 09:44:36] Hi Reloved — my claim is in process. When will pickup be arranged?"
- Admin: "[Ops 09:44:36] Thanks — we see your claim. We'll coordinate handover and update you here."

**How it works in product**
- Claimer/giver: gift or claim detail → **Chat with Reloved** (available while pending/approved)
- Admin: Donations / Item requests → **Message user** (same thread)
- After match: **Chat with giver/receiver** (peer) is separate; Reloved ops stay on the Reloved channel
