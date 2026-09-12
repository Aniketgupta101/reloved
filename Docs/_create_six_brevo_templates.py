# -*- coding: utf-8 -*-
"""Create the 6 new Reloved Brevo templates and wire env IDs."""
from pathlib import Path
import json
import re
import urllib.request

root = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main")
env_path = root / "firebase-backend/functions/.env.reloved-digital"
env = env_path.read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))
# Match sender used by existing Reloved templates (#1/#6/#8)
sender_email = "mail@reloved.digital"
sender_name = "RelovedDigital"

TEMPLATES = [
    {
        "env": "BREVO_NEW_MESSAGE_ADMIN_TEMPLATE_ID",
        "file": "new-message-admin-alert.html",
        "name": "Email_new_message_admin_alert",
        "subject": "New message - {{ params.ITEM_TITLE }}",
    },
    {
        "env": "BREVO_NEW_MESSAGE_DONOR_TEMPLATE_ID",
        "file": "new-message-donor-alert.html",
        "name": "Email_new_message_donor_alert",
        "subject": "RE-LOVED replied - {{ params.ITEM_TITLE }}",
    },
    {
        "env": "BREVO_DELIVERY_PICKED_UP_TEMPLATE_ID",
        "file": "delivery-picked-up.html",
        "name": "Email_delivery_picked_up",
        "subject": "On its way - {{ params.ITEM_TITLE }}",
    },
    {
        "env": "BREVO_DELIVERY_DELIVERED_CLAIMER_TEMPLATE_ID",
        "file": "delivery-delivered-claimer.html",
        "name": "Email_delivery_delivered_claimer",
        "subject": "Delivered - {{ params.ITEM_TITLE }}",
    },
    {
        "env": "BREVO_DELIVERY_DELIVERED_GIVER_TEMPLATE_ID",
        "file": "delivery-delivered-giver.html",
        "name": "Email_delivery_delivered_giver",
        "subject": "Delivered - {{ params.ITEM_TITLE }} found a new home",
    },
    {
        "env": "BREVO_DELIVERY_FAILED_TEMPLATE_ID",
        "file": "delivery-failed.html",
        "name": "Email_delivery_failed",
        "subject": "Delivery issue - {{ params.ITEM_TITLE }}",
    },
]


def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        "https://api.brevo.com/v3" + path,
        data=data,
        method=method,
        headers={
            "api-key": key,
            "accept": "application/json",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")


status, listing = api("GET", "/smtp/templates?limit=50&sort=desc")
existing_by_name = {}
if isinstance(listing, dict):
    for t in listing.get("templates") or []:
        existing_by_name[t.get("name")] = t.get("id")

wired = {}
for spec in TEMPLATES:
    html = (root / "firebase-backend/email-templates" / spec["file"]).read_text(encoding="utf-8")
    existing_id = existing_by_name.get(spec["name"])
    if existing_id:
        st, res = api(
            "PUT",
            f"/smtp/templates/{existing_id}",
            {
                "subject": spec["subject"],
                "htmlContent": html,
                "isActive": True,
            },
        )
        tid = existing_id
        action = "updated"
        if st >= 400:
            print("FAIL update", spec["name"], st, res)
            continue
    else:
        st, res = api(
            "POST",
            "/smtp/templates",
            {
                "sender": {"id": 1},
                "templateName": spec["name"],
                "subject": spec["subject"],
                "htmlContent": html,
                "isActive": True,
            },
        )
        if isinstance(res, dict) and res.get("id"):
            tid = res["id"]
            action = "created"
        else:
            print("FAIL create", spec["name"], st, res)
            continue
    wired[spec["env"]] = tid
    print(f"{action} #{tid} {spec['name']} -> {spec['env']}")

new_env = env
for env_key, tid in wired.items():
    if re.search(rf"^{re.escape(env_key)}=.*$", new_env, flags=re.M):
        new_env = re.sub(
            rf"^{re.escape(env_key)}=.*$",
            f"{env_key}={tid}",
            new_env,
            flags=re.M,
        )
    else:
        new_env = new_env.rstrip() + f"\n{env_key}={tid}\n"

env_path.write_text(new_env, encoding="utf-8")
print("\n=== Wired in .env.reloved-digital ===")
for env_key, tid in wired.items():
    print(f"{env_key}={tid}")
