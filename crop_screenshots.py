"""
Crop screenshots to a phone-like portrait ratio for use in the brochure.
Each screenshot is cropped to ~500x900 from the left side (where mobile content lives).
"""
from PIL import Image
import os

SCREENSHOTS_DIR = '/app/backend/assets/screenshots'
OUTPUT_DIR = '/app/backend/assets/screenshots/cropped'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Each screenshot is 1920x1080. We crop a portrait "mobile-like" rectangle
# from the top-left of the screenshot (where the app content is).
# Target ratio: 9:19.5 (iPhone)
CROP_WIDTH = 420   # narrow portrait
CROP_HEIGHT = 900  # almost full height

for filename in sorted(os.listdir(SCREENSHOTS_DIR)):
    if not filename.endswith('.png'):
        continue
    src = os.path.join(SCREENSHOTS_DIR, filename)
    if not os.path.isfile(src):
        continue
    img = Image.open(src)
    w, h = img.size
    print(f"{filename}: {w}x{h}")

    # Center-horizontal crop for a portrait phone look
    # but actually the content starts at top-left, so we crop from (0, 0)
    # and add some horizontal centering to capture the nav + content
    left = 0
    top = 0
    right = min(CROP_WIDTH + 200, w)  # keep some hamburger menu visible
    bottom = min(CROP_HEIGHT, h)

    # Actually let's go wider for better visibility
    left = 0
    right = min(950, w)  # keep ~half the wide screenshot
    top = 0
    bottom = min(CROP_HEIGHT + 100, h)

    cropped = img.crop((left, top, right, bottom))
    out_path = os.path.join(OUTPUT_DIR, filename)
    cropped.save(out_path, optimize=True, quality=85)
    print(f"  -> Cropped to {cropped.size}, saved: {out_path}")

print("\n✅ Tous les screenshots ont été recadrés.")
