# reloved, Phase 1 Handover

*Confidential. Prepared for reloved project leadership by Totem Interactive*
*Date: 31 August 2026 · Reference: Phase 1 Scope of Work, 12 Aug 2026*

**Live site**: https://reloved-digital.web.app

## The picture in plain terms

reloved is live and working today. A donor can give an item, someone else can claim it, both get notified by email at every step, and your team can review everything from an admin dashboard. That's the whole Phase 1 promise, delivered.

Two things from the original plan aren't finished yet (both explained below, neither stops the site from working right now), and a handful of things were built that weren't in the original plan at all.

**At a glance:** 5 of 6 Phase 1 workstreams fully live · 1 live but missing one piece · 6 extra features shipped beyond the original scope

## Phase 1, what was promised, and where it stands

| Workstream | Status | In plain terms |
|---|---|---|
| Brand & Design | ✅ **Live** | The look and feel, logo, colours, fonts, is finished and consistent across the whole site. |
| Public Website | ✅ **Live** | Every page from the plan is up: homepage, the Wall of Kindness, individual item pages, Wall of Love, the map, Our Story, and all policy/contact pages. |
| Give + Claim Journeys | ✅ **Live** | Someone can give an item (with AI-assisted photo suggestions) or claim one, start to finish, with a tracking reference number. |
| Sign-in + Email | ✅ **Live** | Sign-in works (email code, SMS code, or Google). Every key moment, submissions, confirmations, decisions, and now contact-form enquiries too, sends an email. |
| Admin Tools | 🟡 **Live, one piece pending** | Your team can review, approve, or decline every donation and claim from a dashboard. The one piece missing: matching a bulk donation to a specific partner NGO isn't built. That's a bigger feature, not a quick fix (see Phase 2 below). |
| Launch, Search & Analytics | 🟡 **Live, one piece pending** | Google can find and verify the site, analytics are tracking visitors. The one gap: the site is live at a working address (`reloved-digital.web.app`), but not yet at your actual domain, `reloved.digital`. That's a DNS setting, not a rebuild, see Phase 2. |

## Extra things built beyond the original plan

These weren't asked for in the Phase 1 scope but were added because they make the product noticeably better:

- **Sign in with Google**, one tap, no code to type, alongside the email/SMS options.
- **Smarter accounts**, if someone signs in with their email once and their phone another time, it's still recognised as the same person, not two separate accounts.
- **An FAQ page** built so it also shows up correctly when people ask AI tools like ChatGPT or Google's AI answers about reloved.
- **An on-site help widget** that answers common questions instantly, no waiting for a reply.
- **Faster admin uploads**, AI suggests the category, title, and condition from a photo instead of typing everything by hand.
- **Follow-up emails**, donors and claimants now hear back when their submission is *approved or declined*, not just when it's received.

## Phase 2, recommended next steps

Nothing below is broken today. This is what would take reloved from "working" to "fully finished and growing."

### Quick wins, ready to do now
- **Point `reloved.digital` at the live site.** Right now the real site lives at a Firebase address; your actual domain isn't pointed at it yet. This is the single most important next step.
- **Speed up the Wall of Kindness images.** Some photos are larger than they need to be, causing a 1 to 2 second delay before they appear. Straightforward fix.
- A small batch of already-built improvements (search visibility, a legal-text correction, faster image loading) is tested and ready, just needs a routine deploy.

### A real new feature, needs to be built
- **Partner matching.** NGOs and community groups can already apply to become partners, and your team can approve them. What's missing is the workflow to actually match a bulk donation to the right partner and hand it off. That's a proper feature to scope and build, not a quick patch.

### Needs a decision or an account from your side
- **A Google Business Profile for reloved.** This is the single biggest thing you can do yourself to help people find reloved through Google and AI search. Takes about 15 minutes to set up.
- **Confirm the initial 50-item inventory target** from the original plan has been met.
- **Borzo pickup/delivery integration.** Not started, pending. Needs a Borzo business account under reloved's name before this can be wired in.
- **DLT registration for SMS.** Pending. India requires businesses sending SMS to register their sender ID and templates with the telecom regulator (DLT); until this is done, SMS OTP keeps running on the fallback path already in place, not blocking, but needed for the long-term production SMS setup.

---

*reloved × Totem Interactive · Confidential · 31 Aug 2026*
