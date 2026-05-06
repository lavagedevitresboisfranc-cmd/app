"""
Backend tests for POST /api/appointments/{appointment_id}/encaisser
Target: Encaisser (Collect payment) endpoint — see /app/backend/server.py ~line 4609.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests


def _load_backend_url() -> str:
    env_path = Path("/app/frontend/.env")
    url = None
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            s = line.strip()
            if s.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = s.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not url:
        url = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").strip()
    if not url:
        raise RuntimeError("EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    return url.rstrip("/")


BASE = _load_backend_url()
API = f"{BASE}/api"
TIMEOUT = 30

_passed = 0
_failed = 0
_failures: list[str] = []


def _check(cond: bool, label: str, extra: str = "") -> None:
    global _passed, _failed
    if cond:
        _passed += 1
        print(f"  ✅ {label}")
    else:
        _failed += 1
        msg = f"{label}" + (f" — {extra}" if extra else "")
        _failures.append(msg)
        print(f"  ❌ {label}" + (f" — {extra}" if extra else ""))


def _fmt(resp: requests.Response) -> str:
    try:
        return f"HTTP {resp.status_code} body={resp.text[:400]}"
    except Exception:
        return f"HTTP {resp.status_code}"


def _create_test_appointment(title: str, phone: str, address: str) -> str:
    body = {
        "title": title,
        "client_name": "Encaisser Test",
        "client_email": "",
        "client_phone": phone,
        "client_address": address,
        "date": "2026-12-20",
        "time_slot": "14:00",
        "duration_minutes": 60,
        "price": 200.00,
        "status": "upcoming",
        "notes": "",
    }
    r = requests.post(f"{API}/appointments", json=body, timeout=TIMEOUT)
    assert r.status_code == 200, f"Setup POST /appointments failed: {_fmt(r)}"
    return r.json()["id"]


def main() -> int:
    print(f"Testing against: {API}\n")

    # Baseline revenue count
    r = requests.get(f"{API}/revenues", timeout=TIMEOUT)
    _check(r.status_code == 200, "Baseline GET /api/revenues returns 200", _fmt(r))
    baseline_revenues = r.json() if r.status_code == 200 else []
    baseline_count = len(baseline_revenues) if isinstance(baseline_revenues, list) else 0
    print(f"  ℹ️  Baseline revenues count: {baseline_count}")

    created_appt_ids: list[str] = []
    created_revenue_ids: list[str] = []
    created_client_ids: set[str] = set()

    print("\n=== SETUP: Create test appointment #1 ===")
    appt_id_1 = _create_test_appointment(
        "Test Encaisser", "5141234567", "456 Rue Test"
    )
    created_appt_ids.append(appt_id_1)
    print(f"  ✅ Appointment #1 created id={appt_id_1}")

    r = requests.get(f"{API}/appointments/{appt_id_1}", timeout=TIMEOUT)
    if r.status_code == 200:
        cid = r.json().get("client_id")
        if cid:
            created_client_ids.add(cid)
            print(f"  ℹ️  Auto-linked client_id={cid}")

    # TEST 1: Happy path — full body
    print("\n=== TEST 1: Happy path — full body ===")
    body1 = {
        "amount": 200.00,
        "payment_method": "etransfert",
        "category": "printemps",
        "date": "2026-12-20",
        "description": "Lavage de vitres - 456 Rue Test",
    }
    r = requests.post(f"{API}/appointments/{appt_id_1}/encaisser", json=body1, timeout=TIMEOUT)
    _check(r.status_code == 200, "POST /encaisser (full body) → 200", _fmt(r))
    revenue_id_1 = None
    if r.status_code == 200:
        j = r.json()
        _check(j.get("ok") is True, "response.ok == True", str(j.get("ok")))
        _check(j.get("status") == "paid", "response.status == 'paid'", str(j.get("status")))
        _check(j.get("paid_amount") == 200.0, "response.paid_amount == 200.0", str(j.get("paid_amount")))
        _check(j.get("paid_method") == "etransfert", "response.paid_method == 'etransfert'", str(j.get("paid_method")))
        paid_at = j.get("paid_at")
        _check(isinstance(paid_at, str) and len(paid_at) > 0, "response.paid_at is ISO string", str(paid_at))
        try:
            datetime.fromisoformat(paid_at.replace("Z", "+00:00"))
            iso_ok = True
        except Exception:
            iso_ok = False
        _check(iso_ok, "response.paid_at parses as ISO timestamp", str(paid_at))

        rev = j.get("revenue") or {}
        _check(isinstance(rev, dict) and "id" in rev, "response.revenue has 'id'", json.dumps(rev)[:200])
        _check(rev.get("amount") == 200.0, "revenue.amount == 200.0", str(rev.get("amount")))
        _check(rev.get("category") == "printemps", "revenue.category == 'printemps'", str(rev.get("category")))
        _check(rev.get("payment_method") == "etransfert", "revenue.payment_method == 'etransfert'", str(rev.get("payment_method")))
        _check(rev.get("appointment_id") == appt_id_1, "revenue.appointment_id == appt_id_1", str(rev.get("appointment_id")))
        _check(rev.get("date") == "2026-12-20", "revenue.date == '2026-12-20'", str(rev.get("date")))
        _check(rev.get("description") == "Lavage de vitres - 456 Rue Test", "revenue.description matches body", str(rev.get("description")))

        revenue_id_1 = rev.get("id")
        if revenue_id_1:
            created_revenue_ids.append(revenue_id_1)

    # TEST 2: GET appointment after encaisser
    print("\n=== TEST 2: GET /appointments/{id} after encaisser ===")
    r = requests.get(f"{API}/appointments/{appt_id_1}", timeout=TIMEOUT)
    _check(r.status_code == 200, "GET /appointments/{id} → 200", _fmt(r))
    if r.status_code == 200:
        a = r.json()
        _check(a.get("status") == "paid", "appt.status == 'paid'", str(a.get("status")))
        _check(isinstance(a.get("paid_at"), str) and len(a.get("paid_at") or "") > 0, "appt.paid_at present", str(a.get("paid_at")))
        _check(a.get("paid_amount") == 200.0, "appt.paid_amount == 200.0", str(a.get("paid_amount")))
        _check(a.get("paid_method") == "etransfert", "appt.paid_method == 'etransfert'", str(a.get("paid_method")))
        _check(
            revenue_id_1 is not None and a.get("revenue_id") == revenue_id_1,
            "appt.revenue_id matches revenue from step 1",
            f"appt.revenue_id={a.get('revenue_id')}, expected={revenue_id_1}",
        )

    # TEST 3: GET /revenues
    print("\n=== TEST 3: GET /api/revenues — verify revenue is listed ===")
    r = requests.get(f"{API}/revenues", timeout=TIMEOUT)
    _check(r.status_code == 200, "GET /api/revenues → 200", _fmt(r))
    if r.status_code == 200 and revenue_id_1:
        revs = r.json()
        found = next((x for x in revs if x.get("id") == revenue_id_1), None)
        _check(found is not None, "revenue from step 1 found in /api/revenues list")
        if found:
            _check(found.get("appointment_id") == appt_id_1, "listed revenue.appointment_id == appt_id_1", str(found.get("appointment_id")))
            _check(found.get("amount") == 200.0, "listed revenue.amount == 200.0", str(found.get("amount")))

    # TEST 4: Defaults — minimal body
    print("\n=== TEST 4: Defaults — minimal body (no date, no description) ===")
    appt_id_2 = _create_test_appointment(
        "Test Encaisser 2", "5149876543", "789 Avenue Default"
    )
    created_appt_ids.append(appt_id_2)
    r = requests.get(f"{API}/appointments/{appt_id_2}", timeout=TIMEOUT)
    if r.status_code == 200:
        cid = r.json().get("client_id")
        if cid:
            created_client_ids.add(cid)

    body4 = {"amount": 50.00, "payment_method": "cash", "category": "automne"}
    r = requests.post(f"{API}/appointments/{appt_id_2}/encaisser", json=body4, timeout=TIMEOUT)
    _check(r.status_code == 200, "POST /encaisser (minimal body) → 200", _fmt(r))
    today_utc = datetime.now(timezone.utc).date().isoformat()
    if r.status_code == 200:
        j = r.json()
        rev = j.get("revenue") or {}
        _check(rev.get("date") == today_utc, f"revenue.date defaults to today UTC ({today_utc})", str(rev.get("date")))
        expected_desc = "Lavage de vitres - 789 Avenue Default"
        _check(rev.get("description") == expected_desc, f"revenue.description defaults to '{expected_desc}'", str(rev.get("description")))
        _check(rev.get("amount") == 50.0, "revenue.amount == 50.0", str(rev.get("amount")))
        _check(rev.get("category") == "automne", "revenue.category == 'automne'", str(rev.get("category")))
        _check(rev.get("payment_method") == "cash", "revenue.payment_method == 'cash'", str(rev.get("payment_method")))
        rid2 = rev.get("id")
        if rid2:
            created_revenue_ids.append(rid2)

    # TEST 5: amount=0
    print("\n=== TEST 5: Negative — amount=0 ===")
    appt_id_3 = _create_test_appointment(
        "Test Encaisser 3", "5142220000", "111 Negative"
    )
    created_appt_ids.append(appt_id_3)
    r3 = requests.get(f"{API}/appointments/{appt_id_3}", timeout=TIMEOUT)
    if r3.status_code == 200:
        cid = r3.json().get("client_id")
        if cid:
            created_client_ids.add(cid)

    r = requests.post(
        f"{API}/appointments/{appt_id_3}/encaisser",
        json={"amount": 0, "payment_method": "cash", "category": "printemps"},
        timeout=TIMEOUT,
    )
    _check(r.status_code == 400, "amount=0 → HTTP 400", _fmt(r))
    if r.status_code == 400:
        det = (r.json().get("detail") or "").lower()
        _check("montant" in det and "positif" in det, "detail mentions 'montant' and 'positif'", det)

    # TEST 6: amount=-50
    print("\n=== TEST 6: Negative — amount=-50 ===")
    r = requests.post(
        f"{API}/appointments/{appt_id_3}/encaisser",
        json={"amount": -50, "payment_method": "cash", "category": "printemps"},
        timeout=TIMEOUT,
    )
    _check(r.status_code == 400, "amount=-50 → HTTP 400", _fmt(r))
    if r.status_code == 400:
        det = (r.json().get("detail") or "").lower()
        _check("montant" in det and "positif" in det, "detail mentions 'montant' and 'positif'", det)

    # TEST 7: invalid payment_method
    print("\n=== TEST 7: Negative — invalid payment_method 'bitcoin' ===")
    r = requests.post(
        f"{API}/appointments/{appt_id_3}/encaisser",
        json={"amount": 100, "payment_method": "bitcoin", "category": "printemps"},
        timeout=TIMEOUT,
    )
    _check(r.status_code == 400, "invalid payment_method → HTTP 400", _fmt(r))
    if r.status_code == 400:
        det = r.json().get("detail") or ""
        low = det.lower()
        _check(
            ("cash" in low and "etransfert" in low) or ("mode de paiement" in low),
            "detail mentions 'Mode de paiement: cash ou etransfert'",
            det,
        )

    # TEST 8: invalid category
    print("\n=== TEST 8: Negative — invalid category 'hiver' ===")
    r = requests.post(
        f"{API}/appointments/{appt_id_3}/encaisser",
        json={"amount": 100, "payment_method": "cash", "category": "hiver"},
        timeout=TIMEOUT,
    )
    _check(r.status_code == 400, "invalid category → HTTP 400", _fmt(r))
    if r.status_code == 400:
        det = r.json().get("detail") or ""
        low = det.lower()
        _check("catégorie" in low or "categorie" in low, "detail mentions 'Catégorie invalide'", det)
        _check("invalide" in low or "invalid" in low, "detail mentions 'invalide'", det)

    # TEST 9: nonexistent appointment
    print("\n=== TEST 9: Negative — nonexistent appointment id ===")
    r = requests.post(
        f"{API}/appointments/nonexistent-xyz-uuid/encaisser",
        json={"amount": 100, "payment_method": "cash", "category": "printemps"},
        timeout=TIMEOUT,
    )
    _check(r.status_code == 404, "nonexistent appt → HTTP 404", _fmt(r))
    if r.status_code == 404:
        det = r.json().get("detail") or ""
        _check(det == "Appointment not found", "detail == 'Appointment not found'", det)

    # TEST 10: AppointmentResponse regression
    print("\n=== TEST 10: AppointmentResponse regression (list includes paid_* fields) ===")
    r = requests.get(f"{API}/appointments?include_archived=true", timeout=TIMEOUT)
    _check(r.status_code == 200, "GET /api/appointments → 200", _fmt(r))
    if r.status_code == 200:
        items = r.json()
        _check(isinstance(items, list) and len(items) > 0, "list is non-empty")
        sample = next((x for x in items if x.get("id") == appt_id_1), None)
        _check(sample is not None, f"paid appt {appt_id_1} present in list")
        if sample:
            for f in ("paid_at", "paid_amount", "paid_method", "revenue_id"):
                _check(f in sample, f"list item has '{f}' key (paid appt)", f"keys={list(sample.keys())}")
            _check(sample.get("paid_amount") == 200.0, "paid appt list item.paid_amount == 200.0", str(sample.get("paid_amount")))
            _check(sample.get("paid_method") == "etransfert", "paid appt list item.paid_method == 'etransfert'", str(sample.get("paid_method")))
            _check(sample.get("revenue_id") == revenue_id_1, "paid appt list item.revenue_id matches", str(sample.get("revenue_id")))

        unpaid = next((x for x in items if x.get("id") == appt_id_3), None)
        _check(unpaid is not None, f"unpaid appt {appt_id_3} present in list")
        if unpaid:
            for f in ("paid_at", "paid_amount", "paid_method", "revenue_id"):
                _check(f in unpaid, f"list item has '{f}' key (unpaid appt)", f"keys={list(unpaid.keys())}")
                _check(unpaid.get(f) is None, f"unpaid appt list item.{f} is null", f"value={unpaid.get(f)}")

    # CLEANUP
    print("\n=== CLEANUP ===")
    for rid in created_revenue_ids:
        r = requests.delete(f"{API}/revenues/{rid}", timeout=TIMEOUT)
        _check(r.status_code == 200, f"DELETE /api/revenues/{rid} → 200", _fmt(r))

    for aid in created_appt_ids:
        r = requests.delete(f"{API}/appointments/{aid}/permanent", timeout=TIMEOUT)
        _check(r.status_code == 200, f"DELETE /api/appointments/{aid}/permanent → 200", _fmt(r))

    for cid in created_client_ids:
        r = requests.delete(f"{API}/clients-db/{cid}", timeout=TIMEOUT)
        ok = r.status_code in (200, 404)
        _check(ok, f"DELETE /api/clients-db/{cid} → 200/404", _fmt(r))

    r = requests.get(f"{API}/revenues", timeout=TIMEOUT)
    if r.status_code == 200:
        final_revs = r.json()
        final_count = len(final_revs) if isinstance(final_revs, list) else 0
        _check(
            final_count == baseline_count,
            f"final /api/revenues count matches baseline ({baseline_count})",
            f"got {final_count}",
        )

    print(f"\n========== RESULTS ==========")
    print(f"PASSED: {_passed}")
    print(f"FAILED: {_failed}")
    if _failures:
        print("\nFAILURES:")
        for f in _failures:
            print(f"  - {f}")
    return 0 if _failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
