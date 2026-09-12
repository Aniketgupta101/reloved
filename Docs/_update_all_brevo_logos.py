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

NEW_IMG = (
    '<img src="https://reloved-digital.web.app/images/reloved-email-lockup.png?v=13" '
    'width="220" height="48" alt="RELOVED" '
    'style="display:block; border:0; width:220px; height:auto; max-width:100%;">'
)

MAPPING = {
    1: "otp-login.html",
    2: "donation-confirmation-user.html",
    3: "donation-notification-admin.html",
    4: "claim-confirmation-user.html",
    5: "claim-notification-admin.html",
    6: "welcome.html",
    7: "donation-decision.html",
    9: "partner-application-confirmation.html",
    10: "partner-application-admin-alert.html",
    11: "contact-message-admin-alert.html",
    12: "item-claim-notify-giver.html",
    13: "claim-decision.html",
}


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
        err = e.read().decode("utf-8", errors="replace")
        raise RuntimeError("%s %s -> %s %s" % (method, path, e.code, err)) from e


def swap_logo(html):
    html2 = re.sub(
        r"<img[^>]*reloved-email-(?:badge|lockup)\.png[^>]*>",
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
        html2 = html2.replace(
            'width="72" height="72" alt="RE-LOVED"',
            'width="220" height="48" alt="RELOVED"',
        )
        html2 = html2.replace(
            'width="72" height="72" alt="RELOVED"',
            'width="220" height="48" alt="RELOVED"',
        )
    return html2


for tid, fname in MAPPING.items():
    try:
        t = api("GET", "/smtp/templates/%d" % tid)
    except Exception as e:
        print("#%d SKIP get fail: %s" % (tid, e))
        continue
    html = t.get("htmlContent") or ""
    name = t.get("name") or ""
    if (
        "reloved-email" not in html
        and "email-badge" not in html
        and "email-lockup" not in html
    ):
        print("#%d %s: no logo img found - left as-is" % (tid, name))
        continue
    html2 = swap_logo(html)
    if html2 == html and "v=13" in html and "email-lockup" in html:
        print("#%d %s: already lockup v13" % (tid, name))
        continue
    try:
        api("PUT", "/smtp/templates/%d" % tid, {"htmlContent": html2})
        check = api("GET", "/smtp/templates/%d" % tid)
        ch = check.get("htmlContent") or ""
        print(
            "#%d %s: updated lockup=%s v13=%s badge=%s"
            % (
                tid,
                name,
                "email-lockup" in ch,
                "v=13" in ch,
                "email-badge" in ch,
            )
        )
    except Exception as e:
        print("#%d %s: PUT fail %s" % (tid, name, e))
