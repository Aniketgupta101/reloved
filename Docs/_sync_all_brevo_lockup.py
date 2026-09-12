# -*- coding: utf-8 -*-
import json
import re
import sys
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
env = Path(
    r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\functions\.env.reloved-digital"
).read_text(encoding="utf-8", errors="replace")
key = next(
    line.split("=", 1)[1].strip()
    for line in env.splitlines()
    if line.startswith("BREVO_API_KEY=")
)

NEW_SRC = "https://reloved-digital.web.app/images/reloved-email-lockup.png?v=13"


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
    with urllib.request.urlopen(r) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


for tid in range(1, 14):
    t = api("GET", "/smtp/templates/%d" % tid)
    html = t.get("htmlContent") or ""
    name = t.get("name") or ""
    html2 = html
    # replace any old logo URLs
    html2 = re.sub(
        r"https://reloved-digital\.web\.app/images/reloved-(?:wordmark-lockup|email-badge|email-lockup)\.png[^\"'\s]*",
        NEW_SRC,
        html2,
    )
    # normalize width if old square badge attrs remain
    html2 = re.sub(
        r'(src="%s")([^>]*)(width="72")' % re.escape(NEW_SRC),
        r'\1 width="220" height="48"',
        html2,
    )
    if html2 == html:
        print("#%d %s: no change needed (already ok? %s)" % (tid, name, NEW_SRC in html))
        continue
    api("PUT", "/smtp/templates/%d" % tid, {"htmlContent": html2})
    check = api("GET", "/smtp/templates/%d" % tid)
    ch = check.get("htmlContent") or ""
    print(
        "#%d %s: updated email-lockup=%s wordmark=%s"
        % (tid, name, "email-lockup.png?v=13" in ch, "wordmark-lockup" in ch)
    )
