---
pdf_options:
  format: A4
  margin: 8mm 9mm 8mm 9mm
  printBackground: true
stylesheet:
  - RELOVED_PRICING.pdf.css
---

# reloved · cost model

**Prepared for** Sheetal Ahuja · **By** Totem Interactive · **29 Aug 2026** · *Rev 12* · **All amounts in ₹ (INR).**

**Two wallets — do not mix:**

1. **One-time / yearly payments** — paid **up front in full** (domain, cPanel, DLT). Not split into monthly cost.  
2. **Monthly run-rate** — only usage (SMS, email, Firebase API/DB, Gemini, MapTiler) as **Best → Mid → Worst** ranges.

Totem build fees excluded. Per SOW §4, third-party charges at approved actuals.

**Stack:** GoDaddy (**domain + cPanel**: mail, static site, **item photo disk**) · **Firebase Blaze** (API Functions + Firestore DB only — **not** Firebase Storage) · Brevo · MSG91 + **TRAI DLT** · Gemini · MapTiler.

**Photos:** stored on **cPanel disk** (included in the ₹2,388/year hosting plan). Served as `reloved.digital/uploads/…` or `/images/…`. **No separate Firebase Storage bill.**

---

## 1 — One-time / yearly payments (pay all at once)

These are **not** monthly. Place them when due (usually once a year). Do **not** add them into the MAU monthly tables in §4–§5.

| Item | When you pay | Type | Amount (₹) |
|---|---|---|---|
| Domain `reloved.digital` | On renewal date | **Yearly — one-time payment** | **₹398 / year** ✓ |
| cPanel (mail + static site + **photo storage on disk**) | On renewal date | **Yearly — one-time payment** | **₹2,388 / year** ✓ |
| **Hosting subtotal (year)** | Same cycle | **Yearly — one-time payment** | **₹2,786 / year** |
| DLT Principal Entity (PE) registration | At SMS go-live (then each renewal year) | **Yearly — one-time payment** | **₹5,900 / year** (₹5,000 + GST) |
| DLT Header + OTP template + PE↔MSG91 bind | Setup | **One-time** (no fee) | **₹0** |
| MSG91 assisted DLT onboarding (optional) | Setup only | **One-time payment** (never renews) | **₹1,770** |

### Cash to place up front (Year 1)

| Bundle | Amount (₹) |
|---|---|
| Domain + cPanel only | **₹2,786** |
| + DLT PE (needed for production SMS OTP) | **₹2,786 + ₹5,900 = ₹8,686** |
| + optional MSG91 DLT help | **₹8,686 + ₹1,770 = ₹10,456** |

**Year 2+ renewals (typical):** Domain **₹398** + cPanel **₹2,388** + DLT PE **₹5,900** = **₹8,686 / year** (MSG91 help does not repeat).

Firebase Blaze: **₹0** to open the account — no yearly plan fee. Monthly line below is Functions + Firestore only if free tiers are exceeded. **Firebase Storage is not used** (photos stay on cPanel).

---

## 2 — Best / Mid / Worst assumptions (for monthly usage only)

| Lever | **Best** | **Mid** | **Worst** |
|---|---|---|---|
| OTP / MAU / mo | **1.5** | **2.5** | **4** |
| Login channel | **80% email · 20% SMS** | **50% / 50%** | **20% email · 80% SMS** |
| Donate rate | **10%** | **20%** | **35%** |
| Claim rate | **15%** | **25%** | **40%** |
| Photos / attempt | **1.5** | **2** | **4** |
| Emails / MAU / mo | **1.8** | **3.0** | **4.5** |
| SMS / MAU / mo | **0.3** | **1.25** | **3.2** |
| SMS rate (₹) | **₹0.20** | **₹0.25** | **₹0.28** |
| Gemini / photo | **₹0.04** | **₹0.05** | **₹0.06** |
| Map loads / MAU | **0.3** | **0.5** | **1.0** |

### Derived volume (Best → Mid → Worst)

| Meter @ MAU | **100** | **500** | **1,000** | **2,500** | **5,000** | **10,000** |
|---|---|---|---|---|---|---|
| SMS | 30 → 125 → 320 | 150 → 625 → 1,600 | 300 → 1,250 → 3,200 | 750 → 3,125 → 8,000 | 1,500 → 6,250 → 16,000 | 3,000 → 12,500 → 32,000 |
| Emails | 180 → 300 → 450 | 900 → 1,500 → 2,250 | 1,800 → 3,000 → 4,500 | 4,500 → 7,500 → 11,250 | 9,000 → 15,000 → 22,500 | 18,000 → 30,000 → 45,000 |
| Gemini calls | 20 → 50 → 140 | 100 → 250 → 700 | 200 → 500 → 1,400 | 500 → 1,250 → 3,500 | 1,000 → 2,500 → 7,000 | 2,000 → 5,000 → 14,000 |
| Map sessions | 30 → 50 → 100 | 150 → 250 → 500 | 300 → 500 → 1,000 | 750 → 1,250 → 2,500 | 1,500 → 2,500 → 5,000 | 3,000 → 5,000 → 10,000 |

---

## 3 — Why monthly usage is not “1 SMS per user”

Login OTP (email *or* SMS), 7-day re-login, Give (2 emails + Gemini per photo), Claim (2–3 emails), Wall reads, map, waitlist, admin bulk — multiple vendor calls per active user.

---

## 4 — Monthly usage only (₹ / month) — Best → Mid → Worst

**Does not include** domain, cPanel, or DLT PE. Those are §1 one-time / yearly payments.  
**Does not include photo storage** — photos are on cPanel disk (already paid in §1). Firebase Storage is **not** in this model.

