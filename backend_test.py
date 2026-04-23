"""Backend tests for POST /api/expenses/ocr-receipt.

Scope is STRICTLY limited to the new OCR endpoint backed by Gemini 2.5 Flash via
emergentintegrations + EMERGENT_LLM_KEY.
"""

import base64
import io
import os
import re
import sys
import time
import traceback
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

# ----- Config --------------------------------------------------------------

FRONT_ENV = Path("/app/frontend/.env")
BASE_URL = None
for line in FRONT_ENV.read_text().splitlines():
    if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
        BASE_URL = line.split("=", 1)[1].strip().strip('"')
        break

if not BASE_URL:
    print("❌ EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)

API = BASE_URL.rstrip("/") + "/api"
OCR_URL = f"{API}/expenses/ocr-receipt"
EXPENSES_URL = f"{API}/expenses"

LLM_TIMEOUT = 60  # seconds per LLM call

print(f"BASE_URL = {BASE_URL}")
print(f"OCR_URL  = {OCR_URL}")
print()

# ----- Assertion helper ----------------------------------------------------

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(cond: bool, label: str, details: str = ""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✅ {label}")
    else:
        FAIL += 1
        extra = f" — {details}" if details else ""
        msg = f"❌ {label}{extra}"
        FAILURES.append(msg)
        print(f"  {msg}")


# ----- Font discovery ------------------------------------------------------

def _get_font(size: int):
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _img_to_b64_jpeg(img: Image.Image, quality: int = 92) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ----- Synthetic receipt generators ----------------------------------------

def make_canadian_tire_receipt() -> Image.Image:
    W, H = 700, 1000
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)
    big = _get_font(32)
    med = _get_font(22)
    sm = _get_font(18)

    y = 40
    d.text((W // 2 - 120, y), "CANADIAN TIRE", font=big, fill="black"); y += 50
    d.text((W // 2 - 160, y), "1234 Rue Principale", font=sm, fill="black"); y += 26
    d.text((W // 2 - 150, y), "Montréal, QC H2X 1Y4", font=sm, fill="black"); y += 26
    d.text((W // 2 - 100, y), "Tél: 514-555-1234", font=sm, fill="black"); y += 40
    d.line([(40, y), (W - 40, y)], fill="black", width=2); y += 16

    d.text((40, y), "Date: 2026-04-23    Heure: 14:32", font=sm, fill="black"); y += 26
    d.text((40, y), "No. Transaction: 00192847", font=sm, fill="black"); y += 40

    items = [
        ("Vis #8 x 100",          "12.99"),
        ("Boulons acier 1/4\"",   "18.50"),
        ("Perceuse DeWalt 20V",   "149.99"),
        ("Ruban mesureur 8m",       "8.99"),
    ]
    for name, price in items:
        d.text((40, y), name, font=med, fill="black")
        d.text((W - 140, y), f"${price}", font=med, fill="black")
        y += 34

    y += 10
    d.line([(40, y), (W - 40, y)], fill="black", width=1); y += 16
    d.text((40, y), "Sous-total",    font=med, fill="black"); d.text((W - 140, y), "$190.47", font=med, fill="black"); y += 30
    d.text((40, y), "TPS (5%)",      font=med, fill="black"); d.text((W - 140, y), "$9.52",  font=med, fill="black"); y += 30
    d.text((40, y), "TVQ (9.975%)",  font=med, fill="black"); d.text((W - 140, y), "$19.01", font=med, fill="black"); y += 30
    d.line([(40, y), (W - 40, y)], fill="black", width=2); y += 18
    d.text((40, y), "TOTAL", font=big, fill="black")
    d.text((W - 180, y), "$191.16", font=big, fill="black"); y += 60

    d.text((40, y), "Paiement: VISA xxxx-1234", font=sm, fill="black"); y += 26
    d.text((40, y), "Merci de votre visite!", font=sm, fill="black")
    return img


def make_multi_page_receipt(total_value: str = "777.77") -> tuple[Image.Image, Image.Image]:
    W, H = 700, 900
    big = _get_font(32); med = _get_font(22); sm = _get_font(18)

    # Page 1 — header + line items
    p1 = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(p1)
    y = 40
    d.text((W // 2 - 100, y), "HOME DEPOT", font=big, fill="black"); y += 50
    d.text((W // 2 - 140, y), "5678 Boul. Laurier", font=sm, fill="black"); y += 26
    d.text((W // 2 - 140, y), "Québec, QC G1V 0A7", font=sm, fill="black"); y += 40
    d.text((40, y), "Date: 2026-03-15    Page 1/2", font=sm, fill="black"); y += 26
    d.text((40, y), "Facture: #HD-998877", font=sm, fill="black"); y += 40
    d.line([(40, y), (W - 40, y)], fill="black", width=2); y += 16
    items = [
        ("Peinture acrylique 4L",  "54.99"),
        ("Rouleaux 12 po (x2)",    "24.50"),
        ("Bac à peinture",         "9.99"),
        ("Toile de protection",    "18.75"),
        ("Ruban peintre 3M",       "14.25"),
    ]
    for name, price in items:
        d.text((40, y), name, font=med, fill="black")
        d.text((W - 140, y), f"${price}", font=med, fill="black")
        y += 34
    d.text((40, y + 20), "— suite page 2 —", font=sm, fill="black")

    # Page 2 — totals
    p2 = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(p2)
    y = 40
    d.text((W // 2 - 100, y), "HOME DEPOT", font=big, fill="black"); y += 40
    d.text((40, y), "Facture: #HD-998877     Page 2/2", font=sm, fill="black"); y += 50
    d.line([(40, y), (W - 40, y)], fill="black", width=2); y += 16
    d.text((40, y), "Sous-total",   font=med, fill="black"); d.text((W - 180, y), "$646.37", font=med, fill="black"); y += 34
    d.text((40, y), "TPS (5%)",     font=med, fill="black"); d.text((W - 180, y), "$32.32",  font=med, fill="black"); y += 34
    d.text((40, y), "TVQ (9.975%)", font=med, fill="black"); d.text((W - 180, y), "$99.08",  font=med, fill="black"); y += 34
    d.line([(40, y), (W - 40, y)], fill="black", width=2); y += 18
    d.text((40, y), "TOTAL", font=big, fill="black")
    d.text((W - 220, y), f"${total_value}", font=big, fill="black"); y += 60
    d.text((40, y), "Paiement: MasterCard", font=sm, fill="black"); y += 26
    d.text((40, y), "Merci!", font=sm, fill="black")
    return p1, p2


def make_red_square() -> Image.Image:
    img = Image.new("RGB", (400, 400), (220, 30, 30))
    return img


# ----- Tests ---------------------------------------------------------------

def test_1_happy_path():
    print("\n=== TEST 1: Happy path — synthetic Canadian Tire receipt ===")
    img = make_canadian_tire_receipt()
    b64 = _img_to_b64_jpeg(img)
    t0 = time.time()
    r = requests.post(OCR_URL, json={"images": [b64]}, timeout=LLM_TIMEOUT)
    dt = time.time() - t0
    print(f"  HTTP {r.status_code}  ({dt:.1f}s)")
    check(r.status_code == 200, "HTTP 200", f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return None

    data = r.json()
    print(f"  Response keys: {list(data.keys())}")
    print(f"  Extracted: amount={data.get('amount')!r}, vendor={data.get('vendor')!r}, "
          f"date={data.get('date')!r}, confidence={data.get('confidence')!r}")
    print(f"  Description: {data.get('description')!r}")
    print(f"  raw_text (len={len(data.get('raw_text') or '')}): "
          f"{(data.get('raw_text') or '')[:150]!r}...")

    for k in ("amount", "vendor", "date", "description", "raw_text", "confidence"):
        check(k in data, f"response has key '{k}'")

    amt = data.get("amount")
    check(isinstance(amt, (int, float)) and amt is not None and amt > 0,
          f"amount is number > 0 (got {amt!r}; expected ~191.16)")

    vendor = data.get("vendor") or ""
    check(isinstance(vendor, str) and "canadian" in vendor.lower(),
          f"vendor contains 'Canadian' case-insensitive (got {vendor!r})")

    dt_str = data.get("date") or ""
    check(isinstance(dt_str, str) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", dt_str)),
          f"date matches YYYY-MM-DD (got {dt_str!r})")

    raw = data.get("raw_text") or ""
    check(isinstance(raw, str) and len(raw) > 50,
          f"raw_text len > 50 (got len={len(raw)})")

    conf = data.get("confidence")
    check(isinstance(conf, (int, float)) and 0.0 <= float(conf) <= 1.0,
          f"confidence in [0,1] (got {conf!r})")

    return data


def test_2_multi_page():
    print("\n=== TEST 2: Multi-page receipt (2 images, total = 777.77) ===")
    p1, p2 = make_multi_page_receipt("777.77")
    b64_1 = _img_to_b64_jpeg(p1)
    b64_2 = _img_to_b64_jpeg(p2)
    t0 = time.time()
    r = requests.post(OCR_URL, json={"images": [b64_1, b64_2]}, timeout=LLM_TIMEOUT)
    dt = time.time() - t0
    print(f"  HTTP {r.status_code}  ({dt:.1f}s)")
    check(r.status_code == 200, "HTTP 200 (multi-page)",
          f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return

    data = r.json()
    print(f"  amount={data.get('amount')!r}  vendor={data.get('vendor')!r}  "
          f"date={data.get('date')!r}  conf={data.get('confidence')!r}")

    for k in ("amount", "vendor", "date", "description", "raw_text", "confidence"):
        check(k in data, f"multi-page response has key '{k}'")

    amt = data.get("amount")
    # Allow small variance but expect near 777.77
    check(amt is not None and abs(float(amt) - 777.77) < 1.0,
          f"multi-page amount ≈ 777.77 (got {amt!r})")


def test_3_data_url_prefix():
    print("\n=== TEST 3: Data URL prefix handling ===")
    img = make_canadian_tire_receipt()
    raw = _img_to_b64_jpeg(img)
    with_prefix = "data:image/jpeg;base64," + raw

    # data URL prefix
    t0 = time.time()
    r1 = requests.post(OCR_URL, json={"images": [with_prefix]}, timeout=LLM_TIMEOUT)
    print(f"  with-prefix: HTTP {r1.status_code}  ({time.time() - t0:.1f}s)")
    check(r1.status_code == 200, "data URL prefix → 200",
          f"got {r1.status_code} body={r1.text[:200]}")

    # raw base64
    t0 = time.time()
    r2 = requests.post(OCR_URL, json={"images": [raw]}, timeout=LLM_TIMEOUT)
    print(f"  raw-b64   : HTTP {r2.status_code}  ({time.time() - t0:.1f}s)")
    check(r2.status_code == 200, "raw base64 → 200",
          f"got {r2.status_code} body={r2.text[:200]}")


def test_4_empty_images():
    print("\n=== TEST 4: Empty images list → 400 ===")
    r = requests.post(OCR_URL, json={"images": []}, timeout=30)
    print(f"  HTTP {r.status_code}  body={r.text[:200]}")
    check(r.status_code == 400, "HTTP 400 on empty images", f"got {r.status_code}")
    if r.status_code == 400:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        check("Aucune image" in detail,
              f"detail contains 'Aucune image' (got {detail!r})")


def test_5_too_many_images():
    print("\n=== TEST 5: 11 images → 400 ===")
    tiny = Image.new("RGB", (20, 20), "white")
    b64 = _img_to_b64_jpeg(tiny)
    r = requests.post(OCR_URL, json={"images": [b64] * 11}, timeout=30)
    print(f"  HTTP {r.status_code}  body={r.text[:200]}")
    check(r.status_code == 400, "HTTP 400 on 11 images", f"got {r.status_code}")
    if r.status_code == 400:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text
        check("Maximum 10" in detail,
              f"detail contains 'Maximum 10' (got {detail!r})")


def test_6_non_receipt_image():
    print("\n=== TEST 6: Non-receipt image (red square) ===")
    img = make_red_square()
    b64 = _img_to_b64_jpeg(img)
    t0 = time.time()
    r = requests.post(OCR_URL, json={"images": [b64]}, timeout=LLM_TIMEOUT)
    print(f"  HTTP {r.status_code}  ({time.time() - t0:.1f}s)")
    check(r.status_code == 200, "non-receipt → 200 (no crash)",
          f"got {r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return

    data = r.json()
    print(f"  amount={data.get('amount')!r}  vendor={data.get('vendor')!r}  "
          f"conf={data.get('confidence')!r}")

    conf_val = data.get("confidence")
    try:
        conf_float = float(conf_val) if conf_val is not None else 1.0
    except Exception:
        conf_float = 1.0
    low_conf = conf_float < 0.7
    null_fields = (data.get("amount") is None) or (data.get("vendor") is None)
    check(low_conf or null_fields,
          f"confidence<0.7 OR amount/vendor null (got conf={conf_val!r}, "
          f"amount={data.get('amount')!r}, vendor={data.get('vendor')!r})")


def test_7_invalid_base64():
    print("\n=== TEST 7: Invalid base64 input ===")
    r = requests.post(OCR_URL, json={"images": ["not-valid-base64-!!"]},
                      timeout=LLM_TIMEOUT)
    print(f"  HTTP {r.status_code}  body={r.text[:300]}")
    # Must not be 200 success and must not crash server beyond a 4xx/5xx with detail
    check(r.status_code in (400, 422, 500, 502),
          f"invalid b64 → 4xx/5xx (got {r.status_code})")
    try:
        body = r.json()
        has_detail = ("detail" in body) or ("parse_error" in body)
    except Exception:
        has_detail = False
    check(has_detail, "response body has error detail key")


def test_8_server_still_healthy():
    print("\n=== TEST 8: Server still healthy — GET /api/expenses ===")
    r = requests.get(EXPENSES_URL, timeout=15)
    print(f"  HTTP {r.status_code}")
    check(r.status_code == 200, "GET /api/expenses → 200",
          f"got {r.status_code} body={r.text[:200]}")


# ----- Runner --------------------------------------------------------------

if __name__ == "__main__":
    extracted_for_test1 = None
    try:
        extracted_for_test1 = test_1_happy_path()
    except Exception:
        traceback.print_exc()
        FAILURES.append(f"Test 1 threw: {sys.exc_info()[1]}")
        FAIL += 1

    for fn in (test_2_multi_page, test_3_data_url_prefix, test_4_empty_images,
               test_5_too_many_images, test_6_non_receipt_image,
               test_7_invalid_base64, test_8_server_still_healthy):
        try:
            fn()
        except Exception:
            traceback.print_exc()
            FAILURES.append(f"{fn.__name__} threw: {sys.exc_info()[1]}")
            FAIL += 1

    print("\n" + "=" * 60)
    print(f"RESULT: {PASS} passed, {FAIL} failed (of {PASS + FAIL} assertions)")
    if FAILURES:
        print("\nFailures:")
        for f in FAILURES:
            print(f"  - {f}")
    if extracted_for_test1:
        print("\nTest 1 LLM extraction (quality check):")
        print(f"  amount      = {extracted_for_test1.get('amount')!r}  (expected ~191.16)")
        print(f"  vendor      = {extracted_for_test1.get('vendor')!r}  (expected contains 'Canadian')")
        print(f"  date        = {extracted_for_test1.get('date')!r}    (expected '2026-04-23')")
        print(f"  confidence  = {extracted_for_test1.get('confidence')!r}")
        print(f"  description = {extracted_for_test1.get('description')!r}")
    sys.exit(0 if FAIL == 0 else 1)
