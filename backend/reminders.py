"""24-hour reminder system for Gexia360.

Two main functions:
1. send_24h_reminders_for_tomorrow(db) — runs daily at 9:00 AM Eastern.
   For each tomorrow's upcoming appointment with a client_email,
   sends a branded reminder email. Always sends a daily summary
   email to NOTIFY_EMAIL listing all tomorrow's RDV.
2. get_tomorrow_appointments(db) — used by the /reminders frontend
   to display tomorrow's RDV with sent/unsent status.

Idempotency: each appointment doc gets `reminder_email_sent_at` and
`reminder_sms_sent_at` set when the corresponding reminder is sent,
so reruns of the scheduler don't double-send.
"""
from __future__ import annotations
import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any
from zoneinfo import ZoneInfo

import resend
import branding

logger = logging.getLogger(__name__)
EASTERN = ZoneInfo("America/Toronto")

MONTHS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]
DAYS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def _tomorrow_iso() -> str:
    """Return tomorrow's date in YYYY-MM-DD using Eastern time."""
    now = datetime.now(EASTERN)
    return (now + timedelta(days=1)).strftime("%Y-%m-%d")


def _fmt_long_fr(date_iso: str) -> str:
    try:
        dt = datetime.fromisoformat(date_iso)
        weekday = DAYS_FR[dt.weekday()]
        return f"{weekday} {dt.day} {MONTHS_FR[dt.month - 1]} {dt.year}"
    except Exception:
        return date_iso


def _build_reminder_email(appt: Dict[str, Any]) -> str:
    """Build the HTML reminder body sent to a single client."""
    name = appt.get("client_name", "")
    long_date = _fmt_long_fr(appt.get("date", ""))
    time_slot = (appt.get("time_slot") or "")[:5]
    duration = int(appt.get("duration_minutes") or 60)
    address = appt.get("client_address", "")
    title = appt.get("title", "Service")

    address_block = (
        f'<div style="font-size:13px;color:#065F46;margin-top:6px;">📍 {address}</div>'
        if address else ""
    )
    body = f"""
<h2 style="margin:0 0 8px 0;color:#0F172A;">🔔 Rappel — Rendez-vous demain</h2>
<p style="margin:0 0 14px 0;color:#475569;font-size:14px;line-height:1.6;">
  Bonjour <strong>{name}</strong>,
</p>
<p style="margin:0 0 14px 0;color:#334155;font-size:14px;line-height:1.6;">
  Petit rappel amical&nbsp;: nous avons rendez-vous <strong>demain</strong> pour votre service de lavage de vitres.
</p>
<div style="background:#D1FAE5;border-left:4px solid #059669;padding:14px 16px;border-radius:8px;margin:16px 0;">
  <div style="font-size:11px;font-weight:700;color:#065F46;text-transform:uppercase;letter-spacing:0.5px;">📅 Détails du rendez-vous</div>
  <div style="font-size:17px;font-weight:700;color:#064E3B;margin-top:6px;">{long_date}</div>
  <div style="font-size:14px;color:#065F46;margin-top:2px;">⏰ {time_slot} ({duration} min)</div>
  <div style="font-size:13px;color:#065F46;margin-top:4px;">🛠️ {title}</div>
  {address_block}
</div>
<p style="margin:14px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
  Si ce créneau ne vous convient plus, répondez à ce courriel ou appelez-nous au <strong>514-570-9802</strong>.
</p>
<p style="margin:8px 0 0 0;color:#475569;font-size:13px;line-height:1.6;">
  À demain&nbsp;!
</p>
""".strip()
    return branding.wrap_email(body, unsubscribe_url="")


