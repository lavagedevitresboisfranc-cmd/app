"""Send the 2 PDF documents to the user's email via Resend."""
import os
import base64
from pathlib import Path
from dotenv import load_dotenv
import resend

load_dotenv('/app/backend/.env')

resend.api_key = os.environ.get('RESEND_API_KEY')

ASSETS = Path('/app/backend/assets')
brochure = ASSETS / 'BrightCalendar_Brochure_Commerciale.pdf'
plan = ASSETS / 'BrightCalendar_Plan_Commercialisation.pdf'

def to_attachment(path: Path):
    with open(path, 'rb') as f:
        content = f.read()
    return {
        "filename": path.name,
        "content": list(content),  # Resend accepts list of bytes or base64 string
    }

html = """
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0891B2;">📄 BrightCalendar — Documents de commercialisation</h2>
  <p>Bonjour,</p>
  <p>Voici les deux documents demandés pour la commercialisation de <strong>BrightCalendar</strong> :</p>
  <ul>
    <li>📊 <strong>Plan de Commercialisation</strong> — document interne (coûts, marges, stratégie complète)</li>
    <li>🎨 <strong>Brochure Commerciale</strong> — à partager avec vos prospects clients</li>
  </ul>
  <p>Les deux fichiers PDF sont en pièces jointes.</p>
  <hr>
  <p style="color:#737373; font-size:12px;">
    Généré automatiquement par BrightCalendar<br>
    Lavage de Vitres Bois-Franc
  </p>
</div>
"""

params = {
    "from": "onboarding@resend.dev",
    "to": ["foun1965@hotmail.com"],
    "subject": "📄 BrightCalendar — Plan & Brochure de commercialisation",
    "html": html,
    "attachments": [
        to_attachment(brochure),
        to_attachment(plan),
    ],
}

try:
    resp = resend.Emails.send(params)
    print("✅ Email envoyé avec succès !")
    print(f"   Destinataire : foun1965@hotmail.com")
    print(f"   Message ID   : {resp.get('id', 'N/A')}")
    print(f"   Pièces jointes : {brochure.name} + {plan.name}")
except Exception as e:
    print(f"❌ Erreur lors de l'envoi : {e}")
