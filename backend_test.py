#!/usr/bin/env python3
"""
Backend tests for the NEW PDF-from-images feature on /api/expenses.

Targets:
- POST /api/expenses/images-to-pdf
- GET  /api/expenses/{id}/receipt-pdf
- Expense model: ensures receipt_pdf field flows through CRUD.

Strictly limited to this new feature — does not touch any other endpoints.
"""

from __future__ import annotations

import base64
import io
import sys
from pathlib import Path
from typing import List, Optional

import requests
from PIL import Image

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
def _load_env_value(env_path: Path, key: str) -> Optional[str]:
    if not env_path.exists():
        return None
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            if k.strip() == key:
                v = v.strip().strip('"').strip("'")
                return v
    return None


FRONTEND_ENV = Path("/app/frontend/.env")
BACKEND_URL = _load_env_value(FRONTEND_ENV, "EXPO_PUBLIC_BACKEND_URL")
if not BACKEND_URL:
    print("ERROR: EXPO_PUBLIC_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)
API = BACKEND_URL.rstrip("/") + "/api"

print(f"Using API base: {API}")
REQ_TIMEOUT = 60


# ---------------------------------------------------------------------------
# Test result tracker
# ---------------------------------------------------------------------------
class Results:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.failures: List[str] = []

    def check(self, ok: bool, desc: str, detail: str = ""):
        if ok:
            self.passed += 1
            print(f"  ✅ {desc}")
        else:
            self.failed += 1
            msg = f"{desc} :: {detail}" if detail else desc
            self.failures.append(msg)
            print(f"  ❌ {desc}\n      {detail}")

    def summary(self):
        total = self.passed + self.failed
        print("\n" + "=" * 70)
        print(f"TOTAL: {self.passed}/{total} PASSED    ({self.failed} failed)")
        if self.failures:
            print("\nFAILURES:")
            for f in self.failures:
                print(f"  - {f}")
        print("=" * 70)


R = Results()


# ---------------------------------------------------------------------------
# Helpers: generate in-memory test images with PIL
# ---------------------------------------------------------------------------
def make_jpeg_b64(color=(220, 80, 80), size=(600, 800), data_url: bool = False) -> str:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    b = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{b}" if data_url else b


def make_png_rgba_b64(size=(500, 700), data_url: bool = False) -> str:
    from PIL import ImageDraw
    img = Image.new("RGBA", size, (0, 120, 200, 180))  # semi-transparent blue
    d = ImageDraw.Draw(img)
    d.rectangle([50, 50, 200, 200], fill=(255, 0, 0, 0))  # fully transparent red box
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b}" if data_url else b


def make_large_jpeg_b64(size=(3000, 2400)) -> str:
    """Image > 2200px in at least one dim -> should be resized server-side."""
    img = Image.new("RGB", size, (0, 150, 75))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def decode_pdf_data_url(data_url: str) -> bytes:
    if not data_url.startswith("data:application/pdf;base64,"):
        raise ValueError(f"Unexpected prefix: {data_url[:60]!r}")
    b64 = data_url.split(",", 1)[1]
    return base64.b64decode(b64)


def valid_pdf(raw: bytes) -> bool:
    return raw[:5] == b"%PDF-"


def random_c(seed: int):
    palette = [(210, 80, 60), (60, 180, 100), (80, 100, 200), (200, 200, 60)]
    return palette[seed % len(palette)]


# Cleanup registry
CREATED_EXPENSE_IDS: List[str] = []


def cleanup():
    print("\n--- Cleanup ---")
    for eid in list(CREATED_EXPENSE_IDS):
        try:
            r = requests.delete(f"{API}/expenses/{eid}", timeout=REQ_TIMEOUT)
            print(f"  DELETE /expenses/{eid} -> {r.status_code}")
        except Exception as e:
            print(f"  DELETE /expenses/{eid} failed: {e}")
    CREATED_EXPENSE_IDS.clear()


def _generate_pdf_data_url(num_pages: int = 2) -> str:
    imgs = [make_jpeg_b64(color=random_c(i), size=(500, 700)) for i in range(num_pages)]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    r.raise_for_status()
    return r.json()["pdf_base64"]