def _build_daily_summary_email(date_iso: str, appts: List[Dict[str, Any]]) -> str:
    """Build the daily summary HTML for the business owner."""
    long_date = _fmt_long_fr(date_iso)
    rows = ""
    for a in appts:
        t = (a.get("time_slot") or "")[:5]
        name = a.get("client_name", "")
        addr = a.get("client_address", "") or "—"
        phone_raw = (a.get("client_phone", "") or "").strip()
        phone_digits = "".join(c for c in phone_raw if c.isdigit())
        phone_display = phone_raw or "—"
        email = a.get("client_email", "") or "—"
        title = a.get("title", "")
        email_status = "✅" if a.get("reminder_email_sent_at") else "—"

        # Quick-action SMS/call buttons — tappable from the owner's iPhone
        action_buttons = ""
        if phone_digits:
            sms_body = (
                f"Bonjour {name}, petit rappel pour votre rendez-vous demain "
                f"{long_date} à {t}. Au plaisir! - Lavage de Vitres Bois-Franc"
            )
            from urllib.parse import quote
            sms_body_enc = quote(sms_body)
            # iOS uses '&body=' after the phone with '&' separator (iMessage)
            sms_url = f"sms:{phone_digits}&body={sms_body_enc}"
            tel_url = f"tel:{phone_digits}"
            action_buttons = f"""
<div style="margin-top:6px;">
  <a href="{sms_url}" style="display:inline-block;padding:6px 10px;background:#10B981;color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:11px;font-weight:700;margin-right:4px;">📱 SMS</a>
  <a href="{tel_url}" style="display:inline-block;padding:6px 10px;background:#0B5394;color:#FFFFFF;text-decoration:none;border-radius:6px;font-size:11px;font-weight:700;">📞 Appeler</a>
</div>"""

        rows += f"""
<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-weight:700;color:#0891B2;white-space:nowrap;vertical-align:top;">{t}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;vertical-align:top;">
    <div style="font-weight:600;color:#0F172A;">{name}</div>
    <div style="font-size:11px;color:#64748B;margin-top:2px;">{title}</div>
    {action_buttons}
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#334155;vertical-align:top;">📍 {addr}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#334155;vertical-align:top;">📞 {phone_display}<br/>✉️ {email}</td>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;text-align:center;font-size:14px;vertical-align:top;">{email_status}</td>
</tr>
"""
    count = len(appts)
    if count == 0:
        body = f"""
<h2 style="margin:0 0 8px 0;color:#0F172A;">📅 Aucun rendez-vous demain</h2>
<p style="margin:0;color:#64748B;font-size:14px;">{long_date} — pas de RDV planifié.</p>
"""
    else:
        body = f"""
<h2 style="margin:0 0 6px 0;color:#0F172A;">📅 Récap des rendez-vous de demain</h2>
<p style="margin:0 0 16px 0;color:#475569;font-size:14px;">{long_date} — <strong>{count} RDV</strong></p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#FFFFFF;border-radius:8px;overflow:hidden;">
  <thead>
    <tr style="background:#0F172A;color:#FFFFFF;">
      <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.5px;">HEURE</th>
      <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.5px;">CLIENT</th>
      <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.5px;">ADRESSE</th>
      <th style="padding:10px 12px;text-align:left;font-size:11px;letter-spacing:0.5px;">CONTACT</th>
      <th style="padding:10px 12px;text-align:center;font-size:11px;letter-spacing:0.5px;">📧</th>
    </tr>
  </thead>
  <tbody>{rows}</tbody>
</table>
<p style="margin:16px 0 0 0;color:#94A3B8;font-size:12px;font-style:italic;">
  📱 = Tapez pour envoyer SMS de rappel via iMessage. 📞 = Tapez pour appeler. 📧 = Courriel de rappel envoyé au client.
</p>
"""
    return branding.wrap_email(body, unsubscribe_url="")


async def send_24h_reminders_for_tomorrow(db) -> Dict[str, Any]:
    """Main scheduler entrypoint: send 24h reminders + owner summary.

    Returns a dict {date, total, emails_sent, emails_skipped, summary_sent}.
    """
    date_iso = _tomorrow_iso()
    cursor = db.appointments.find({
        "date": date_iso,
        "status": {"$in": ["upcoming", "scheduled", "confirmed"]},
    }, {"_id": 0})
    appts = await cursor.to_list(500)
    appts = sorted(appts, key=lambda a: (a.get("time_slot") or ""))

    emails_sent = 0
    emails_skipped = 0
    from_addr = os.environ.get("RESEND_FROM") or "onboarding@resend.dev"
    notify_email = (os.environ.get("NOTIFY_EMAIL") or "").strip()

    if not resend.api_key:
        logger.warning("Reminder skipped: RESEND_API_KEY not configured")
        return {"date": date_iso, "total": len(appts), "emails_sent": 0,
                "emails_skipped": len(appts), "summary_sent": False}

    for a in appts:
        # Idempotency — skip if already sent today
        if a.get("reminder_email_sent_at"):
            emails_skipped += 1
            continue
        client_email = (a.get("client_email") or "").strip()
        if not client_email:
            emails_skipped += 1
            continue
        try:
            html = _build_reminder_email(a)
            t = (a.get("time_slot") or "")[:5]
            await asyncio.to_thread(resend.Emails.send, {
                "from": from_addr,
                "to": [client_email],
                "subject": f"🔔 Rappel — Rendez-vous demain à {t}",
                "html": html,
            })
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.appointments.update_one(
                {"id": a["id"]},
                {"$set": {"reminder_email_sent_at": now_iso}},
            )
            a["reminder_email_sent_at"] = now_iso
            emails_sent += 1
            logger.info(f"24h reminder email sent to {client_email} for RDV {a['id']}")
        except Exception as e:
            logger.error(f"Failed to send 24h reminder to {client_email}: {e}")

    summary_sent = False
    if notify_email:
        try:
            summary_html = _build_daily_summary_email(date_iso, appts)
            await asyncio.to_thread(resend.Emails.send, {
                "from": from_addr,
                "to": [notify_email],
                "subject": f"📅 Récap des RDV de demain — {len(appts)} RDV",
                "html": summary_html,
            })
            summary_sent = True
            logger.info(f"Daily summary sent to {notify_email}")
        except Exception as e:
            logger.error(f"Failed to send daily summary to {notify_email}: {e}")

    return {
        "date": date_iso,
        "total": len(appts),
        "emails_sent": emails_sent,
        "emails_skipped": emails_skipped,
        "summary_sent": summary_sent,
    }


async def get_tomorrow_appointments(db) -> Dict[str, Any]:
    """Return the list of tomorrow's appointments + which had reminders sent.

    Used by the /reminders screen in the frontend.
    """
    date_iso = _tomorrow_iso()
    cursor = db.appointments.find({
        "date": date_iso,
        "status": {"$in": ["upcoming", "scheduled", "confirmed"]},
    }, {"_id": 0})
    appts = await cursor.to_list(500)
    appts = sorted(appts, key=lambda a: (a.get("time_slot") or ""))
    return {
        "date": date_iso,
        "date_label": _fmt_long_fr(date_iso),
        "count": len(appts),
        "appointments": appts,
    }
