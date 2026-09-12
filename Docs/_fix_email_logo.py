# -*- coding: utf-8 -*-
"""Replace stretched email lockup with circular primary badge in local + Brevo templates."""
from pathlib import Path
import json
import re
import urllib.request

NEW_IMG = (
    '<img src="https://reloved-digital.web.app/images/reloved-email-badge.png?v=14" '
    'width="96" height="96" alt="RELOVED" '
    'style="display:block; border:0; width:96px; height:96px; max-width:96px;">'
)
IMG_TAG = re.compile(
    r'<img[^>]*src=["\']https://reloved-digital\.web\.app/images/reloved-email-'
    r'(?:badge|lockup)\.png[^"\']*["\'][^>]*>',
    re.I,
)

root = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\email-templates")
for p in sorted(root.glob("*.html")):
    html = p.read_text(encoding="utf-8")
    html2, n = IMG_TAG.subn(NEW_IMG, html)
    if html2 != html:
        p.write_text(html2, encoding="utf-8")
        print("local", p.name, "ok", n)
    else:
        print("local", p.name, "skip")

env = Path(
    r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\functions\.env.reloved-digital"
).read_text(encoding="utf-8")
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


templates = api("GET", "/smtp/templates?templateStatus=true&limit=50&sort=desc")
items = templates.get("templates") or []
print("brevo templates", len(items))
for t in items:
    tid = t["id"]
    full = api("GET", f"/smtp/templates/{tid}")
    html = full.get("htmlContent") or ""
    name = full.get("name") or t.get("name")
    if "reloved-email-badge" not in html and "reloved-email-lockup" not in html:
        print(f"#{tid} {name}: no logo skip")
        continue
    html2, n = IMG_TAG.subn(NEW_IMG, html)
    if html2 == html:
        print(f"#{tid} {name}: unchanged")
        continue
    try:
        api("PUT", f"/smtp/templates/{tid}", {"htmlContent": html2})
        check = api("GET", f"/smtp/templates/{tid}")
        ch = check.get("htmlContent") or ""
        print(
            f"#{tid} {name}: updated badge-v14={('email-badge.png?v=14' in ch)} "
            f"lockup={('email-lockup' in ch)}"
        )
    except Exception as e:
        print(f"#{tid} FAIL", e)
