"""
Backend test for the "sync to client DB" flow:
  - POST /api/clients-db/match    (by email / phone / name)
  - PUT  /api/clients-db/{id}     (partial + multi-field update)
  - PUT  /api/clients-db/{id}     (404 path)

Uses EXPO_PUBLIC_BACKEND_URL from /app/frontend/.env and hits {URL}/api.
Does NOT create persistent data — operates on an existing client, and
restores its original values at the end.
"""

import sys
import requests

# Load backend URL from frontend .env
BACKEND_URL = None
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BACKEND_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
            break

assert BACKEND_URL, "EXPO_PUBLIC_BACKEND_URL not found"
API = f"{BACKEND_URL}/api"
print(f"API base: {API}")

passes = []
fails = []


def check(cond, msg):
    if cond:
        passes.append(msg)
        print(f"  PASS  {msg}")
    else:
        fails.append(msg)
        print(f"  FAIL  {msg}")


def section(title):
    print(f"\n===== {title} =====")


# ---------------------------------------------------------------
# Setup: find a client with email + phone + name
# ---------------------------------------------------------------
section("Setup: pick candidate client")
r = requests.get(f"{API}/clients-db", params={"limit": 50}, timeout=30)
print(f"GET /clients-db?limit=50 -> {r.status_code}")
check(r.status_code == 200, "GET /clients-db returns 200")

clients = r.json() if r.status_code == 200 else []
print(f"  total clients returned: {len(clients)}")

candidate = None
for c in clients:
    if c.get("email") and c.get("phone") and c.get("name"):
        candidate = c
        break

if not candidate:
    for c in clients:
        if c.get("email") and c.get("name"):
            candidate = c
            break

if not candidate:
    print("No suitable client found in DB - creating a temporary one.")
    create_payload = {
        "name": "Temp Sync Test Client XYZ789",
        "email": "temp-sync-candidate@example.com",
        "phone": "5145551234",
        "address": "1 Rue Temp",
        "notes": "",
        "tags": [],
    }
    cr = requests.post(f"{API}/clients-db", json=create_payload, timeout=30)
    check(cr.status_code == 200, f"Created fallback client (status={cr.status_code})")
    if cr.status_code == 200:
        candidate = cr.json()
        CREATED_FALLBACK = True
    else:
        print("Cannot proceed without a candidate client.")
        sys.exit(1)
else:
    CREATED_FALLBACK = False

CID = candidate["id"]
ORIG_NAME = candidate["name"]
ORIG_EMAIL = candidate["email"]
ORIG_PHONE = candidate["phone"]
ORIG_ADDRESS = candidate.get("address", "")

print(f"Candidate client: id={CID}")
print(f"  name={ORIG_NAME!r}  email={ORIG_EMAIL!r}  phone={ORIG_PHONE!r}  address={ORIG_ADDRESS!r}")

# ---------------------------------------------------------------
# Test 1 - Match by email
# ---------------------------------------------------------------
section("Test 1 - Match by email")
payload = {"name": ORIG_NAME, "email": ORIG_EMAIL, "phone": ORIG_PHONE}
r = requests.post(f"{API}/clients-db/match", json=payload, timeout=30)
print(f"POST /clients-db/match -> {r.status_code}")
check(r.status_code == 200, "Test1: HTTP 200")
body = r.json() if r.status_code == 200 else {}
cli = body.get("client") or {}
print(f"  body: matched={body.get('matched')}  by={body.get('by')}  client.id={cli.get('id')}")
check(body.get("matched") is True, "Test1: matched == True")
check(body.get("by") == "email", "Test1: by == 'email'")
check(cli.get("id") == CID, "Test1: client.id matches recorded id")

# ---------------------------------------------------------------
# Test 2 - Match by phone (email differs)
# ---------------------------------------------------------------
section("Test 2 - Match by phone (fake email, real phone)")
if ORIG_PHONE:
    payload = {
        "name": ORIG_NAME,
        "email": "does-not-exist-xyz-9999@example.com",
        "phone": ORIG_PHONE,
    }
    r = requests.post(f"{API}/clients-db/match", json=payload, timeout=30)
    print(f"POST /clients-db/match -> {r.status_code}")
    check(r.status_code == 200, "Test2: HTTP 200")
    body = r.json() if r.status_code == 200 else {}
    cli = body.get("client") or {}
    print(f"  body: matched={body.get('matched')}  by={body.get('by')}  client.id={cli.get('id')}")
    check(body.get("matched") is True, "Test2: matched == True")
    check(body.get("by") == "phone", "Test2: by == 'phone'")
    check(cli.get("id") == CID, "Test2: client.id matches recorded id")
else:
    print("  skipped (candidate has no phone)")

# ---------------------------------------------------------------
# Test 3 - Match by name only
# ---------------------------------------------------------------
section("Test 3 - Match by name only (no email/phone)")
payload = {"name": ORIG_NAME, "email": "", "phone": ""}
r = requests.post(f"{API}/clients-db/match", json=payload, timeout=30)
print(f"POST /clients-db/match -> {r.status_code}")
check(r.status_code == 200, "Test3: HTTP 200")
body = r.json() if r.status_code == 200 else {}
cli = body.get("client") or {}
print(f"  body: matched={body.get('matched')}  by={body.get('by')}  client.id={cli.get('id')}")
check(body.get("matched") is True, "Test3: matched == True")
check(body.get("by") == "name", "Test3: by == 'name'")
# Name might collide with another client in the DB; if the candidate was a fallback we created, name is unique
if CREATED_FALLBACK:
    check(cli.get("id") == CID, "Test3: client.id matches recorded id (unique fallback name)")
