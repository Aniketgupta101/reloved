# Reloved — Client WhatsApp feedback verified against code

**Verified:** 9 September 2026  
**Sources:** Downloads `Reloved_Phase_1_Client_Feedback_Verification.md` + Sept 2 WhatsApp fixes list (buttons / logistics / copy) from prior chat screenshots.

> Note: The raw WhatsApp `.txt` export was not attached to this Cursor message. Verification uses the checklist file you had in Downloads + the earlier WhatsApp screenshot thread already in this project chat.

---

## A. Launch logistics / privacy thread (later WhatsApp)

| # | Client ask | Code status | Notes |
|---|------------|-------------|-------|
| 1 | Privacy rule: no flat/wing; building only; hand to security | **Done** | `PrivacyBuildingNotice` on Give / Claim / Onboarding + soft warning if flat/wing typed |
| 1b | Mentions **bag** in privacy copy | **Partial** | Security/gate covered; “in a bag” not in the banner yet |
| 2 | Google Maps building → Borzo/Porter handoff | **Done (simple)** | Admin: Copy building + Open Borzo/Porter/Maps. **Not** deep API auto-fill into Borzo app |
| 3 | Driver note: main gate security, do not call flat | **Done** | `RIDER_GATE_NOTE` copied with ops clipboard |
| 4 | Donor SMS when rider dispatched (“RE-LOVED ACTION REQUIRED…”) | **Not done** | Needs DLT template Active + send hook; launch can be manual WhatsApp by ops |
| 5 | Masked calling (Twilio/Exotel) | **Phase 2** | Correctly deferred |
| 6 | Edge cases (missed/failed/returns) | **Phase 2** | Correctly deferred |
| 7 | QR Instagram + website | **Done** | `/qr` branded pink QR + logo; Open outline / Download black |

---

## B. Earlier UI thread (buttons / Drop flow)

| # | Client ask | Code status | Notes |
|---|------------|-------------|-------|
| 1 | Big CTAs → **black** + white text | **Done** | Navbar Drop black; Claim CTAs `variant="cta"` |
| 1b | Pink/green only for **small** chips | **Mostly done** | Audit leftover green if any |
| 1c | Hero Drop + Claim both solid black | **Fixed today** | Drop = black; Claim = outline (same as footer) |
| 2 | Headline **DROP SOMETHING. PASS IT ON** | **Done** | Give step 1: “Drop something. Pass it on.” |
| 3 | Remove “Delivery partner / Coming soon” | **Done** | Replaced by giver logistics dropdown |
| 4 | Dropdown: Receiver collects / I send / Porter via Reloved | **Done** | `giverLogistics` in Give |
| 4b | Porter: Receiver pays / I pay | **Changed today** | **Receiver only** (claimer pays) — matches your product call |
| 5 | Logo pink / reduce green | **Mostly done** | `--color-accent-pink: #EC2F9B` |

---

## C. What still blocks “client feedback = done”

**Must finish for launch**
1. Deploy frontend so privacy / logistics / QR / hero buttons are live  
2. DLT OTP template → Active → MSG91 bind (in progress)  
3. DNS `reloved.digital`  
4. Decide: auto donor rider SMS at launch (needs DLT) **or** ops sends manually  

**Small polish from chat**
5. Add “in a bag” to privacy banner (exact client wording)  
6. Confirm / ship **PASS IT ON** headline if still old copy  

**Explicitly later**
- Full Borzo API auto-fill  
- Masked numbers  
- Failure/returns automation  

---

## D. Button rule (final, from client + your note today)

- **Single primary action** → solid black  
- **Second action beside it** → white outline (not a second solid black, not pink)  
- **Pink / green** → chips and small controls only  
