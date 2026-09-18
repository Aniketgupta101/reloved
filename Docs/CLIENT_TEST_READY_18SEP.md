# Reloved — Client testing pack (18 Sep 2026)

**Live URL:** https://reloved-digital.web.app  
**Status:** Ready for Friend & Family / client walkthrough

---

## Message to send (copy/paste)

Hi Sheetal,

Reloved is ready for testing on the live site:

**https://reloved-digital.web.app**

Please try on mobile + desktop. Suggested flows below.

### What to test
1. **Browse Wall** → open an item → claim (if logged in)
2. **Drop an item** → multi photos → details → handover option → submit
3. **Account** → Giving history → Remove listing (asks for a reason; works for pending review too)
4. **Account** → metrics (time saved / streak / Reloved)
5. **Notifications** → Open only (no location/delete clutter)
6. **Matched claim + Use Borzo** → claimer taps **Book in Borzo / Porter · you pay** (addresses copy; they pay courier in the app). Reloved does not auto-book until Borzo Business API replies.

### Videos attached
- RELOVED-Friday-Fixes.mp4
- RELOVED-Multi-Photo-Swipe.mp4

### Known limitation (transparent)
Automated Borzo Business API is blocked waiting on Borzo. Couriers work via **self-book in Borzo/Porter app** (user pays) or admin manual book. Happy to jump on a call.

Thanks  
Aniket

---

## Video files to attach

```
frontend/recordings/ceo-friday-fixes/RELOVED-Friday-Fixes.mp4
frontend/recordings/multi-photo-swipe/RELOVED-Multi-Photo-Swipe.mp4
```

---

## Quick QA checklist (you / internal)

| # | Flow | Pass? |
|---|------|-------|
| 1 | Site loads on phone | |
| 2 | Sign in (OTP / Google) | |
| 3 | Drop item (photos + submit) | |
| 4 | Remove pending listing with reason | |
| 5 | Claim item + save building | |
| 6 | After Accept: Book Borzo/Porter self-serve | |
| 7 | Admin: withdrawn gifts hidden | |
| 8 | Admin: Open Borzo/Porter · Reloved pays (manual ops) | |

**Admin:** https://reloved-digital.web.app/admin
