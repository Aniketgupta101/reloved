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

for tid in range(1, 14):
    r = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/templates/%d" % tid,
        headers={"api-key": key, "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(r) as resp:
            t = json.loads(resp.read().decode())
    except Exception as e:
        print("#%d fail %s" % (tid, e))
        continue
    html = t.get("htmlContent") or ""
    imgs = re.findall(r'src=["\']([^"\']+)["\']', html)
    logoish = [
        u
        for u in imgs
        if any(
            x in u.lower()
            for x in ["logo", "badge", "lockup", "reloved", "mailin", "sendinblue", "img."]
        )
    ]
    print("#%d %s: total_imgs=%d" % (tid, t.get("name"), len(imgs)))
    for u in logoish[:8]:
        print("  LOGO", u)
    if not logoish:
        for u in imgs[:4]:
            print("  img", u)
