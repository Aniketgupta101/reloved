# Reloved — end-to-end fixes (26 September 2026)

Client / ops summary of what was reported today and what we fixed. Live on **reloved.digital** (frontend) + Firebase Functions **reloved-digital** (API / SMS / email).

---

## 1. From client screenshots & Slack (Sheetal / ops)

| Issue reported | What we fixed |
|----------------|---------------|
| Admin Overview empty / wrong (“no deliveries”) | Overview rebuilt as an ops board: **deliveries today**, or **upcoming** when today is empty; new drops; new claims; active matches; Wall snapshot (Available / Being matched / Claimed). |
| Claimed items still looked **Available** on the Wall | Synced `publicStatus` from live claims. **Pink Corduroy Cropped Jacket** patched → **Claimed**. Pending claim → `being_matched`; approved match → `claimed`; received → `reloved`. Wall stamps show the correct state. |
| Admin missing dropper / claimer context | Giver enrichment on Overview / claims (name, phone) so cards aren’t blank “—”. |
| Ops email clutter on wrong Totem inbox | Ops alerts now go to **`totemisnottaken@gmail.com`** (plus Aniket + Sheetal). |
| Claim / schedule emails missing or wrong copy | Lifecycle emails restored (matched, schedule set, delivery stages) with HTML fallbacks. Schedule copy: check email/account to modify; contact us. Proof emails sent to Aniket, Totem, Sheetal. |
| OTP / “new item request” confusion on a personal number | OTP is MSG91 → user’s login phone (not a personal WhatsApp). Ops “new claim/drop” = **email only** (no ops SMS). |
| Sheetal — Wall images / sizing | Cutout images: white fill behind product (no grey letterbox bars). Kids sizing stays age-band only; adult sizes editable in Admin → Wall items if a listing is wrong. |
| Claims UI clutter | Claims cards cleaned (legacy courier / masked-call noise removed); focus on Accept / Couldn’t match, stage, chat. |

---

## 2. Jass (Jazz) — Wall listings

| Issue reported | What we fixed |
|----------------|---------------|
| Jass items not showing / wrong gender | **~43 Jass items** set to **men** and **restored to the Wall** so they display correctly in the catalog. |

---

## 3. Aakash (Totem) — SMS API 401 / 400

| Issue reported | What it means | What we fixed |
|----------------|---------------|---------------|
| MSG91 email: **SMS API Failed — 401** | **Flow Not Yet Approved** in MSG91 | Identified which Flows are Active vs not. App only sends **Active** templates so unapproved Flows stop generating failure emails. |
| MSG91 email: **SMS API Failed — 400** | Template id missing / wrong / archived | Wired correct MSG91 Flow IDs; stopped forcing a sender override (template already uses **RELOVD**). |
| Need proof SMS works | Test number **+91 7304382922** | Sent live Active templates to that number: Item claimed · Rider coming · On the way · Delivered · Failed. |

### SMS status after today’s deploy

| Step | Message | SMS live? |
|------|---------|-----------|
| 1 | OTP login | Yes (existing OTP template) |
| 2 | Somebody claimed your item → donor | **Yes — Active** |
| 3 | Claim matched → claimer | Pending MSG91 Flow **Approve** |
| 4 | Delivery ready → dropper | Pending MSG91 Flow **Approve** |
| 5 | Date & time set → both | Pending MSG91 Flow **Approve** |
| 6 | Rider coming / on the way | **Yes — Active** |
| 7 | Delivered | **Yes — Active** |
| 8 | Feedback / thank you | Pending MSG91 Flow **Approve** |

Emails for all steps still send (Brevo template or HTML fallback). Once Aakash **Approves** the four pending Flows in MSG91, we flip them live in code (one-line allowlist).

---

## 4. Platform / deploy (so the above stays live)

- Firebase Functions deployed with MSG91 + Brevo env (`PUBLIC_APP_URL=https://reloved.digital`).
- Frontend on cPanel (reloved.digital) with Wall/admin UI updates.
- Health check exposes which SMS templates are configured and which are `_live`.
- Ops email CTAs stay on `reloved.digital/api/...` (no Safe Browsing scare from `cloudfunctions.net`).

---

## 5. Still waiting on MSG91 (Aakash)

In MSG91 → SMS → Templates, mark these **Active / Approved** (same as Item claimed / Rider coming):

1. Claim matched  
2. Delivery ready (giver)  
3. Schedule / date-time set  
4. Feedback thanks  

Then reply here — we enable them and re-test on **7304382922**.

---

*Prepared 26 Sep 2026 for client / Totem / Sheetal handover.*
