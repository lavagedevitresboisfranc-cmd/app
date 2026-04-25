"""
Backend test for: PUT /api/appointments/{id} — Reschedule with email notification.
Scope strictly limited to PUT /api/appointments/{id} with the new `notify_client` flag,
the email-on-reschedule logic, and the helper _fmt_date_fr.
"""
import os
import sys
import time
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://booking-hub-406.preview.emergentagent.com"
API = f"{BASE_URL.rstrip('/')}/api"

NOTIFY_EMAIL = "lavagedevitreboisfranc@live.com"

passed = 0
failed = 0
errors = []


def assert_eq(label, actual, expected):
    global passed, failed
    if actual == expected:
        passed += 1
        print(f"PASS [{label}] {actual!r} == {expected!r}")
    else:
        failed += 1
        msg = f"FAIL [{label}] expected {expected!r} got {actual!r}"
        errors.append(msg)
        print(msg)


def assert_true(label, cond, info=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"PASS [{label}] {info}")
    else:
        failed += 1
        msg = f"FAIL [{label}] {info}"
        errors.append(msg)
        print(msg)


def get_log_tail(n=400):
    """Return the last n lines of supervisor backend stderr+stdout combined."""
    out = ""
    for path in ("/var/log/supervisor/backend.err.log", "/var/log/supervisor/backend.out.log"):
        try:
            with open(path) as f:
                lines = f.readlines()
                out += "".join(lines[-n:]) + "\n"
        except Exception:
            pass
    return out


