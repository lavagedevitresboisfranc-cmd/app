"""Send the 2 PDF documents to the user's email via Resend."""
import os
import base64
from pathlib import Path
from dotenv import load_dotenv
import resend

load_dotenv('/app/backend/.env')

resend.api_key = os.environ.get('RESEND_API_KEY')

ASSETS = Path('/app/backend/assets')
brochure_pdf = ASSETS / 'BrightCalendar_Brochure_Commerciale.pdf'
brochure_docx = ASSETS / 'BrightCalendar_Brochure_Commerciale.docx'
plan_pdf = ASSETS / 'BrightCalendar_Plan_Commercialisation.pdf'
plan_docx = ASSETS / 'BrightCalendar_Plan_Commercialisation.docx'

def to_attachment(path: Path):
    with open(path, 'rb') as f:
        content = f.read()
    return {
        "filename": path.name,
        "content": list(content),
    }

html = """
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #0891B2;">📄 BrightCalendar — Documents de commercialisation</h2>
  <p>Bonjour,</p>
  <p>Voici l'ensemble des documents demandés pour la commercialisation de <strong>BrightCalendar</strong>, en versions <strong>PDF</strong> et <strong>Word</strong> :</p>
  <ul style="line-height: 1.8;">
    <li>📊 <strong>Plan de Commercialisation</strong> (PDF + Word) — document interne avec coûts, marges, stratégie complète et feuille de route</li>
    <li>🎨 <strong>Brochure Commerciale</strong> (PDF + Word) — à partager avec vos prospects clients, forfaits, FAQ, garantie 30 jours</li>
  </ul>
  <p><strong>4 fichiers en pièces jointes.</strong></p>
  <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;">
  <p><strong>💡 Conseil d'utilisation :</strong></p>
  <ul style="line-height: 1.6; font-size: 14px; color: #404040;">
    <li>📧 Utilisez les <strong>PDF</strong> pour envoi courriel / impression / partage</li>
    <li>✏️ Utilisez les <strong>Word</strong> pour modifier le contenu selon vos besoins</li>
    <li>🎯 La <strong>Brochure</strong> peut être envoyée directement à vos prospects</li>
    <li>🔒 Le <strong>Plan</strong> est à usage strictement interne (contient coûts de développement)</li>
  </ul>
  <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 20px 0;">
  <p style="color:#737373; font-size:12px; text-align: center;">
    Généré automatiquement par BrightCalendar<br>
    Lavage de Vitres Bois-Franc — © 2025
  </p>
</div>
"""

params = {
    "from": "onboarding@resend.dev",
    "to": ["lavagedevitreboisfranc@live.com"],
    "subject": "📄 BrightCalendar — Plan & Brochure de commercialisation (PDF + Word)",
    "html": html,
    "attachments": [
        to_attachment(brochure_pdf),
        to_attachment(brochure_docx),
        to_attachment(plan_pdf),
        to_attachment(plan_docx),
    ],
}

try:
    resp = resend.Emails.send(params)
    print("✅ Email envoyé avec succès !")
    print(f"   Destinataire  : lavagedevitreboisfranc@live.com")
    print(f"   Message ID    : {resp.get('id', 'N/A')}")
    print(f"   Pièces jointes:")
    print(f"     • {brochure_pdf.name}")
    print(f"     • {brochure_docx.name}")
    print(f"     • {plan_pdf.name}")
    print(f"     • {plan_docx.name}")
except Exception as e:
    print(f"❌ Erreur lors de l'envoi : {e}")