### Firebase Blaze (Functions + Firestore only)

| MAU | Best | Mid | Worst | **Range** |
|---|---:|---:|---:|---|
| 100 | ₹0 | ₹0 | ₹0 | **₹0 – 0** |
| 500 | ₹0 | ₹0 | ₹0 | **₹0 – 0** |
| 1,000 | ₹0 | ₹0 | ₹50 | **₹0 – 50** |
| 2,500 | ₹0 | ₹10 | ₹150 | **₹0 – 150** |
| 5,000 | ₹0 | ₹90 | ₹400 | **₹0 – 400** |
| 10,000 | ₹50 | ₹365 | ₹1,200 | **₹50 – 1,200** |

\*Worst at high MAU = Functions/Firestore free-tier overage only. **No Storage line.**

### SMS (MSG91 + DLT scrub per message)

| MAU | Best | Mid | Worst | **Range** |
|---|---:|---:|---:|---|
| 100 | ₹6 | ₹31 | ₹90 | **₹6 – 90** |
| 500 | ₹30 | ₹156 | ₹448 | **₹30 – 450** |
| 1,000 | ₹60 | ₹313 | ₹896 | **₹60 – 900** |
| 2,500 | ₹150 | ₹781 | ₹2,240 | **₹150 – 2,250** |
| 5,000 | ₹300 | ₹1,563 | ₹4,480 | **₹300 – 4,500** |
| 10,000 | ₹600 | ₹3,125 | ₹8,960 | **₹600 – 9,000** |

### Email (Brevo) — monthly plan when paid

| MAU | Best | Mid | Worst | **Range** |
|---|---:|---:|---:|---|
| 100 | ₹0 | ₹0 | ₹0 | **₹0 – 0** |
| 500 | ₹0 | ₹0 | ₹0 | **₹0 – 0** |
| 1,000 | ₹0 | ₹0 | ₹810 | **₹0 – 810** |
| 2,500 | ₹0 | ₹0 | ₹2,900 | **₹0 – 2,900** |
| 5,000 | ₹0 | ₹2,900 | ₹4,500 | **₹0 – 4,500** |
| 10,000 | ₹2,900 | ₹5,400 | ₹8,100 | **₹2,900 – 8,100** |

### Gemini

| MAU | Best | Mid | Worst | **Range** |
|---|---:|---:|---:|---|
| 100 | ₹1 | ₹3 | ₹8 | **₹1 – 8** |
| 500 | ₹4 | ₹13 | ₹42 | **₹4 – 42** |
| 1,000 | ₹8 | ₹25 | ₹84 | **₹8 – 84** |
| 2,500 | ₹20 | ₹63 | ₹210 | **₹20 – 210** |
| 5,000 | ₹40 | ₹125 | ₹420 | **₹40 – 420** |
| 10,000 | ₹80 | ₹250 | ₹840 | **₹80 – 840** |

### MapTiler — monthly when Flex

| MAU | Best | Mid | Worst | **Range** |
|---|---:|---:|---:|---|
| 100–2,500 | ₹0 | ₹0 | ₹0 | **₹0 – 0** |
| 5,000 | ₹0 | ₹0 | ₹2,700 | **₹0 – 2,700** |
| 10,000 | ₹0 | ₹2,700 | ₹4,500 | **₹0 – 4,500** |

### Monthly usage total (₹ / month)

| MAU | Best | Mid | Worst | **Monthly range** |
|---|---:|---:|---:|---|
| **100** | ₹7 | ₹34 | ₹98 | **₹7 – 98** |
| **500** | ₹34 | ₹169 | ₹490 | **₹34 – 490** |
| **1,000** | ₹68 | ₹338 | ₹1,840 | **₹68 – 1,840** |
| **2,500** | ₹170 | ₹854 | ₹5,500 | **₹170 – 5,500** |
| **5,000** | ₹340 | ₹4,678 | ₹12,500 | **₹340 – 12,500** |
| **10,000** | ₹3,630 | ₹11,840 | ₹23,600 | **₹3,630 – 23,600** |

Optional later (ops, not in table): **Borzo / pickup ₹40–60 per delivery**.

---

## 5 — How to budget (keep yearly and monthly separate)

| Bucket | What to place | Amount |
|---|---|---|
| **A. One-time / yearly** | Domain + cPanel (incl. **photo disk**) + DLT PE (+ optional MSG91 help) | **₹8,686 – 10,456** in Year 1 (see §1) |
| **B. Monthly run-rate** | SMS + email + Firebase Functions/Firestore + Gemini + MapTiler only | Use MAU row in §4 (**Best → Worst**) |

**Example — pilot at 100 MAU**

- Place now (yearly): **₹8,686** (or **₹10,456** with MSG91 help)  
- Each month after that: **₹7 – 98** usage only  

**Example — 1,000 MAU**

- Yearly still: **₹8,686** (same hosting + DLT; does not grow with MAU)  
- Each month: **₹68 – 1,840** usage  

---

## 6 — What drives Best vs Worst (monthly only)

| Toward **Best** | Toward **Worst** |
|---|---|
| Steer login to **email OTP** | Most users on **SMS OTP** |
| Sessions stick (fewer re-OTPs) | Weekly re-login + OTP retries |
| Light Give/Claim months | High donate/claim + max photos |
| No big email blast | Newsletter / burst days |
| Map lightly used | Every visit loads map |

---

*All figures INR. **Yearly / one-time payments are never amortised into the monthly MAU tables.** Photos on cPanel — no Firebase Storage. Confirm live vendor rate cards before budget sign-off. GST as applicable.*
