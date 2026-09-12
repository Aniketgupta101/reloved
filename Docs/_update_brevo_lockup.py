# -*- coding: utf-8 -*-
import json
import re
import urllib.request
from pathlib import Path

env = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\functions\.env.reloved-digital").read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))


def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    r = urllib.request.Request(
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
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode("utf-8", errors="replace"))
        raise


NEW_IMG = (
    '<img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=13" '
    'width="220" height="48" alt="RELOVED" '
    'style="display:block; border:0; width:220px; height:auto; max-width:100%;">'
)

for tid in (12, 13):
    t = api("GET", f"/smtp/templates/{tid}")
    html = t.get("htmlContent") or ""
    html2 = re.sub(
        r'<img[^>]*reloved-email-(?:badge|lockup)\.png[^>]*>',
        NEW_IMG,
        html,
        count=1,
        flags=re.I,
    )
    if html2 == html:
        html2 = re.sub(
            r"https://reloved-digital\.web\.app/images/reloved-email-(?:badge|lockup)\.png[^\"'\s]*",
            "https://reloved-digital.web.app/images/reloved-email-lockup.png?v=13",
            html,
        )
    api("PUT", f"/smtp/templates/{tid}", {"htmlContent": html2})
    check = api("GET", f"/smtp/templates/{tid}")
    ch = check.get("htmlContent") or ""
    print(f"#{tid} v13={('v=13' in ch)} lockup={('email-lockup' in ch)}")
