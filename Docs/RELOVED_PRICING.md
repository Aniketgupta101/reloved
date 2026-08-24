---
pdf_options:
  format: A4
  margin: 10mm 12mm 10mm 12mm
  printBackground: true
stylesheet:
  - RELOVED_PRICING.pdf.css
---

# reloved · cost model

**Prepared for** Sheetal Ahuja · **By** Totem Interactive · **22 Aug 2026**  
Modelled estimates (ranged). Domain + cPanel = confirmed actuals. Totem build fees excluded. Per SOW §4, third-party charges at approved actuals.

**Stack:** GoDaddy (domain + hosting) · Brevo (email/OTP) · MSG91 + **TRAI DLT** (SMS OTP) · Gemini (AI cataloguing) · MapTiler (homepage map, live today). Pilot backend on AWS Lightsail (~$3.50/mo); tables use SOW cPanel model.

**MAU assumptions:** ~4 emails/user/mo · ~0.5 SMS OTP/user/mo (phone login) · ~0.5 AI photos/user/mo · ~1 map load/user/mo. Email OTP needs **no DLT**.

---

## Fixed costs (annual)

| Item | Vendor | Amount |
|---|---|---|
| Domain `reloved.digital` | GoDaddy | **₹398/yr** ✓ |
| Hosting — API, DB, photos, mailboxes | GoDaddy cPanel | **₹2,388/yr** ✓ |
| **Subtotal hosting** | | **₹2,786/yr** (~₹232/mo) |

### India DLT — required before SMS OTP (not email OTP)

Register on **one** operator portal (Jio / Airtel / Vi / BSNL). Headers, templates & PE sync across operators. Lead time ~2–7 days.

| Item | Frequency | Amount |
|---|---|---|
| Principal Entity (PE) registration | Year 1 (+ renewal) | **₹5,900** (₹5,000 + GST) |
| Header (6-char Sender ID) + OTP template | Once | **Free** |
| PE ↔ MSG91 telemarketer binding | Once | **Free** (mandatory) |
| MSG91 assisted setup (optional) | Once | ~₹1,770 |

**Per SMS (usage):** MSG91 ₹0.15–0.25 + TRAI DLT scrub **₹0.025** → **~₹0.23/SMS all-in** (modelled). Prepaid wallet; no MSG91 setup fee.

**Before first phone OTP:** PE ID · approved header · OTP template (Service Implicit) · chain-bind MSG91 TM `1302157225275643280` · template ID in MSG91 dashboard.

---

## Usage-based by scale (monthly, excl. fixed hosting & DLT amortisation)

| | 100 MAU | 500 | 1,000 | 5,000 | 10,000 |
|---|---:|---:|---:|---:|---:|
| Hosting / DB / photos | incl. | incl. | incl. | incl. | incl. |
| Email (Brevo) | free | free | free | ~₹1,800 | ~₹3,500 |
| SMS/OTP (MSG91 + DLT) | ₹12–25 | ₹60–120 | ₹115–230 | ₹575–1,150 | ₹1,150–2,300 |
| AI photos (Gemini) | free | ~₹15 | ~₹25 | ~₹125 | ~₹250 |
| Maps (MapTiler) | free | free | free | ~₹2,490 | ~₹2,490 |
| **Usage subtotal** | **₹12–25** | **₹75–135** | **₹140–255** | **₹4,990–5,540** | **₹7,390–8,490** |

---

## Total estimated monthly cost

| | 100 MAU | 500 | 1,000 | 5,000 | 10,000 |
|---|---:|---:|---:|---:|---:|
| Fixed hosting (₹2,786/yr) | ₹232 | ₹232 | ₹232 | ₹232 | ₹232 |
| DLT PE (₹5,900/yr amortised) | ₹492 | ₹492 | ₹492 | ₹492 | ₹492 |
| Usage (above) | ₹12–25 | ₹75–135 | ₹140–255 | ₹4,990–5,540 | ₹7,390–8,490 |
| **Total — live today** | **₹736–749** | **₹799–859** | **₹864–979** | **₹5,714–6,264** | **₹8,114–9,214** |
| + Borzo pickup* (placeholder) | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 | ₹3,000 |

\*Borzo not live — ~₹40–60/delivery, pay-per-pickup; ~₹3,000/mo at ~50 deliveries. Scales with bookings, not MAU.

---

## When free tiers end · year-one cash

| Service | Free / fixed | Triggers paid |
|---|---|---|
| Brevo email | 9,000/mo | ~2,250 MAU |
| MSG91 + DLT SMS | None | Day 1 (after DLT PE) |
| DLT PE registration | ₹5,900/yr | Before first SMS |
| Gemini AI | Free key rate-limited | Bulk upload bursts → paid key (~₹250/mo @ 10k MAU) |
| MapTiler maps | 5,000 sessions/mo | ~5,000 MAU → ~₹2,490/mo Flex |
| Hosting | ₹2,786/yr fixed | Day 1 |

**Year-one cash (besides usage):** ₹2,786 hosting + **₹5,900 DLT PE** (+ optional ₹1,770 MSG91 help). **Email OTP can launch without DLT.** Phone OTP needs DLT first. Pilot ~**₹740/mo** all-in (incl. amortised DLT); ~**₹8,100–9,200/mo** at 10,000 MAU.

*Full assumptions & vendor notes: `RELOVED_PRICING_FULL.md`. Confirm rates on live pricing pages before budget sign-off. GST as applicable.*
