# Local design review

Open [index.html](index.html) locally. Its navigation switches between four static scenes: Wall, item detail, Give photo step, and claim detail. The controls, example item identities, and claim status are illustrative; this is **not** a working version of the application. Product images come from checked-in Reloved assets, and the header uses the supplied black master wordmark.

| Proposed design | Current app evidence |
| --- | --- |
| [Wall · 320px](wall-phone-320.png), [390px](wall-phone.png), [768px](wall-tablet.png), [1440px](wall-desktop.png) | [Wall · 320px](evidence/wall-phone-320-viewport.png), [390px](evidence/wall-phone-390-viewport.png), [768px](evidence/wall-tablet-viewport.png), [1440px](evidence/wall-desktop-viewport.png) |
| [Item · phone](item-phone.png), [desktop](item-desktop.png) | [Item · phone](evidence/item-phone-viewport.png), [desktop](evidence/item-desktop-viewport.png) |
| [Give · phone](give-phone.png) | [Give · phone](evidence/give-phone-viewport.png) |
| [Claim · phone](claim-phone.png) | [Simulated signed-in claim · phone](evidence/account-claim-detail-phone-viewport.png); backend authentication and state transitions unverified |

Additional current-app evidence covers [Home desktop](evidence/home-desktop-viewport.png), [Give success](evidence/give-success-phone-viewport.png), [Track lookup](evidence/track-phone-viewport.png), [Track result](evidence/track-detail-phone-viewport.png), [Map](evidence/map-phone-viewport.png), [Wall of Love](evidence/love-phone-viewport.png), [About](evidence/about-phone-viewport.png), [FAQ](evidence/faq-phone-viewport.png), [Contact](evidence/contact-phone-viewport.png), [Standards](evidence/standards-phone-viewport.png), [Privacy](evidence/privacy-phone-viewport.png), [Terms](evidence/terms-phone-viewport.png), [Partner application](evidence/partner-phone-viewport.png), [QR](evidence/qr-phone-viewport.png), [partner login](evidence/partner-login-phone-viewport.png), and the [404 boundary](evidence/unknown-route-phone-viewport.png).

Simulated donor-session evidence covers the account [Notifications](evidence/account-notifications-phone-viewport.png), [Giving](evidence/account-giving-phone-viewport.png), [Claiming](evidence/account-claiming-phone-viewport.png), and [Profile](evidence/account-profile-phone-viewport.png) tabs, plus pending [claim detail on phone](evidence/account-claim-detail-phone-viewport.png) and [desktop](evidence/account-claim-detail-desktop-viewport.png), and [gift detail on phone](evidence/account-gift-detail-phone-viewport.png) and [desktop](evidence/account-gift-detail-desktop-viewport.png). These use a fake local token, synthetic records and intercepted GET responses; they show layout, not a verified login or authorized backend flow. The partner dashboard remains source-inspected only.

The current-app screenshots used synthetic read-only API fixtures and blocked all non-local network requests. The QR image is visibly broken under that deliberate block because the current page fetches it from QRServer; this does not establish live-service availability. Opening claim detail also attempted a chat-opening POST, which was blocked. The design screenshots were rendered from this local static file with all network requests blocked. Both use browser viewport emulation, not physical-device testing. The offline static preview uses system fallback type, so font weight and spacing are approximate until checked in the React app.

See [the audit](../UI_UX_AUDIT.md) for the route/state inventory and [the design specification](../UI_UX_DESIGN.md) for the complete page-family direction and boundaries.

The [keyboard baseline](evidence/keyboard-baseline.md) records observed mobile menu, Wall filter, FAQ and item-gallery behavior for comparison during implementation.