def main():
    global passed, failed
    print(f"Using API base: {API}")

    created_ids = []

    # ---------- SETUP: Create appointment 1 with client_email ----------
    setup_payload = {
        "title": "Test reprog",
        "client_name": "Test Client",
        "client_email": NOTIFY_EMAIL,
        "client_phone": "5141234567",
        "client_address": "123 Test St",
        "date": "2026-12-01",
        "time_slot": "09:00",
        "duration_minutes": 60,
        "status": "upcoming",
    }
    r = requests.post(f"{API}/appointments", json=setup_payload, timeout=30)
    assert_eq("setup1.status", r.status_code, 200)
    appt1 = r.json()
    appt1_id = appt1.get("id")
    created_ids.append(appt1_id)
    assert_true("setup1.id_present", bool(appt1_id), f"id={appt1_id}")
    assert_eq("setup1.client_email", appt1.get("client_email"), NOTIFY_EMAIL)
    assert_eq("setup1.date", appt1.get("date"), "2026-12-01")
    assert_eq("setup1.time_slot", appt1.get("time_slot"), "09:00")

    # ---------- CASE 1: PUT date+time change with notify_client=True ----------
    log_before_t1 = get_log_tail(150)
    sent_before_t1 = log_before_t1.count("Reschedule email sent")
    failed_before_t1 = log_before_t1.count("Failed to send reschedule email")

    body1 = {"date": "2026-12-15", "time_slot": "10:30", "notify_client": True}
    r = requests.put(f"{API}/appointments/{appt1_id}", json=body1, timeout=30)
    assert_eq("case1.status", r.status_code, 200)
    j1 = r.json()
    assert_eq("case1.date", j1.get("date"), "2026-12-15")
    assert_eq("case1.time_slot", j1.get("time_slot"), "10:30")
    assert_true("case1.no_notify_client_in_resp", "notify_client" not in j1,
                f"keys={list(j1.keys())}")

    time.sleep(3)
    log_after_t1 = get_log_tail(200)
    sent_after_t1 = log_after_t1.count("Reschedule email sent")
    failed_after_t1 = log_after_t1.count("Failed to send reschedule email")
    has_new_send_log = (sent_after_t1 > sent_before_t1) or (failed_after_t1 > failed_before_t1)
    assert_true("case1.log_email_attempt", has_new_send_log,
                f"sent before={sent_before_t1} after={sent_after_t1}; "
                f"failed before={failed_before_t1} after={failed_after_t1}")

    # ---------- CASE 2: PUT status=completed with notify_client=True (no date/time change) ----------
    log_before_t2 = get_log_tail(200)
    sent_before_t2 = log_before_t2.count("Reschedule email sent")
    failed_before_t2 = log_before_t2.count("Failed to send reschedule email")

    body2 = {"status": "completed", "notify_client": True}
    r = requests.put(f"{API}/appointments/{appt1_id}", json=body2, timeout=30)
    assert_eq("case2.status", r.status_code, 200)
    j2 = r.json()
    assert_eq("case2.status_field", j2.get("status"), "completed")
    assert_true("case2.no_notify_client_in_resp", "notify_client" not in j2,
                f"keys={list(j2.keys())}")
    assert_eq("case2.date_unchanged", j2.get("date"), "2026-12-15")
    assert_eq("case2.time_slot_unchanged", j2.get("time_slot"), "10:30")
    time.sleep(2)
    log_after_t2 = get_log_tail(250)
    sent_after_t2 = log_after_t2.count("Reschedule email sent")
    failed_after_t2 = log_after_t2.count("Failed to send reschedule email")
    assert_true("case2.no_new_send_log", sent_after_t2 == sent_before_t2,
                f"before={sent_before_t2} after={sent_after_t2}")
    assert_true("case2.no_new_failed_log", failed_after_t2 == failed_before_t2,
                f"before={failed_before_t2} after={failed_after_t2}")

    # ---------- CASE 3: PUT date change with notify_client=False ----------
    log_before_t3 = get_log_tail(250)
    sent_before_t3 = log_before_t3.count("Reschedule email sent")
    failed_before_t3 = log_before_t3.count("Failed to send reschedule email")

    body3 = {"date": "2026-12-20", "notify_client": False}
    r = requests.put(f"{API}/appointments/{appt1_id}", json=body3, timeout=30)
    assert_eq("case3.status", r.status_code, 200)
    j3 = r.json()
    assert_eq("case3.date", j3.get("date"), "2026-12-20")
    assert_true("case3.no_notify_client_in_resp", "notify_client" not in j3,
                f"keys={list(j3.keys())}")
    time.sleep(2)
    log_after_t3 = get_log_tail(300)
    sent_after_t3 = log_after_t3.count("Reschedule email sent")
    failed_after_t3 = log_after_t3.count("Failed to send reschedule email")
    assert_true("case3.no_new_send_log", sent_after_t3 == sent_before_t3,
                f"before={sent_before_t3} after={sent_after_t3}")
    assert_true("case3.no_new_failed_log", failed_after_t3 == failed_before_t3,
                f"before={failed_before_t3} after={failed_after_t3}")

    # ---------- CASE 4: PUT time_slot change with no notify_client ----------
    log_before_t4 = get_log_tail(300)
    sent_before_t4 = log_before_t4.count("Reschedule email sent")
    failed_before_t4 = log_before_t4.count("Failed to send reschedule email")

    body4 = {"time_slot": "11:00"}
    r = requests.put(f"{API}/appointments/{appt1_id}", json=body4, timeout=30)
    assert_eq("case4.status", r.status_code, 200)
    j4 = r.json()
    assert_eq("case4.time_slot", j4.get("time_slot"), "11:00")
    assert_true("case4.no_notify_client_in_resp", "notify_client" not in j4,
                f"keys={list(j4.keys())}")
    time.sleep(2)
    log_after_t4 = get_log_tail(350)
    sent_after_t4 = log_after_t4.count("Reschedule email sent")
    failed_after_t4 = log_after_t4.count("Failed to send reschedule email")
    assert_true("case4.no_new_send_log", sent_after_t4 == sent_before_t4,
                f"before={sent_before_t4} after={sent_after_t4}")
    assert_true("case4.no_new_failed_log", failed_after_t4 == failed_before_t4,
                f"before={failed_before_t4} after={failed_after_t4}")

    # ---------- CASE 5: SECOND appointment with empty client_email ----------
    setup2_payload = dict(setup_payload)
    setup2_payload["client_email"] = ""
    setup2_payload["title"] = "Test reprog 2 (no email)"
    r = requests.post(f"{API}/appointments", json=setup2_payload, timeout=30)
    assert_eq("setup2.status", r.status_code, 200)
    appt2 = r.json()
    appt2_id = appt2.get("id")
    created_ids.append(appt2_id)
    assert_eq("setup2.client_email_empty", appt2.get("client_email", ""), "")

    log_before_t5 = get_log_tail(350)
    sent_before_t5 = log_before_t5.count("Reschedule email sent")
    failed_before_t5 = log_before_t5.count("Failed to send reschedule email")

    body5 = {"date": "2026-12-25", "time_slot": "14:00", "notify_client": True}
    r = requests.put(f"{API}/appointments/{appt2_id}", json=body5, timeout=30)
    assert_eq("case5.status", r.status_code, 200)
    j5 = r.json()
    assert_eq("case5.date", j5.get("date"), "2026-12-25")
    assert_eq("case5.time_slot", j5.get("time_slot"), "14:00")
    assert_true("case5.no_notify_client_in_resp", "notify_client" not in j5,
                f"keys={list(j5.keys())}")
    time.sleep(2)
    log_after_t5 = get_log_tail(400)
    sent_after_t5 = log_after_t5.count("Reschedule email sent")
    failed_after_t5 = log_after_t5.count("Failed to send reschedule email")
    assert_true("case5.no_new_send_log", sent_after_t5 == sent_before_t5,
                f"before={sent_before_t5} after={sent_after_t5}")
    assert_true("case5.no_new_failed_log", failed_after_t5 == failed_before_t5,
                f"before={failed_before_t5} after={failed_after_t5}")

    # ---------- CASE 6: GET /{id} confirm response has no notify_client field ----------
    r = requests.get(f"{API}/appointments/{appt1_id}", timeout=30)
    assert_eq("case6.status", r.status_code, 200)
    j6 = r.json()
    assert_true("case6.no_notify_client_field", "notify_client" not in j6,
                f"keys={list(j6.keys())}")

    # ---------- CASE 7: PUT empty body → 400 ----------
    r = requests.put(f"{API}/appointments/{appt1_id}", json={}, timeout=30)
    assert_eq("case7.status", r.status_code, 400)
    detail = ""
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    assert_true("case7.detail", "No fields to update" in str(detail),
                f"detail={detail!r}")

    # ---------- CASE 8: PUT nonexistent → 404 ----------
    r = requests.put(f"{API}/appointments/nonexistent-uuid",
                     json={"date": "2026-12-30", "notify_client": True}, timeout=30)
    assert_eq("case8.status", r.status_code, 404)
    detail8 = ""
    try:
        detail8 = r.json().get("detail", "")
    except Exception:
        detail8 = r.text
    assert_true("case8.detail", "Appointment not found" in str(detail8),
                f"detail={detail8!r}")

    # ---------- CASE 9: _fmt_date_fr ----------
    sys.path.insert(0, "/app/backend")
    try:
        import importlib
        m = importlib.import_module("server")
        assert_eq("case9.fmt_2026-12-15", m._fmt_date_fr("2026-12-15"), "15 décembre 2026")
        assert_eq("case9.fmt_empty", m._fmt_date_fr(""), "")
        assert_eq("case9.fmt_invalid", m._fmt_date_fr("not-a-date"), "not-a-date")
    except Exception as e:
        failed += 1
        errors.append(f"case9.import_or_call exception: {e}")
        print(f"FAIL [case9.import_or_call] {e}")

    # ---------- CLEANUP ----------
    print("\n--- Cleanup ---")
    client_to_delete = None
    try:
        rc = requests.post(f"{API}/clients-db/match",
                           json={"name": "Test Client", "email": NOTIFY_EMAIL,
                                 "phone": "5141234567"}, timeout=30)
        if rc.status_code == 200:
            jj = rc.json()
            if jj.get("matched") and jj.get("client"):
                client_to_delete = jj["client"].get("id")
                print(f"Found auto-linked client: {client_to_delete}")
    except Exception as e:
        print(f"clients-db/match error: {e}")

    for aid in created_ids:
        try:
            rd = requests.delete(f"{API}/appointments/{aid}/permanent", timeout=30)
            print(f"DELETE permanent {aid} -> {rd.status_code}")
        except Exception as e:
            print(f"delete error {aid}: {e}")

    # Try to find a separate client for the second (empty-email) appointment
    try:
        rc2 = requests.post(f"{API}/clients-db/match",
                            json={"name": "Test Client", "email": "",
                                  "phone": "5141234567"}, timeout=30)
        if rc2.status_code == 200:
            jj2 = rc2.json()
            if jj2.get("matched") and jj2.get("client"):
                cid2 = jj2["client"].get("id")
                if cid2 and cid2 != client_to_delete:
                    try:
                        rcd2 = requests.delete(f"{API}/clients-db/{cid2}", timeout=30)
                        print(f"DELETE client (2) {cid2} -> {rcd2.status_code}")
                    except Exception as e:
                        print(f"client2 delete error: {e}")
    except Exception:
        pass

    if client_to_delete:
        try:
            rcd = requests.delete(f"{API}/clients-db/{client_to_delete}", timeout=30)
            print(f"DELETE client {client_to_delete} -> {rcd.status_code}")
        except Exception as e:
            print(f"client delete error: {e}")

    # Final confirmation
    try:
        rl = requests.get(f"{API}/appointments?include_archived=true", timeout=30)
        if rl.status_code == 200:
            ids_present = {a.get("id") for a in rl.json()}
            for aid in created_ids:
                assert_true(f"cleanup.absent[{aid}]", aid not in ids_present,
                            "appt id absent from list")
    except Exception as e:
        print(f"final list error: {e}")

    # ---------- SUMMARY ----------
    print(f"\n=========================")
    print(f"PASSED: {passed}")
    print(f"FAILED: {failed}")
    print(f"=========================")
    if errors:
        print("\nFailures:")
        for e in errors:
            print(f"  - {e}")
    return failed == 0


if __name__ == "__main__":
    ok = main()
    sys.exit(0 if ok else 1)
