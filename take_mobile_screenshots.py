"""Take real mobile-viewport screenshots of BrightCalendar for the brochure."""
from playwright.sync_api import sync_playwright
import os

OUTPUT = '/app/backend/assets/screenshots'
os.makedirs(OUTPUT, exist_ok=True)

SCREENS = [
    ('01_calendar.png', 'http://localhost:3000/', 5000),
    ('02_campaigns.png', 'http://localhost:3000/campaigns', 4000),
    ('03_clients.png', 'http://localhost:3000/clients-db', 4000),
    ('04_estimate.png', 'http://localhost:3000/estimate', 4000),
    ('05_create.png', 'http://localhost:3000/create', 4000),
    ('06_appointments.png', 'http://localhost:3000/appointments', 4000),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    page = context.new_page()

    for filename, url, wait in SCREENS:
        try:
            print(f"Loading {url}...")
            page.goto(url, wait_until='domcontentloaded', timeout=45000)
            page.wait_for_timeout(wait)
            out = os.path.join(OUTPUT, filename)
            page.screenshot(path=out, full_page=False)
            print(f"  ✓ Saved {out} ({os.path.getsize(out)} bytes)")
        except Exception as e:
            print(f"  ✗ Error on {url}: {e}")

    browser.close()

print("\n✅ Screenshots terminés.")
