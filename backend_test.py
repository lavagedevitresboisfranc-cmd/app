"""
Backend tests for the NEW soft-delete mechanism for appointments.
Scope: /api/appointments soft-delete endpoints only.
"""

import os
import sys
import requests
from pathlib import Path

FRONTEND_ENV = Path("/app/frontend/.env")
BACKEND_URL = None
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BACKEND_URL = line.split("=", 1)[1].strip().strip('"')
            break

if not BACKEND_URL:
    print("ERROR: EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)

API = BACKEND_URL.rstrip("/") + "/api"
print(f"Testing against: {API}")

results = []
created_ids = []


def record(name, ok, detail=""):
    tag = "PASS" if ok else "FAIL"
    print(f"[{tag}] {name}" + (f" -- {detail}" if detail else ""))
    results.append((name, ok, detail))


def j(resp):
    try:
        return resp.json()
    except Exception:
        return {"_raw": resp.text[:300]}


# 1) Create
create_payload = {
    "title": "SoftDelete Test - regular",
    "client_name": "SoftDelete Test",
    "client_email": "softdelete.test@example.com",
    "client_phone": "5145550000",
    "client_address": "123 Test Addr, Montreal",
    "date": "2030-01-15",
    "time_slot": "10:00",
    "duration_minutes": 30,
    "price": 0.0,
    "notes": "auto-test",
    "status": "upcoming",
}
r = requests.post(f"{API}/appointments", json=create_payload, timeout=30)
appt_id = None
if r.status_code == 200:
    body = j(r)
    appt_id = body.get("id")
    created_ids.append(appt_id)
    record("1) POST /appointments creates new appointment",
           bool(appt_id) and body.get("status") == "upcoming",
           f"status={r.status_code} id={appt_id}")
else:
    record("1) POST /appointments creates new appointment",
           False, f"status={r.status_code} body={j(r)}")
    sys.exit(1)

# 2) Default list includes it
r = requests.get(f"{API}/appointments", timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("2) GET /appointments (default) lists new appointment",
       r.status_code == 200 and appt_id in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 3a) Soft-delete via DELETE /{id}
r = requests.delete(f"{API}/appointments/{appt_id}", timeout=30)
body = j(r)
record("3a) DELETE /appointments/{id} returns 200 with exact shape",
       r.status_code == 200 and body.get("message") == "Appointment archived" and body.get("archived") is True,
       f"status={r.status_code} body={body}")

# 3b) Still exists with status=archived
r = requests.get(f"{API}/appointments/{appt_id}", timeout=30)
body = j(r)
record("3b) Record still exists in DB with status=archived after soft delete",
       r.status_code == 200 and body.get("status") == "archived",
       f"status={r.status_code} returned_status={body.get('status')} archived_at={body.get('archived_at')}")

# 4) Hidden by default
r = requests.get(f"{API}/appointments", timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("4) GET /appointments (default) hides archived id",
       r.status_code == 200 and appt_id not in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 5) include_archived=true returns it
r = requests.get(f"{API}/appointments", params={"include_archived": "true"}, timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("5) GET /appointments?include_archived=true includes archived id",
       r.status_code == 200 and appt_id in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 6a) ?status=archived
r = requests.get(f"{API}/appointments", params={"status": "archived"}, timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
all_arch = all(a.get("status") == "archived" for a in body) if isinstance(body, list) else False
record("6a) GET /appointments?status=archived contains id, all archived",
       r.status_code == 200 and appt_id in ids and all_arch,
       f"status={r.status_code} present={appt_id in ids} all_archived={all_arch}")

# 6b) ?status=upcoming
r = requests.get(f"{API}/appointments", params={"status": "upcoming"}, timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("6b) GET /appointments?status=upcoming does NOT contain archived id",
       r.status_code == 200 and appt_id not in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 7) GET /{id} still returns archived
r = requests.get(f"{API}/appointments/{appt_id}", timeout=30)
body = j(r)
record("7) GET /appointments/{id} returns archived appointment",
       r.status_code == 200 and body.get("status") == "archived",
       f"status={r.status_code} returned_status={body.get('status')} archived_at_in_resp={bool(body.get('archived_at'))}")

# 8a) Restore
r = requests.post(f"{API}/appointments/{appt_id}/restore", timeout=30)
body = j(r)
record("8a) POST /appointments/{id}/restore returns 200 and status=upcoming",
       r.status_code == 200 and body.get("status") == "upcoming",
       f"status={r.status_code} returned_status={body.get('status')}")

# 8b) archived_at removed
r = requests.get(f"{API}/appointments/{appt_id}", timeout=30)
body = j(r)
record("8b) After restore, archived_at is not present",
       r.status_code == 200 and not body.get("archived_at"),
       f"archived_at={body.get('archived_at')}")

# 9) Reappears in default list
r = requests.get(f"{API}/appointments", timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("9) GET /appointments (default) re-includes restored appointment",
       r.status_code == 200 and appt_id in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 10a) Re-archive
r = requests.delete(f"{API}/appointments/{appt_id}", timeout=30)
record("10a) Re-archive via DELETE /appointments/{id}",
       r.status_code == 200 and j(r).get("archived") is True,
       f"status={r.status_code} body={j(r)}")

# 10b) Permanent delete
r = requests.delete(f"{API}/appointments/{appt_id}/permanent", timeout=30)
body = j(r)
record("10b) DELETE /appointments/{id}/permanent returns 200 with exact shape",
       r.status_code == 200 and body.get("message") == "Appointment permanently deleted",
       f"status={r.status_code} body={body}")
if r.status_code == 200 and appt_id in created_ids:
    created_ids.remove(appt_id)

# 10c) GET by id → 404
r = requests.get(f"{API}/appointments/{appt_id}", timeout=30)
record("10c) GET /appointments/{id} after permanent delete returns 404",
       r.status_code == 404, f"status={r.status_code}")

# 10d) include_archived no longer has it
r = requests.get(f"{API}/appointments", params={"include_archived": "true"}, timeout=30)
body = j(r) if r.status_code == 200 else []
ids = {a.get("id") for a in body} if isinstance(body, list) else set()
record("10d) GET /appointments?include_archived=true no longer lists id",
       r.status_code == 200 and appt_id not in ids,
       f"status={r.status_code} present={appt_id in ids}")

# 11) 404 cases
bogus = "nonexistent-id-" + os.urandom(4).hex()
r = requests.delete(f"{API}/appointments/{bogus}", timeout=30)
record("11a) DELETE /appointments/{bogus} -> 404",
       r.status_code == 404, f"status={r.status_code} body={j(r)}")

r = requests.post(f"{API}/appointments/{bogus}/restore", timeout=30)
record("11b) POST /appointments/{bogus}/restore -> 404",
       r.status_code == 404, f"status={r.status_code} body={j(r)}")

r = requests.delete(f"{API}/appointments/{bogus}/permanent", timeout=30)
record("11c) DELETE /appointments/{bogus}/permanent -> 404",
       r.status_code == 404, f"status={r.status_code} body={j(r)}")

# Cleanup
print("\nCleanup phase...")
for cid in list(created_ids):
    try:
        requests.delete(f"{API}/appointments/{cid}/permanent", timeout=30)
    except Exception as e:
        print(f"  cleanup err {cid}: {e}")
try:
    rr = requests.get(f"{API}/clients-db", params={"search": "SoftDelete Test"}, timeout=30)
    if rr.status_code == 200:
        for c in rr.json():
            if c.get("name", "").startswith("SoftDelete Test") or c.get("email") == "softdelete.test@example.com":
                requests.delete(f"{API}/clients-db/{c['id']}", timeout=30)
                print(f"  cleaned client {c['id']} ({c.get('name')})")
except Exception as e:
    print(f"  client cleanup err: {e}")

passed = sum(1 for _, ok, _ in results if ok)
total = len(results)
print("\n" + "=" * 60)
print(f"RESULT: {passed}/{total} checks passed")
print("=" * 60)
for name, ok, detail in results:
    tag = "PASS" if ok else "FAIL"
    print(f"  [{tag}] {name}" + (f"  ({detail})" if not ok and detail else ""))

sys.exit(0 if passed == total else 1)
