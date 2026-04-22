"""
Backend tests for NEW endpoint: POST /api/campaigns/preview-html
Scope: strictly limited to the new email campaign HTML preview endpoint.
"""
import os
import sys
import requests

BASE_URL = "https://booking-hub-406.preview.emergentagent.com/api"
ENDPOINT = f"{BASE_URL}/campaigns/preview-html"

passed = 0
failed = 0
failures = []


def check(cond, label):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS: {label}")
    else:
        failed += 1
        failures.append(label)
        print(f"  FAIL: {label}")


def section(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


# ---------------- Test 1: Happy path ----------------
section("TEST 1: Happy path (full real body + subject)")
body1 = (
    "Bonjour,\n\n"
    "Le printemps est arrivé! C'est le moment idéal pour redonner de l'éclat à vos fenêtres "
    "après les intempéries de l'hiver.\n\n"
    "Réservez dès maintenant avant que mon agenda se remplisse!\n\n"
    "📅 Pour prendre rendez-vous:\n"
    "      Lavagedevitre.org\n\n"
    "— — —\n"
    "Lavage de Vitres Bois-Franc\n"
    "📞 514-570-9802\n"
    "🌐 https://Lavagedevitre.org\n\n"
    "Merci de votre confiance!"
)
subject1 = "Printemps — Lavage de vitres"

try:
    r1 = requests.post(ENDPOINT, json={"body": body1, "subject": subject1}, timeout=60)
except Exception as e:
    print(f"Request failed: {e}")
    sys.exit(1)

print(f"  HTTP status: {r1.status_code}")
print(f"  Content-Type: {r1.headers.get('Content-Type')}")
print(f"  Response size: {len(r1.content)} bytes ({len(r1.content)/1024:.1f} KB)")

check(r1.status_code == 200, "HTTP 200")
check("text/html" in (r1.headers.get("Content-Type") or "").lower(), "Content-Type contains text/html")

html1 = r1.text
lower_start = html1.lstrip().lower()
check(lower_start.startswith("<!doctype html>") or lower_start.startswith("<html"),
      "Response starts with <!DOCTYPE html> or <html")

# Clickable website link appearing twice
website_anchor_count = html1.count('<a href="https://Lavagedevitre.org"')
print(f"  <a href=\"https://Lavagedevitre.org\" occurrences: {website_anchor_count}")
check(website_anchor_count >= 2,
      f'Contains <a href="https://Lavagedevitre.org" at least TWICE (got {website_anchor_count})')

# Clickable phone (tel:+15145709802)
check('<a href="tel:+15145709802"' in html1,
      'Contains <a href="tel:+15145709802"')

# Base64 embedded images (QR + logo)
b64_count = html1.count("data:image/jpeg;base64,")
print(f"  data:image/jpeg;base64, occurrences: {b64_count}")
check(b64_count >= 2,
      f"Contains data:image/jpeg;base64, at least twice (QR + logo) (got {b64_count})")

# Logo as background watermark
check("background-image:url('data:image/jpeg;base64," in html1
      or 'background-image:url("data:image/jpeg;base64,' in html1
      or "background-image: url('data:image/jpeg;base64," in html1,
      "Contains background-image:url('data:image/jpeg;base64,")

# Subject in <title>
check(f"<title>{subject1}</title>" in html1 or subject1 in html1.split("</title>")[0] if "</title>" in html1 else False,
      f"Subject '{subject1}' appears in <title>")

# QR caption
check("Scannez pour prendre rendez-vous" in html1,
      'Contains "Scannez pour prendre rendez-vous" (QR caption)')

# Response size > 200KB
check(len(r1.content) > 200 * 1024,
      f"Response size > 200KB (actual {len(r1.content)/1024:.1f} KB)")

# "Bonjour," in HTML
check("Bonjour," in html1,
      'Contains "Bonjour,"')

# No double-wrapped anchors
double_anchor = "<a><a" in html1 or "</a></a>" in html1
# Loose check for double-open anchor tags (e.g., '<a href="..."><a href="..."')
import re
double_open = re.search(r'<a[^>]*>\s*<a[^>]*>', html1)
check(double_open is None,
      "NO double-wrapped anchors (<a><a> pattern)")

# No leftover placeholder tokens
check("§§" not in html1,
      "NO leftover placeholder tokens (§§)")

# ---------------- Test 2: Empty body ----------------
section("TEST 2: Empty body")
try:
    r2 = requests.post(ENDPOINT, json={"body": "", "subject": "Test"}, timeout=60)
except Exception as e:
    print(f"Request failed: {e}")
    sys.exit(1)

print(f"  HTTP status: {r2.status_code}")
print(f"  Response size: {len(r2.content)} bytes ({len(r2.content)/1024:.1f} KB)")

check(r2.status_code == 200, "HTTP 200 (empty body)")
html2 = r2.text
lower_start2 = html2.lstrip().lower()
check(lower_start2.startswith("<!doctype html>") or lower_start2.startswith("<html"),
      "Valid HTML with <!DOCTYPE html> / <html")
check("<table" in html2.lower(),
      "Contains <table> (frame structure)")
check(html2.count("data:image/jpeg;base64,") >= 2,
      "QR + logo still embedded (>=2 base64 JPEGs)")
check("<title>Test</title>" in html2 or "Test" in html2.split("</title>")[0],
      "Subject 'Test' appears in <title>")

# ---------------- Test 3: HTML escape test ----------------
section("TEST 3: HTML escape (<script>alert('xss')</script>)")
xss_body = "<script>alert('xss')</script>"
try:
    r3 = requests.post(ENDPOINT, json={"body": xss_body, "subject": "XSS"}, timeout=60)
except Exception as e:
    print(f"Request failed: {e}")
    sys.exit(1)

print(f"  HTTP status: {r3.status_code}")
check(r3.status_code == 200, "HTTP 200 (xss body)")
html3 = r3.text

# Response should NOT contain raw <script>alert('xss')</script>
# Note: the HTML page itself may legitimately contain <script> tags for analytics/email clients but
# typically seasonal campaign HTML does not. The key is that the user-supplied script must be escaped.
raw_injected = "<script>alert('xss')</script>" in html3
check(not raw_injected,
      "Response does NOT contain raw injected <script>alert('xss')</script>")

# Should contain escaped version
escaped_present = ("&lt;script&gt;" in html3) or ("&lt;script" in html3)
check(escaped_present,
      "Response contains escaped &lt;script&gt; (HTML-escaped user input)")

# Also check that there is no raw <script tag at all (seasonal template shouldn't need one)
any_raw_script = "<script" in html3.lower()
if any_raw_script:
    print("  NOTE: The HTML template itself contains a <script tag (not from user input). Verifying it's template-level only.")
    # Find them:
    idxs = [i for i in range(len(html3)) if html3.lower().startswith("<script", i)]
    for i in idxs[:5]:
        print(f"    <script at index {i}: {html3[i:i+80]!r}")

# ---------------- Test 4: Missing body field ----------------
section("TEST 4: Missing body field")
try:
    r4 = requests.post(ENDPOINT, json={"subject": "Test only"}, timeout=60)
except Exception as e:
    print(f"Request failed: {e}")
    sys.exit(1)

print(f"  HTTP status: {r4.status_code}")
check(r4.status_code == 200, "HTTP 200 (missing body field)")
html4 = r4.text
lower_start4 = html4.lstrip().lower()
check(lower_start4.startswith("<!doctype html>") or lower_start4.startswith("<html"),
      "Renders valid HTML")
check("<table" in html4.lower(),
      "Frame (table) rendered")
check("<title>Test only</title>" in html4 or "Test only" in (html4.split("</title>")[0] if "</title>" in html4 else ""),
      "Subject 'Test only' appears in <title>")

# ---------------- Summary ----------------
section("SUMMARY")
print(f"TOTAL: {passed + failed}  |  PASS: {passed}  |  FAIL: {failed}")
if failures:
    print("\nFailed assertions:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("\nAll assertions PASSED.")
    sys.exit(0)
