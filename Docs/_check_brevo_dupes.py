# -*- coding: utf-8 -*-
from pathlib import Path
import json
import urllib.request
from collections import defaultdict

env = Path(r"c:\Users\PC 3\Desktop\Reloved-main\Reloved-main\firebase-backend\functions\.env.reloved-digital").read_text(encoding="utf-8")
key = next(line.split("=", 1)[1].strip() for line in env.splitlines() if line.startswith("BREVO_API_KEY="))
wired = {}
for line in env.splitlines():
    if "TEMPLATE_ID" in line and "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        wired[k.strip()] = v.strip()


def api(path):
    req = urllib.request.Request(
        "https://api.brevo.com/v3" + path,
        headers={"api-key": key, "accept": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


items = api("/smtp/templates?limit=50&sort=desc").get("templates") or []
by_name = defaultdict(list)
for t in items:
    by_name[t.get("name")].append(t)

print("=== DUPLICATES BY NAME ===")
for name, ts in sorted(by_name.items()):
    if len(ts) < 2:
        continue
    print(name)
    for t in sorted(ts, key=lambda x: x["id"]):
        wired_to = [k for k, v in wired.items() if v == str(t["id"])]
        print(f"  #{t['id']} active={t.get('isActive')} wired={wired_to or '-'}")

print("\n=== ENV WIRING (current) ===")
for k, v in sorted(wired.items(), key=lambda kv: int(kv[1] or 0) if str(kv[1]).isdigit() else 0):
    print(f"{k}={v}")
