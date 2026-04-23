"""
Backend test — PUT /api/requests/{request_id}/send-estimate
Focused scope per review request.
"""
import os
import sys
import requests
from datetime import datetime

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://booking-hub-406.preview.emergentagent.com"
API = f"{BASE_URL.rstrip('/')}/api"

results = []
def rec(name, ok, info=""):
    results.append((name, ok, info))
    print(("PASS" if ok else "FAIL"), "-", name, "|", info)


def main():
    print(f"API: {API}\n")

    # SETUP
    payload = {
        "customer_name": "Test Estimation Client",
        "customer_email": "test-est@example.com",
        "customer_phone": "5145550999",
        "customer_address": "999 Test Ave",
        "preferred_date": "2030-12-01",
        "preferred_time": "10:00",
        "service_type": "commercial",
        "square_footage": "2000",
        "notes": "Test estimation",
        "request_type": "est",
    }
    r = requests.post(f"{API}/requests", json=payload, timeout=30)
    rec("Setup - POST /requests (est)", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:300]}")
    if r.status_code != 200:
        summary()
        return
    req = r.json()
    req_id = req.get("id")
    rec("Setup - response has id", bool(req_id), f"id={req_id}")
    rec("Setup - request_type=='est'", req.get("request_type") == "est", f"got={req.get('request_type')}")

    # T1
    body1 = {"price": 250.50, "note": "Vitres intérieur + extérieur, 30 jours valide"}
    r = requests.put(f"{API}/requests/{req_id}/send-estimate", json=body1, timeout=30)
    rec("T1 - HTTP 200", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        rec("T1 - status=='estimate_sent'", j.get("status") == "estimate_sent", f"got={j.get('status')}")
        rec("T1 - quoted_price==250.50", j.get("quoted_price") == 250.50, f"got={j.get('quoted_price')}")
        rec("T1 - quote_note correct", j.get("quote_note") == body1["note"], f"got={j.get('quote_note')!r}")
        qa = j.get("quoted_at") or ""
        try:
            datetime.fromisoformat(qa.replace("Z", "+00:00"))
            iso_ok = True
        except Exception:
            iso_ok = False
        rec("T1 - quoted_at is ISO timestamp", iso_ok, f"got={qa}")
        rec("T1 - request_type=='est'", j.get("request_type") == "est", f"got={j.get('request_type')}")

    # T2 persistence
    r = requests.get(f"{API}/requests/{req_id}", timeout=30)
    rec("T2 - GET HTTP 200", r.status_code == 200, f"HTTP {r.status_code}")
    if r.status_code == 200:
        j = r.json()
        rec("T2 - persisted status=='estimate_sent'", j.get("status") == "estimate_sent", f"got={j.get('status')}")
        rec("T2 - persisted quoted_price==250.50", j.get("quoted_price") == 250.50, f"got={j.get('quoted_price')}")
        rec("T2 - persisted quote_note", j.get("quote_note") == body1["note"], f"got={j.get('quote_note')!r}")
        rec("T2 - persisted quoted_at present", bool(j.get("quoted_at")), f"got={j.get('quoted_at')}")

    # T3 with valid_until
    body3 = {"price": 300.00, "note": "Nouveau prix", "valid_until": "2026-05-30"}
    r = requests.put(f"{API}/requests/{req_id}/send-estimate", json=body3, timeout=30)
    rec("T3 - HTTP 200", r.status_code == 200, f"HTTP {r.status_code} body={r.text[:300]}")
    if r.status_code == 200:
        j = r.json()
        rec("T3 - quoted_price==300.00 (updated)", j.get("quoted_price") == 300.00, f"got={j.get('quoted_price')}")
        rec("T3 - quote_valid_until=='2026-05-30'", j.get("quote_valid_until") == "2026-05-30", f"got={j.get('quote_valid_until')}")
        rec("T3 - quote_note overwritten", j.get("quote_note") == "Nouveau prix", f"got={j.get('quote_note')!r}")

    r = requests.get(f"{API}/requests/{req_id}", timeout=30)
    if r.status_code == 200:
        j = r.json()
        rec("T3 - persisted quoted_price==300.00", j.get("quoted_price") == 300.00, f"got={j.get('quoted_price')}")
        rec("T3 - persisted quote_valid_until", j.get("quote_valid_until") == "2026-05-30", f"got={j.get('quote_valid_until')}")

    # T4 invalid prices — observational
    r = requests.put(f"{API}/requests/{req_id}/send-estimate", json={"price": 0}, timeout=30)
    qp = r.json().get('quoted_price') if r.status_code == 200 else 'n/a'
    rec("T4a - price=0 observed", True, f"HTTP {r.status_code} quoted_price={qp}")
    r = requests.put(f"{API}/requests/{req_id}/send-estimate", json={"price": -50}, timeout=30)
    qp = r.json().get('quoted_price') if r.status_code == 200 else 'n/a'
    rec("T4b - price=-50 observed", True, f"HTTP {r.status_code} quoted_price={qp}")

    # T5 unknown id
    r = requests.put(f"{API}/requests/nonexistent-xyz/send-estimate", json={"price": 100}, timeout=30)
    rec("T5 - unknown id -> 404", r.status_code == 404, f"HTTP {r.status_code} body={r.text[:200]}")

    # T6 missing price
    r = requests.put(f"{API}/requests/{req_id}/send-estimate", json={}, timeout=30)
    rec("T6 - empty body -> 422", r.status_code == 422, f"HTTP {r.status_code} body={r.text[:200]}")

    # CLEANUP
    r = requests.delete(f"{API}/requests/{req_id}", timeout=30)
    rec("Cleanup - DELETE /requests/{id}", r.status_code == 200, f"HTTP {r.status_code}")
    r = requests.delete(f"{API}/requests/{req_id}/permanent", timeout=30)
    rec("Cleanup - DELETE permanent", r.status_code == 200, f"HTTP {r.status_code}")

    summary()


def summary():
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    failed = [(n, i) for n, ok, i in results if not ok]
    print("\n" + "=" * 60)
    print(f"RESULT: {passed}/{total} passed")
    if failed:
        print("FAILURES:")
        for n, i in failed:
            print(" -", n, "|", i)
    print("=" * 60)
    sys.exit(0 if not failed else 1)


if __name__ == "__main__":
    main()