else:
    if cli.get("id") == CID:
        check(True, "Test3: client.id matches recorded id")
    else:
        print(f"  NOTE: name matched a different client id={cli.get('id')} (name collision in DB) - accepted")
        passes.append("Test3: name match returned a client (name collision accepted)")

# ---------------------------------------------------------------
# Test 4 - No match
# ---------------------------------------------------------------
section("Test 4 - No match")
payload = {
    "name": "ZZZ Absolutely Nobody Lives Here 99999 QQQ",
    "email": "nobody-xyz-99999@nowhere.invalid",
    "phone": "0000000000000",
}
r = requests.post(f"{API}/clients-db/match", json=payload, timeout=30)
print(f"POST /clients-db/match -> {r.status_code}")
check(r.status_code == 200, "Test4: HTTP 200")
body = r.json() if r.status_code == 200 else {}
print(f"  body: {body}")
check(body.get("matched") is False, "Test4: matched == False")
check(body.get("by") is None, "Test4: by is null")
check(body.get("client") is None, "Test4: client is null")

# ---------------------------------------------------------------
# Test 5 - PUT partial update (email only)
# ---------------------------------------------------------------
section("Test 5 - PUT partial update (email only)")
r = requests.get(f"{API}/clients-db/{CID}", timeout=30)
print(f"GET /clients-db/{CID} -> {r.status_code}")
check(r.status_code == 200, "Test5: baseline GET 200")
baseline = r.json()
baseline_email = baseline["email"]
baseline_phone = baseline["phone"]
baseline_address = baseline["address"]
print(f"  baseline: email={baseline_email!r}  phone={baseline_phone!r}  address={baseline_address!r}")

new_email = "test-sync@temp.com"
r = requests.put(f"{API}/clients-db/{CID}", json={"email": new_email}, timeout=30)
print(f"PUT /clients-db/{CID} body={{'email': '{new_email}'}} -> {r.status_code}")
check(r.status_code == 200, "Test5: PUT email-only returns 200")

r = requests.get(f"{API}/clients-db/{CID}", timeout=30)
check(r.status_code == 200, "Test5: GET after PUT returns 200")
after = r.json()
print(f"  after: email={after.get('email')!r}  phone={after.get('phone')!r}  address={after.get('address')!r}")
check(after["email"] == new_email, f"Test5: email updated to {new_email!r}")
check(after["phone"] == baseline_phone, "Test5: phone UNCHANGED")
check(after["address"] == baseline_address, "Test5: address UNCHANGED")

# Restore email
r = requests.put(f"{API}/clients-db/{CID}", json={"email": baseline_email}, timeout=30)
check(r.status_code == 200, "Test5: restore email via PUT returns 200")
r = requests.get(f"{API}/clients-db/{CID}", timeout=30)
check(r.status_code == 200 and r.json()["email"] == baseline_email, "Test5: email restored")

# ---------------------------------------------------------------
# Test 6 - PUT multi-field (email + phone + address)
# ---------------------------------------------------------------
section("Test 6 - PUT multi-field (email + phone + address)")
multi = {
    "email": "multi-sync@temp.com",
    "phone": "5145550000",
    "address": "999 Test St",
}
r = requests.put(f"{API}/clients-db/{CID}", json=multi, timeout=30)
print(f"PUT /clients-db/{CID} -> {r.status_code}")
check(r.status_code == 200, "Test6: PUT multi-field returns 200")

r = requests.get(f"{API}/clients-db/{CID}", timeout=30)
check(r.status_code == 200, "Test6: GET after multi PUT returns 200")
after = r.json()
print(f"  after: email={after.get('email')!r}  phone={after.get('phone')!r}  address={after.get('address')!r}")
check(after["email"] == "multi-sync@temp.com", "Test6: email updated")
check(after["phone"] == "5145550000", "Test6: phone updated")
check(after["address"] == "999 Test St", "Test6: address updated")

# Restore originals
restore = {
    "email": baseline_email,
    "phone": baseline_phone,
    "address": baseline_address,
}
r = requests.put(f"{API}/clients-db/{CID}", json=restore, timeout=30)
check(r.status_code == 200, "Test6: restore multi-field via PUT returns 200")
r = requests.get(f"{API}/clients-db/{CID}", timeout=30)
final = r.json() if r.status_code == 200 else {}
check(
    final.get("email") == baseline_email
    and final.get("phone") == baseline_phone
    and final.get("address") == baseline_address,
    "Test6: all 3 fields restored to original values",
)

# ---------------------------------------------------------------
# Test 7 - PUT on non-existent client
# ---------------------------------------------------------------
section("Test 7 - PUT on non-existent client")
r = requests.put(f"{API}/clients-db/nonexistent-id-xyz", json={"email": "x@y.com"}, timeout=30)
print(f"PUT /clients-db/nonexistent-id-xyz -> {r.status_code}")
check(r.status_code == 404, "Test7: PUT on unknown id returns 404")

# ---------------------------------------------------------------
# Cleanup (only if we created a fallback)
# ---------------------------------------------------------------
if CREATED_FALLBACK:
    section("Cleanup: delete fallback client")
    r = requests.delete(f"{API}/clients-db/{CID}", timeout=30)
    print(f"DELETE /clients-db/{CID} -> {r.status_code}")
    check(r.status_code == 200, "Cleanup: fallback client deleted")

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
print("\n" + "=" * 60)
print(f"TOTAL PASS: {len(passes)}")
print(f"TOTAL FAIL: {len(fails)}")
if fails:
    print("\nFailed assertions:")
    for f in fails:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("\nAll assertions passed.")
    sys.exit(0)
