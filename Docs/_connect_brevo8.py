# -*- coding: utf-8 -*-
from pathlib import Path
import json
import re
import urllib.request

root = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main")
html = (root / "firebase-backend/email-templates/claim-decision.html").read_text(encoding="utf-8")
assert "v=16" in html
assert 'width="260" height="71"' in html

env_path = root / "firebase-backend/functions/.env.reloved-digital"
env = env_path.read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))


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
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


api(
    "PUT",
    "/smtp/templates/8",
    {
        "templateName": "Email_claim_decision",
        "subject": "{{ params.HEADLINE }} - {{ params.ITEM_TITLE }}",
        "htmlContent": html,
        "isActive": True,
    },
)
check = api("GET", "/smtp/templates/8")
ch = check.get("htmlContent") or ""
print("brevo#8 name:", check.get("name"))
print("brevo#8 subject:", check.get("subject"))
print("brevo#8 active:", check.get("isActive"))
print("brevo#8 v16:", "v=16" in ch)
print("brevo#8 HEADLINE:", "params.HEADLINE" in ch)
print("brevo#8 NEXT_STEPS:", "params.NEXT_STEPS" in ch)
print("brevo#8 CTA:", "params.CTA_LABEL" in ch)

new_env = re.sub(
    r"^BREVO_CLAIM_DECISION_TEMPLATE_ID=.*$",
    "BREVO_CLAIM_DECISION_TEMPLATE_ID=8",
    env,
    flags=re.M,
)
if "BREVO_CLAIM_DECISION_TEMPLATE_ID=8" not in new_env:
    raise SystemExit("failed to set env")
env_path.write_text(new_env, encoding="utf-8")
print(
    "env:",
    next(l for l in new_env.splitlines() if l.startswith("BREVO_CLAIM_DECISION")),
)

tmp = root / "firebase-backend/email-templates/_brevo8_current.html"
if tmp.exists():
    tmp.unlink()
    print("removed temp download")