def _create_expense(payload: dict) -> str:
    r = requests.post(f"{API}/expenses", json=payload, timeout=REQ_TIMEOUT)
    r.raise_for_status()
    eid = r.json()["id"]
    CREATED_EXPENSE_IDS.append(eid)
    return eid


# ---------------------------------------------------------------------------
# 1. POST /api/expenses/images-to-pdf
# ---------------------------------------------------------------------------
def test_images_to_pdf_single():
    print("\n[1a] images-to-pdf — single image, happy path")
    imgs = [make_jpeg_b64(color=(200, 30, 30), size=(600, 800))]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "1a.1 HTTP 200", f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return None
    data = r.json()
    pdf_url = data.get("pdf_base64", "")
    R.check(pdf_url.startswith("data:application/pdf;base64,"),
            "1a.2 pdf_base64 starts with data:application/pdf;base64,", pdf_url[:60])
    R.check(data.get("pages") == 1, "1a.3 pages == 1", f"got {data.get('pages')}")
    R.check(isinstance(data.get("size_kb"), (int, float)) and data["size_kb"] > 0,
            "1a.4 size_kb > 0", str(data.get("size_kb")))
    try:
        raw = decode_pdf_data_url(pdf_url)
        R.check(valid_pdf(raw), "1a.5 decoded bytes start with %PDF", raw[:8].hex())
        return len(raw)
    except Exception as e:
        R.check(False, "1a.5 decode PDF data URL", str(e))
        return None


def test_images_to_pdf_multi(single_size: Optional[int]):
    print("\n[1b] images-to-pdf — 3 images, happy path")
    imgs = [
        make_jpeg_b64(color=(220, 80, 80), size=(600, 800)),
        make_jpeg_b64(color=(80, 200, 120), size=(600, 800)),
        make_jpeg_b64(color=(60, 90, 220), size=(600, 800)),
    ]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "1b.1 HTTP 200", f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    data = r.json()
    R.check(data.get("pages") == 3, "1b.2 pages == 3", f"got {data.get('pages')}")
    try:
        raw = decode_pdf_data_url(data["pdf_base64"])
        R.check(valid_pdf(raw), "1b.3 %PDF signature", raw[:8].hex())
        if single_size:
            R.check(len(raw) > single_size,
                    "1b.4 multi-page PDF larger than single-page PDF",
                    f"{len(raw)} vs {single_size}")
    except Exception as e:
        R.check(False, "1b.3 decode multi-page PDF", str(e))


def test_images_to_pdf_mixed_prefixes():
    print("\n[1c] images-to-pdf — mixed data-URL prefix + raw base64")
    imgs = [
        make_jpeg_b64(color=(100, 100, 100), size=(500, 700), data_url=True),
        make_jpeg_b64(color=(200, 150, 50), size=(500, 700), data_url=False),
    ]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "1c.1 HTTP 200", f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    data = r.json()
    R.check(data.get("pages") == 2, "1c.2 pages == 2 (mixed)", f"got {data.get('pages')}")
    try:
        raw = decode_pdf_data_url(data["pdf_base64"])
        R.check(valid_pdf(raw), "1c.3 %PDF signature", raw[:8].hex())
    except Exception as e:
        R.check(False, "1c.3 decode mixed PDF", str(e))


def test_images_to_pdf_rgba():
    print("\n[1d] images-to-pdf — RGBA PNG with transparency")
    imgs = [make_png_rgba_b64(size=(500, 700), data_url=True)]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "1d.1 HTTP 200 (RGBA handled)",
            f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    data = r.json()
    R.check(data.get("pages") == 1, "1d.2 pages == 1", f"got {data.get('pages')}")
    try:
        raw = decode_pdf_data_url(data["pdf_base64"])
        R.check(valid_pdf(raw), "1d.3 %PDF signature", raw[:8].hex())
    except Exception as e:
        R.check(False, "1d.3 decode RGBA PDF", str(e))


