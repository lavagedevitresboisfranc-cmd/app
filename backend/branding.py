"""
Centralized branding for "Lavage de Vitres Bois-Franc" / Gexia360.

Exposes:
- LOGO_BASE64   : base64-encoded JPEG of the business logo (for email + PDF embedding)
- LOGO_DATA_URL : ready-to-use data URL (`data:image/jpeg;base64,...`)
- BUSINESS_*    : company info constants
- build_email_header_html() : HTML <header> block used in every outgoing email
- build_email_footer_html() : HTML <footer> block used in every outgoing email
"""
import base64
from pathlib import Path

_ASSETS = Path(__file__).parent / "assets"
_LOGO_PATH = _ASSETS / "logo.jpg"

BUSINESS_NAME = "Lavage de Vitres Bois-Franc"
BUSINESS_TAGLINE = "Votre satisfaction, c'est notre réputation !"
BUSINESS_OWNER = "Louis-Philippe Fournier"
BUSINESS_PHONE = "514-570-9802"
BUSINESS_EMAIL = "lavagedevitreboisfranc@live.com"
BUSINESS_WEBSITE = "lavagedevitre.org"

# Brand colours from the logo
BRAND_BLUE = "#1E5BA8"
BRAND_GREEN = "#7CB342"
BRAND_DARK = "#1F2937"
BRAND_TEXT = "#4B5563"
BRAND_BORDER = "#E5E7EB"

try:
    LOGO_BASE64 = base64.b64encode(_LOGO_PATH.read_bytes()).decode("ascii")
    LOGO_DATA_URL = f"data:image/jpeg;base64,{LOGO_BASE64}"
except Exception:
    LOGO_BASE64 = ""
    LOGO_DATA_URL = ""


def build_email_header_html(subtitle: str = "") -> str:
    """Return the branded HTML header used at the top of every outgoing email.

    Shows ONLY the logo image (the business name and tagline are already
    part of the logo itself, so we don't repeat them in text below)."""
    subtitle_html = (
        f'<div style="font-size:14px;color:#6B7280;margin-top:8px;text-align:center">{subtitle}</div>'
        if subtitle
        else ""
    )
    if not LOGO_DATA_URL:
        # Fallback if logo failed to load: at least show the business name
        return f"""
        <div style="text-align:center;padding:24px 16px 16px 16px;border-bottom:2px solid {BRAND_BLUE};background:#FFFFFF">
            <div style="font-size:22px;font-weight:700;color:{BRAND_BLUE};letter-spacing:0.3px">{BUSINESS_NAME}</div>
            {subtitle_html}
        </div>
        """.strip()
    return f"""
    <div style="text-align:center;padding:20px 16px 16px 16px;border-bottom:2px solid {BRAND_BLUE};background:#FFFFFF">
        <img src="{LOGO_DATA_URL}" alt="{BUSINESS_NAME}" style="max-height:120px;max-width:420px;width:100%;height:auto;display:block;margin:0 auto" />
        {subtitle_html}
    </div>
    """.strip()


def build_email_footer_html() -> str:
    """Return the branded HTML footer shown at the bottom of every email."""
    return f"""
    <div style="margin-top:24px;padding:16px 12px;border-top:1px solid {BRAND_BORDER};background:#F9FAFB;text-align:center;font-size:12px;color:{BRAND_TEXT};line-height:1.6">
        <div style="font-weight:700;color:{BRAND_DARK};font-size:13px">{BUSINESS_NAME}</div>
        <div>{BUSINESS_OWNER}</div>
        <div>📞 <a href="tel:{BUSINESS_PHONE.replace('-','')}" style="color:{BRAND_BLUE};text-decoration:none">{BUSINESS_PHONE}</a>
            &nbsp;•&nbsp; ✉️ <a href="mailto:{BUSINESS_EMAIL}" style="color:{BRAND_BLUE};text-decoration:none">{BUSINESS_EMAIL}</a></div>
        <div>🌐 <a href="https://{BUSINESS_WEBSITE}" style="color:{BRAND_BLUE};text-decoration:none">{BUSINESS_WEBSITE}</a></div>
    </div>
    """.strip()


def wrap_email(body_html: str, subtitle: str = "") -> str:
    """Wrap a body content with the branded header and footer, in a responsive container."""
    return f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:640px;margin:24px auto;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08)">
    {build_email_header_html(subtitle)}
    <div style="padding:20px 24px;color:{BRAND_DARK};font-size:15px;line-height:1.6">
      {body_html}
    </div>
    {build_email_footer_html()}
  </div>
</body>
</html>
""".strip()


def build_pdf_header_html() -> str:
    """Compact branded header for PDF invoices/quotes — looks like a letterhead."""
    logo_img = (
        f'<img src="{LOGO_DATA_URL}" alt="{BUSINESS_NAME}" '
        f'style="height:70px;width:auto" />'
        if LOGO_DATA_URL
        else ""
    )
    return f"""
    <table style="width:100%;border-bottom:2px solid {BRAND_BLUE};padding-bottom:14px;margin-bottom:16px">
      <tr>
        <td style="vertical-align:middle;width:140px">{logo_img}</td>
        <td style="vertical-align:middle;padding-left:12px">
          <div style="font-size:20px;font-weight:700;color:{BRAND_BLUE}">{BUSINESS_NAME}</div>
          <div style="font-size:12px;color:{BRAND_GREEN};font-style:italic">{BUSINESS_TAGLINE}</div>
          <div style="font-size:11px;color:{BRAND_TEXT};margin-top:6px">
            {BUSINESS_OWNER} · {BUSINESS_PHONE}<br/>
            {BUSINESS_EMAIL} · {BUSINESS_WEBSITE}
          </div>
        </td>
      </tr>
    </table>
    """.strip()
