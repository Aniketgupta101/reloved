# -*- coding: utf-8 -*-
from pathlib import Path
import json
import urllib.request

root = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main")
env = (root / "firebase-backend/functions/.env.reloved-digital").read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))

ids = {}
for line in env.splitlines():
    if "TEMPLATE_ID" in line and "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        ids[k.strip()] = v.strip()

MAP = [
    (1, "BREVO_OTP_TEMPLATE_ID", "otp-login.html"),
    (2, "BREVO_DONATION_CONFIRMATION_TEMPLATE_ID", "donation-confirmation-user.html"),
    (3, "BREVO_DONATION_ADMIN_TEMPLATE_ID", "donation-notification-admin.html"),
    (4, "BREVO_CLAIM_CONFIRMATION_TEMPLATE_ID", "claim-confirmation-user.html"),
    (5, "BREVO_CLAIM_ADMIN_TEMPLATE_ID", "claim-notification-admin.html"),
    (6, "BREVO_WELCOME_TEMPLATE_ID", "welcome.html"),
    (7, "BREVO_DONATION_DECISION_TEMPLATE_ID", "donation-decision.html"),
    (9, "BREVO_PARTNER_CONFIRMATION_TEMPLATE_ID", "partner-application-confirmation.html"),
    (10, "BREVO_PARTNER_ADMIN_TEMPLATE_ID", "partner-application-admin-alert.html"),
    (11, "BREVO_CONTACT_ADMIN_TEMPLATE_ID", "contact-message-admin-alert.html"),
    (12, "BREVO_ITEM_CLAIM_GIVER_TEMPLATE_ID", "item-claim-notify-giver.html"),
    (13, "BREVO_CLAIM_DECISION_TEMPLATE_ID", "claim-decision.html"),
]


def api(method, path):
    req = urllib.request.Request(
        "https://api.brevo.com/v3" + path,
        method=method,
        headers={"api-key": key, "accept": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


print("ID\tEnv var\tEnv value\tBrevo name\tSubject\tDesign file\tLogo")
for tid, envvar, design in MAP:
    full = api("GET", f"/smtp/templates/{tid}")
    html = full.get("htmlContent") or ""
    if "reloved-email-lockup.png?v=16" in html and 'width="260" height="71"' in html:
        logo = "OK v16 transparent lockup 260x71"
    elif "email-lockup" in html:
        logo = "lockup (not v16)"
    elif "email-badge" in html:
        logo = "badge"
    else:
        logo = "MISSING"
    local = root / "firebase-backend/email-templates" / design
    local_ok = "yes" if local.exists() and "v=16" in local.read_text(encoding="utf-8") else "no"
    print(
        f"{tid}\t{envvar}\t{ids.get(envvar,'(missing)')}\t{full.get('name')}\t{full.get('subject')}\t{design}\t{logo}\tlocal={local_ok}"
    )

# template 8 leftover
try:
    full8 = api("GET", "/smtp/templates/8")
    print(f"8\t(not wired)\t-\t{full8.get('name')}\t{full8.get('subject')}\t(see Brevo)\tcheck\t-")
except Exception as e:
    print("8 error", e)

print("\n=== Unwired env vars (no numeric id yet) ===")
for k, v in sorted(ids.items()):
    if not v.strip():
        print(f"{k}=(empty)")
    elif k not in {m[1] for m in MAP}:
        print(f"{k}={v}")