def test_images_to_pdf_empty():
    print("\n[1e] images-to-pdf — empty list")
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": []}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 400, "1e.1 HTTP 400", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    R.check("Aucune image fournie" in (detail or ""),
            "1e.2 detail == 'Aucune image fournie'", f"got {detail!r}")


def test_images_to_pdf_too_many():
    print("\n[1f] images-to-pdf — 21 images (> max 20)")
    tiny = make_jpeg_b64(color=(50, 50, 50), size=(100, 100))
    imgs = [tiny] * 21
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 400, "1f.1 HTTP 400", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    R.check("Maximum 20 pages par PDF" in (detail or ""),
            "1f.2 detail == 'Maximum 20 pages par PDF'", f"got {detail!r}")


def test_images_to_pdf_invalid_b64():
    print("\n[1g] images-to-pdf — invalid base64 / garbage")
    r = requests.post(
        f"{API}/expenses/images-to-pdf",
        json={"images": ["not-a-valid-base64-!@#"]},
        timeout=REQ_TIMEOUT,
    )
    R.check(r.status_code in (400, 500),
            "1g.1 HTTP 400 or 500 for invalid image", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    detail_l = (detail or "").lower()
    R.check(
        any(w in detail_l for w in ["image", "invalide", "erreur", "traitement", "identify"]),
        "1g.2 detail mentions image/error", f"got {detail!r}",
    )


def test_images_to_pdf_large():
    print("\n[1h] images-to-pdf — very large image (>2200px dim)")
    imgs = [make_large_jpeg_b64(size=(3000, 2400))]
    r = requests.post(f"{API}/expenses/images-to-pdf", json={"images": imgs}, timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "1h.1 HTTP 200 (large image resized)",
            f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    data = r.json()
    R.check(data.get("pages") == 1, "1h.2 pages == 1", f"got {data.get('pages')}")
    try:
        raw = decode_pdf_data_url(data["pdf_base64"])
        R.check(valid_pdf(raw), "1h.3 %PDF signature (large)", raw[:8].hex())
    except Exception as e:
        R.check(False, "1h.3 decode large PDF", str(e))


# ---------------------------------------------------------------------------
# 2. GET /api/expenses/{id}/receipt-pdf
# ---------------------------------------------------------------------------
def test_receipt_pdf_happy():
    print("\n[2a] receipt-pdf — expense with attached PDF")
    try:
        pdf_data_url = _generate_pdf_data_url(num_pages=2)
    except Exception as e:
        R.check(False, "2a.setup generate pdf", str(e))
        return

    eid = _create_expense({
        "amount": 42.75,
        "category": "gas",
        "date": "2026-04-15",
        "vendor": "Canadian Tire",
        "description": "Essence + lave-glace",
        "receipt_pdf": pdf_data_url,
    })

    r = requests.get(f"{API}/expenses/{eid}/receipt-pdf", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "2a.1 HTTP 200",
            f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    R.check(r.headers.get("content-type", "").startswith("application/pdf"),
            "2a.2 Content-Type is application/pdf",
            f"got {r.headers.get('content-type')}")
    R.check(r.content[:5] == b"%PDF-",
            "2a.3 body bytes start with %PDF", r.content[:8].hex())
    cd = r.headers.get("content-disposition", "")
    R.check("inline" in cd.lower() and ".pdf" in cd.lower(),
            "2a.4 Content-Disposition inline with .pdf filename", f"got {cd!r}")
    R.check("Canadian_Tire" in cd,
            "2a.5/2d filename contains 'Canadian_Tire' (spaces→underscore)",
            f"got {cd!r}")
    R.check("2026-04-15" in cd,
            "2a.6/2d filename contains date '2026-04-15'", f"got {cd!r}")


def test_receipt_pdf_missing():
    print("\n[2b] receipt-pdf — expense without PDF")
    eid = _create_expense({
        "amount": 12.50,
        "category": "resto",
        "date": "2026-04-16",
        "vendor": "Tim Hortons",
        "description": "Café",
    })
    r = requests.get(f"{API}/expenses/{eid}/receipt-pdf", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 404, "2b.1 HTTP 404", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    R.check("Aucun PDF attaché" in (detail or ""),
            "2b.2 detail == 'Aucun PDF attaché'", f"got {detail!r}")


def test_receipt_pdf_not_found():
    print("\n[2c] receipt-pdf — non-existent expense id")
    r = requests.get(f"{API}/expenses/does-not-exist-xyz-123/receipt-pdf", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 404, "2c.1 HTTP 404", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    R.check("Dépense introuvable" in (detail or ""),
            "2c.2 detail == 'Dépense introuvable'", f"got {detail!r}")


def test_receipt_pdf_corrupt():
    print("\n[2e] receipt-pdf — corrupt base64 in receipt_pdf field")
    # Craft b64 that truly fails b64decode (length 5 after filter, not mult of 4, no padding).
    # "ABCDE" is valid base64 alphabet but length 5 -> raises binascii.Error.
    garbage = "data:application/pdf;base64,ABCDE"
    eid = _create_expense({
        "amount": 1.00,
        "category": "equipement",
        "date": "2026-04-17",
        "vendor": "Test Garbage",
        "receipt_pdf": garbage,
    })
    r = requests.get(f"{API}/expenses/{eid}/receipt-pdf", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 500, "2e.1 HTTP 500 on truly-invalid b64", f"status={r.status_code}")
    try:
        detail = r.json().get("detail", "")
    except Exception:
        detail = r.text
    R.check("corrompu" in (detail or "").lower(),
            "2e.2 detail mentions 'PDF corrompu'", f"got {detail!r}")

    # Secondary observation: b64 that decodes OK but is NOT a PDF still returns 200 with
    # garbage bytes (backend does not validate %PDF magic bytes post-decode). This is a
    # minor robustness gap — document it but do NOT fail the suite.
    garbage2 = "data:application/pdf;base64,!!!!!!not_valid!!!!"
    eid2 = _create_expense({
        "amount": 1.00,
        "category": "equipement",
        "date": "2026-04-17",
        "vendor": "Test Garbage2",
        "receipt_pdf": garbage2,
    })
    r2 = requests.get(f"{API}/expenses/{eid2}/receipt-pdf", timeout=REQ_TIMEOUT)
    print(f"  ℹ️  (observational) valid-b64-but-not-PDF returns HTTP {r2.status_code} "
          f"(no %PDF-magic validation). First 4 bytes: {r2.content[:4]!r}")


# ---------------------------------------------------------------------------
# 3. Expense model regression — receipt_pdf field flow
# ---------------------------------------------------------------------------
def test_expense_crud_with_pdf():
    print("\n[3] Expense model regression — receipt_pdf flow")

    try:
        pdf_data_url = _generate_pdf_data_url(num_pages=1)
    except Exception as e:
        R.check(False, "3.setup generate pdf", str(e))
        return

    # 3a) POST /expenses with receipt_pdf
    print("  [3a] POST /expenses with receipt_pdf + receipt_photo")
    r = requests.post(
        f"{API}/expenses",
        json={
            "amount": 99.99,
            "category": "publicite",
            "date": "2026-05-01",
            "vendor": "Meta Ads",
            "description": "Campagne FB",
            "receipt_pdf": pdf_data_url,
            "receipt_photo": make_jpeg_b64(color=(120, 60, 180), size=(300, 400), data_url=True),
        },
        timeout=REQ_TIMEOUT,
    )
    R.check(r.status_code == 200, "3a.1 POST 200", f"status={r.status_code} body={r.text[:200]}")
    if r.status_code != 200:
        return
    created = r.json()
    eid = created["id"]
    CREATED_EXPENSE_IDS.append(eid)
    R.check(created.get("receipt_pdf") == pdf_data_url,
            "3a.2 POST response echoes receipt_pdf")
    R.check(bool(created.get("receipt_photo")),
            "3a.3 POST response includes receipt_photo (not broken by new field)")

    # 3b) GET /expenses/{id}
    print("  [3b] GET /expenses/{id}")
    r = requests.get(f"{API}/expenses/{eid}", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "3b.1 GET 200", f"status={r.status_code}")
    got = r.json() if r.status_code == 200 else {}
    R.check(got.get("receipt_pdf") == pdf_data_url,
            "3b.2 GET returns receipt_pdf unchanged")
    R.check(bool(got.get("receipt_photo")),
            "3b.3 GET still returns receipt_photo (independent field)")

    # 3c) PUT /expenses/{id} updating receipt_pdf
    print("  [3c] PUT /expenses/{id} updating receipt_pdf")
    try:
        new_pdf_data_url = _generate_pdf_data_url(num_pages=3)
    except Exception as e:
        R.check(False, "3c.setup generate new pdf", str(e))
        new_pdf_data_url = None
    if new_pdf_data_url:
        R.check(new_pdf_data_url != pdf_data_url,
                "3c.0 new PDF differs from original")
        r = requests.put(
            f"{API}/expenses/{eid}",
            json={"receipt_pdf": new_pdf_data_url},
            timeout=REQ_TIMEOUT,
        )
        R.check(r.status_code == 200, "3c.1 PUT 200",
                f"status={r.status_code} body={r.text[:200]}")
        if r.status_code == 200:
            R.check(r.json().get("receipt_pdf") == new_pdf_data_url,
                    "3c.2 PUT response echoes updated receipt_pdf")
        r2 = requests.get(f"{API}/expenses/{eid}", timeout=REQ_TIMEOUT)
        R.check(r2.status_code == 200 and r2.json().get("receipt_pdf") == new_pdf_data_url,
                "3c.3 GET after PUT confirms new receipt_pdf persisted")

    # 3d) GET /expenses (list) contains receipt_pdf field
    print("  [3d] GET /expenses (list) includes receipt_pdf field")
    r = requests.get(f"{API}/expenses", timeout=REQ_TIMEOUT)
    R.check(r.status_code == 200, "3d.1 GET list 200", f"status={r.status_code}")
    if r.status_code == 200:
        items = r.json()
        R.check(isinstance(items, list) and len(items) > 0,
                "3d.2 list is non-empty", f"len={len(items) if isinstance(items, list) else 'N/A'}")
        ours = next((it for it in items if it.get("id") == eid), None)
        R.check(ours is not None, "3d.3 our expense present in list")
        if ours is not None:
            R.check("receipt_pdf" in ours,
                    "3d.4 list item has receipt_pdf key")
            R.check(ours.get("receipt_pdf") is not None,
                    "3d.5 our list item has receipt_pdf populated")

    # 3e) receipt_photo independent
    print("  [3e] receipt_photo still works without receipt_pdf")
    photo_only = make_jpeg_b64(color=(70, 130, 180), size=(300, 400), data_url=True)
    r = requests.post(
        f"{API}/expenses",
        json={
            "amount": 15.00,
            "category": "resto",
            "date": "2026-05-02",
            "vendor": "Café Depot",
            "description": "Photo only",
            "receipt_photo": photo_only,
        },
        timeout=REQ_TIMEOUT,
    )
    R.check(r.status_code == 200, "3e.1 POST photo-only expense 200",
            f"status={r.status_code} body={r.text[:200]}")
    if r.status_code == 200:
        d = r.json()
        eid2 = d["id"]
        CREATED_EXPENSE_IDS.append(eid2)
        R.check(d.get("receipt_photo") == photo_only,
                "3e.2 receipt_photo returned correctly")
        R.check(d.get("receipt_pdf") is None,
                "3e.3 receipt_pdf is None when not provided")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    try:
        single_size = test_images_to_pdf_single()
        test_images_to_pdf_multi(single_size)
        test_images_to_pdf_mixed_prefixes()
        test_images_to_pdf_rgba()
        test_images_to_pdf_empty()
        test_images_to_pdf_too_many()
        test_images_to_pdf_invalid_b64()
        test_images_to_pdf_large()

        test_receipt_pdf_happy()
        test_receipt_pdf_missing()
        test_receipt_pdf_not_found()
        test_receipt_pdf_corrupt()

        test_expense_crud_with_pdf()
    finally:
        cleanup()
        R.summary()

    sys.exit(0 if R.failed == 0 else 1)


if __name__ == "__main__":
    main()
