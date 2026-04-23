"""
Backend tests — STRICTLY for receipt deletion feature.
Targets:
  1) DELETE /api/expenses/{id}/receipt?type=photo|pdf|all
  2) PUT /api/expenses/{id} — accept null for receipt_photo/receipt_pdf (and description/vendor)
"""
import os
import sys
import base64
import io
from datetime import date
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://booking-hub-406.preview.emergentagent.com"
API = f"{BASE.rstrip('/')}/api"

passed = 0
failed = 0
failures = []
created_ids = []


def check(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        failures.append(label)
        print(f"  ✗ {label}")


# --- helpers to fabricate small valid base64 photo / PDF strings ---

def _png_base64_1x1():
    # 1x1 red PNG
    from PIL import Image
    img = Image.new("RGB", (1, 1), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _pdf_base64_minimal():
    # Reuse server's images-to-pdf to get a tiny real PDF
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": [_png_base64_1x1()]}, timeout=30)
    r.raise_for_status()
    return r.json()["pdf_base64"]


def create_expense(photo=None, pdf=None, amount=42.0, category="gas",
                   dt=None, vendor="Test Vendor", description="original"):
    body = {
        "amount": amount,
        "category": category,
        "date": dt or date.today().isoformat(),
        "description": description,
        "vendor": vendor,
    }
    if photo is not None:
        body["receipt_photo"] = photo
    if pdf is not None:
        body["receipt_pdf"] = pdf
    r = requests.post(f"{API}/expenses", json=body, timeout=30)
    assert r.status_code == 200, f"create expense failed: {r.status_code} {r.text}"
    j = r.json()
    created_ids.append(j["id"])
    return j


def get_expense_from_list(eid):
    r = requests.get(f"{API}/expenses", timeout=30)
    assert r.status_code == 200
    for it in r.json():
        if it.get("id") == eid:
            return it
    return None


def get_expense_direct(eid):
    r = requests.get(f"{API}/expenses/{eid}", timeout=30)
    if r.status_code != 200:
        return None
    return r.json()


def main():
    print(f"Backend: {API}\n")

    # Pre-existing expense count (to compare after cleanup)
    r0 = requests.get(f"{API}/expenses", timeout=30)
    pre_existing_ids = {it["id"] for it in r0.json()} if r0.status_code == 200 else set()
    print(f"Pre-existing expense count: {len(pre_existing_ids)}\n")

    # Build reusable base64 assets (photo + pdf)
    PHOTO = _png_base64_1x1()
    PDF = _pdf_base64_minimal()

    # =========================================================================
    # A. DELETE /receipt?type=photo
    # =========================================================================
    print("A. DELETE /receipt?type=photo")
    e = create_expense(photo=PHOTO, pdf=PDF)
    eid = e["id"]
    check(e.get("receipt_photo") is not None and e.get("receipt_pdf") is not None,
          "A.setup: expense has both receipt_photo and receipt_pdf")

    r = requests.delete(f"{API}/expenses/{eid}/receipt", params={"type": "photo"}, timeout=30)
    check(r.status_code == 200, f"A.status 200 (got {r.status_code})")
    body = r.json() if r.status_code == 200 else {}
    check(body.get("deleted") == "photo", f"A.response deleted=='photo' (got {body.get('deleted')!r})")
    exp = body.get("expense", {})
    check(exp.get("receipt_photo") is None, f"A.response expense.receipt_photo is None (got {type(exp.get('receipt_photo')).__name__})")
    check(exp.get("receipt_pdf") is not None, "A.response expense.receipt_pdf still has value")

    # Persistence via GET /{id} and list
    fetched = get_expense_direct(eid)
    check(fetched is not None and fetched.get("receipt_photo") is None, "A.persist (GET /{id}): receipt_photo is None")
    check(fetched is not None and fetched.get("receipt_pdf") is not None, "A.persist (GET /{id}): receipt_pdf still present")
    in_list = get_expense_from_list(eid)
    check(in_list is not None and in_list.get("receipt_photo") is None, "A.persist (GET list): receipt_photo is None")
    check(in_list is not None and in_list.get("receipt_pdf") is not None, "A.persist (GET list): receipt_pdf still present")

    # =========================================================================
    # B. DELETE /receipt?type=pdf
    # =========================================================================
    print("\nB. DELETE /receipt?type=pdf")
    e = create_expense(photo=PHOTO, pdf=PDF)
    eid = e["id"]
    r = requests.delete(f"{API}/expenses/{eid}/receipt", params={"type": "pdf"}, timeout=30)
    check(r.status_code == 200, f"B.status 200 (got {r.status_code})")
    body = r.json() if r.status_code == 200 else {}
    check(body.get("deleted") == "pdf", "B.response deleted=='pdf'")
    exp = body.get("expense", {})
    check(exp.get("receipt_pdf") is None, "B.response expense.receipt_pdf is None")
    check(exp.get("receipt_photo") is not None, "B.response expense.receipt_photo still present")
    fetched = get_expense_direct(eid)
    check(fetched.get("receipt_pdf") is None, "B.persist: receipt_pdf is None")
    check(fetched.get("receipt_photo") is not None, "B.persist: receipt_photo still present")

    # =========================================================================
    # C. DELETE /receipt?type=all (default)
    # =========================================================================
    print("\nC. DELETE /receipt?type=all")
    e = create_expense(photo=PHOTO, pdf=PDF)
    eid = e["id"]
    r = requests.delete(f"{API}/expenses/{eid}/receipt", params={"type": "all"}, timeout=30)
    check(r.status_code == 200, f"C.status 200 (got {r.status_code})")
    body = r.json() if r.status_code == 200 else {}
    check(body.get("deleted") == "all", "C.response deleted=='all'")
    exp = body.get("expense", {})
    check(exp.get("receipt_photo") is None and exp.get("receipt_pdf") is None,
          "C.response both receipt_photo and receipt_pdf are None")
    fetched = get_expense_direct(eid)
    check(fetched.get("receipt_photo") is None and fetched.get("receipt_pdf") is None,
          "C.persist: both receipt fields None after re-GET")

    # Also test default (no type param) — should behave as 'all'
    e2 = create_expense(photo=PHOTO, pdf=PDF)
    eid2 = e2["id"]
    r = requests.delete(f"{API}/expenses/{eid2}/receipt", timeout=30)
    check(r.status_code == 200, "C.default(no-param) status 200")
    body = r.json()
    check(body.get("deleted") == "all", "C.default: deleted=='all' when no type param")
    check(body.get("expense", {}).get("receipt_photo") is None and body.get("expense", {}).get("receipt_pdf") is None,
          "C.default: both receipt fields None")

    # =========================================================================
    # D. DELETE /receipt with invalid type
    # =========================================================================
    print("\nD. DELETE /receipt?type=invalid")
    e = create_expense(photo=PHOTO, pdf=PDF)
    eid = e["id"]
    r = requests.delete(f"{API}/expenses/{eid}/receipt", params={"type": "invalid"}, timeout=30)
    check(r.status_code == 400, f"D.status 400 (got {r.status_code})")
    detail = r.json().get("detail", "") if r.status_code == 400 else ""
    check("Type invalide" in detail, f"D.detail contains 'Type invalide' (got {detail!r})")

    # =========================================================================
    # E. DELETE /receipt on non-existent expense
    # =========================================================================
    print("\nE. DELETE /receipt on non-existent expense")
    r = requests.delete(f"{API}/expenses/nonexistent-xyz-uuid-1234/receipt",
                        params={"type": "photo"}, timeout=30)
    check(r.status_code == 404, f"E.status 404 (got {r.status_code})")
    detail = r.json().get("detail", "") if r.status_code == 404 else ""
    check("introuvable" in detail, f"E.detail contains 'introuvable' (got {detail!r})")

    # =========================================================================
    # F. PUT with explicit null on receipt_photo (bug fix)
    # =========================================================================
    print("\nF. PUT {receipt_photo: null}")
    e = create_expense(photo=PHOTO, pdf=None)
    eid = e["id"]
    check(e.get("receipt_photo") is not None, "F.setup: receipt_photo present after create")
    r = requests.put(f"{API}/expenses/{eid}", json={"receipt_photo": None}, timeout=30)
    check(r.status_code == 200, f"F.PUT status 200 (got {r.status_code}: {r.text[:200]})")
    if r.status_code == 200:
        j = r.json()
        check(j.get("receipt_photo") is None, f"F.PUT response receipt_photo is None (got {type(j.get('receipt_photo')).__name__})")
    fetched = get_expense_direct(eid)
    check(fetched and fetched.get("receipt_photo") is None, "F.persist: receipt_photo is None after GET")

    # =========================================================================
    # G. PUT with explicit null on receipt_pdf
    # =========================================================================
    print("\nG. PUT {receipt_pdf: null}")
    e = create_expense(photo=None, pdf=PDF)
    eid = e["id"]
    check(e.get("receipt_pdf") is not None, "G.setup: receipt_pdf present after create")
    r = requests.put(f"{API}/expenses/{eid}", json={"receipt_pdf": None}, timeout=30)
    check(r.status_code == 200, f"G.PUT status 200 (got {r.status_code})")
    if r.status_code == 200:
        j = r.json()
        check(j.get("receipt_pdf") is None, "G.PUT response receipt_pdf is None")
    fetched = get_expense_direct(eid)
    check(fetched and fetched.get("receipt_pdf") is None, "G.persist: receipt_pdf is None after GET")

    # =========================================================================
    # H. PUT with null on amount/category/date — must NOT wipe these
    # =========================================================================
    print("\nH. PUT {amount: null, vendor: 'New Vendor'} — amount should stay 42.0")
    e = create_expense(amount=42.0, vendor="Original Vendor")
    eid = e["id"]
    r = requests.put(f"{API}/expenses/{eid}",
                     json={"amount": None, "vendor": "New Vendor"}, timeout=30)
    check(r.status_code == 200, f"H.status 200 (got {r.status_code}: {r.text[:200]})")
    if r.status_code == 200:
        j = r.json()
        check(abs(j.get("amount", -1) - 42.0) < 1e-9, f"H.amount still 42.0 (got {j.get('amount')})")
        check(j.get("vendor") == "New Vendor", f"H.vendor updated to 'New Vendor' (got {j.get('vendor')!r})")
    fetched = get_expense_direct(eid)
    check(fetched and abs(fetched.get("amount", -1) - 42.0) < 1e-9, "H.persist: amount STILL 42.0")
    check(fetched and fetched.get("vendor") == "New Vendor", "H.persist: vendor IS 'New Vendor'")

    # Additionally verify that PUT {category: null, date: null} doesn't wipe them
    e2 = create_expense(amount=99.0, category="gas", dt="2026-01-15", vendor="V2")
    eid2 = e2["id"]
    r = requests.put(f"{API}/expenses/{eid2}",
                     json={"category": None, "date": None, "amount": 123.45}, timeout=30)
    check(r.status_code == 200, "H2.status 200 with null on category/date + amount update")
    if r.status_code == 200:
        j = r.json()
        check(j.get("category") == "gas", f"H2.category unchanged 'gas' (got {j.get('category')!r})")
        check(j.get("date") == "2026-01-15", f"H2.date unchanged '2026-01-15' (got {j.get('date')!r})")
        check(abs(j.get("amount", -1) - 123.45) < 1e-9, f"H2.amount updated to 123.45 (got {j.get('amount')})")

    # =========================================================================
    # I. PUT with null on description/vendor — should clear text fields
    # =========================================================================
    print("\nI. PUT {description: null} — should clear description")
    e = create_expense(description="original")
    eid = e["id"]
    check(e.get("description") == "original", "I.setup: description=='original'")
    r = requests.put(f"{API}/expenses/{eid}", json={"description": None}, timeout=30)
    check(r.status_code == 200, f"I.status 200 (got {r.status_code}: {r.text[:200]})")
    if r.status_code == 200:
        j = r.json()
        # Accept either None or "" as long as 'original' is gone
        desc = j.get("description")
        check(desc in (None, ""), f"I.description cleared (got {desc!r})")
    fetched = get_expense_direct(eid)
    desc = fetched.get("description") if fetched else "???"
    check(desc in (None, ""), f"I.persist: description cleared (got {desc!r})")

    # =========================================================================
    # J. Verify expense itself NOT deleted after DELETE /receipt
    # =========================================================================
    print("\nJ. Expense NOT deleted after DELETE /receipt?type=all")
    e = create_expense(photo=PHOTO, pdf=PDF)
    eid = e["id"]
    # Before: in list
    in_list_before = get_expense_from_list(eid)
    check(in_list_before is not None, "J.before: expense in GET /expenses list")
    r = requests.delete(f"{API}/expenses/{eid}/receipt", params={"type": "all"}, timeout=30)
    check(r.status_code == 200, "J.delete receipts 200")
    # After: still in list
    in_list_after = get_expense_from_list(eid)
    check(in_list_after is not None, "J.after: expense STILL in GET /expenses list")
    check(in_list_after and in_list_after.get("receipt_photo") is None and in_list_after.get("receipt_pdf") is None,
          "J.after: expense present but both receipts None")
    # Direct GET also still works
    direct = get_expense_direct(eid)
    check(direct is not None, "J.after: GET /{id} still returns 200")

    # =========================================================================
    # CLEANUP
    # =========================================================================
    print("\n--- CLEANUP ---")
    for eid in created_ids:
        try:
            requests.delete(f"{API}/expenses/{eid}", timeout=15)
        except Exception:
            pass

    # Final GET /expenses state
    rf = requests.get(f"{API}/expenses", timeout=30)
    final_items = rf.json() if rf.status_code == 200 else []
    remaining_test_ids = [it["id"] for it in final_items if it["id"] in created_ids]
    check(len(remaining_test_ids) == 0,
          f"Cleanup: no test expenses remain (remaining={remaining_test_ids})")

    post_cleanup_ids = {it["id"] for it in final_items}
    leaked = post_cleanup_ids - pre_existing_ids
    check(len(leaked) == 0, f"Cleanup: no leaked test docs left (leaked={leaked})")

    print(f"\nFinal GET /api/expenses count: {len(final_items)} "
          f"(pre-existing was {len(pre_existing_ids)})")

    # =========================================================================
    # REPORT
    # =========================================================================
    total = passed + failed
    print(f"\n{'='*60}")
    print(f"RESULTS: {passed}/{total} assertions passed")
    if failures:
        print(f"\nFAILURES ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
    print(f"{'='*60}")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
