"""Try sending to foun1965@hotmail.com — will fail in Resend sandbox mode."""
import os
from pathlib import Path
from dotenv import load_dotenv
import resend

load_dotenv('/app/backend/.env')
resend.api_key = os.environ.get('RESEND_API_KEY')

ASSETS = Path('/app/backend/assets')
files = [
    ASSETS / 'BrightCalendar_Brochure_Commerciale.pdf',
    ASSETS / 'BrightCalendar_Brochure_Commerciale.docx',
    ASSETS / 'BrightCalendar_Plan_Commercialisation.pdf',
    ASSETS / 'BrightCalendar_Plan_Commercialisation.docx',
]

def to_attachment(path):
    with open(path, 'rb') as f:
        return {"filename": path.name, "content": list(f.read())}

html = """
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0891B2;">📄 BrightCalendar — Documents de commercialisation</h2>
  <p>Bonjour,</p>
  <p>Voici les documents mis à jour pour <strong>BrightCalendar</strong> :</p>
  <ul>
    <li>🎨 <strong>Brochure Commerciale</strong> (PDF + Word) — <strong>maintenant avec 6 captures d'écran</strong> de l'application</li>
    <li>📊 <strong>Plan de Commercialisation</strong> (PDF + Word)</li>
  </ul>
  <p>4 fichiers en pièces jointes.</p>
</div>
"""

params = {
    "from": "onboarding@resend.dev",
    "to": ["foun1965@hotmail.com"],
    "subject": "📄 BrightCalendar — Brochure avec captures d'écran",
    "html": html,
    "attachments": [to_attachment(f) for f in files],
}

try:
    resp = resend.Emails.send(params)
    print(f"✅ Email envoyé : {resp.get('id')}")
except Exception as e:
    print(f"❌ Échec : {e}")
