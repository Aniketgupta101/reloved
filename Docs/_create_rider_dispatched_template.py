# -*- coding: utf-8 -*-
"""Create Brevo template for giver rider-dispatched email and wire env."""
from pathlib import Path
import json
import re
import urllib.request

root = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main")
env_path = root / "firebase-backend/functions/.env.reloved-digital"
env = env_path.read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))
html = (root / "firebase-backend/email-templates/delivery-rider-dispatched-giver.html").read_text(encoding="utf-8")

NAME = "Email_delivery_rider_dispatched_giver"
SUBJECT = "Action required - rider coming for {{ params.ITEM_TITLE }}"
ENV_KEY = "BREVO_DELIVERY_RIDER_DISPATCHED_GIVER_TEMPLATE_ID"


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


st, listing = api("GET", "/smtp/templates?limit=50&sort=desc")
existing = None
if isinstance(listing, dict):
    for t in listing.get("templates") or []:
        if t.get("name") == NAME:
            existing = t.get("id")
            break

if existing:
    st, res = api("PUT", f"/smtp/templates/{existing}", {
        "subject": SUBJECT,
        "htmlContent": html,
        "isActive": True,
    })
    tid = existing
    print("updated", tid, st)
else:
    st, res = api("POST", "/smtp/templates", {
        "sender": {"id": 1},
        "templateName": NAME,
        "subject": SUBJECT,
        "htmlContent": html,
        "isActive": True,
    })
    if not isinstance(res, dict) or not res.get("id"):
        raise SystemExit(f"create failed {st} {res}")
    tid = res["id"]
    print("created", tid)

if re.search(rf"^{re.escape(ENV_KEY)}=.*$", env, flags=re.M):
    env = re.sub(rf"^{re.escape(ENV_KEY)}=.*$", f"{ENV_KEY}={tid}", env, flags=re.M)
else:
    env = env.rstrip() + f"\n{ENV_KEY}={tid}\n"
env_path.write_text(env, encoding="utf-8")
print(f"{ENV_KEY}={tid}")
