# -*- coding: utf-8 -*-
"""Deactivate then permanently delete duplicate Brevo templates #13, #20-25."""
from pathlib import Path
import json
import urllib.request

env = Path(
    r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\functions\.env.reloved-digital"
).read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))

# Keep wired IDs; delete only these duplicates
TO_DELETE = [13, 20, 21, 22, 23, 24, 25]
KEEP = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19}


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


for tid in TO_DELETE:
    if tid in KEEP:
        print(f"REFUSE #{tid} is in keep list")
        continue
    # fetch name for log
    st, full = api("GET", f"/smtp/templates/{tid}")
    name = full.get("name") if isinstance(full, dict) else "?"
    if st != 200:
        print(f"#{tid} GET {st} {full}")
        continue
    st2, res2 = api("PUT", f"/smtp/templates/{tid}", {"isActive": False})
    print(f"#{tid} {name}: deactivate -> {st2}")
    st3, res3 = api("DELETE", f"/smtp/templates/{tid}")
    print(f"#{tid} {name}: delete -> {st3} {res3 if st3 >= 400 else 'ok'}")

# verify remaining
st, listing = api("GET", "/smtp/templates?limit=50&sort=desc")
items = listing.get("templates") if isinstance(listing, dict) else []
print("\n=== Remaining templates ===")
for t in sorted(items or [], key=lambda x: x["id"]):
    print(f"#{t['id']} {t.get('name')} active={t.get('isActive')}")
