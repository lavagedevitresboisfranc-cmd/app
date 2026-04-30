"""iCalendar (.ics) feed generator for Apple/Google/Outlook calendar subscription.

Generates an RFC 5545 compliant .ics file that lists all upcoming and recent
appointments so the user can subscribe in Apple Calendar (Settings > Calendar >
Accounts > Add > Other > Add Subscribed Calendar) and see their Gexia360 RDVs
appear automatically on iPhone / Mac / Apple Watch.

Usage:
    body = build_ics_feed(appointments)
    Response(content=body, media_type="text/calendar; charset=utf-8")
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Iterable
import re

# Eastern Time offset is roughly -4 (EDT summer) / -5 (EST winter).
# We emit floating-time events in America/Toronto so the user's device handles DST.
TZID = "America/Toronto"


def _ics_escape(text: str) -> str:
    """Escape special characters per RFC 5545 §3.3.11."""
    if not text:
        return ""
    s = str(text)
    s = s.replace("\\", "\\\\")
    s = s.replace(";", "\\;")
    s = s.replace(",", "\\,")
    s = s.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\n")
    return s


def _fold_line(line: str) -> str:
    """Fold lines longer than 75 octets per RFC 5545 §3.1."""
    if len(line) <= 75:
        return line
    out = []
    while len(line) > 75:
        out.append(line[:75])
        line = " " + line[75:]  # subsequent lines start with a space
    out.append(line)
    return "\r\n".join(out)


def _format_dt_local(date_str: str, time_slot: str) -> str:
    """Convert YYYY-MM-DD + HH:MM into TZID-anchored DT format YYYYMMDDTHHMMSS."""
    try:
        y, m, d = [int(x) for x in date_str.split("-")[:3]]
    except Exception:
        return ""
    hh, mm = 9, 0
    try:
        parts = (time_slot or "09:00").split(":")
        hh = int(parts[0]); mm = int(parts[1])
    except Exception:
        pass
    return f"{y:04d}{m:02d}{d:02d}T{hh:02d}{mm:02d}00"


def _add_minutes_local(date_str: str, time_slot: str, minutes: int) -> str:
    """Add minutes to local datetime, return YYYYMMDDTHHMMSS."""
    try:
        y, m, d = [int(x) for x in date_str.split("-")[:3]]
        parts = (time_slot or "09:00").split(":")
        hh = int(parts[0]); mn = int(parts[1])
        dt = datetime(y, m, d, hh, mn) + timedelta(minutes=int(minutes or 60))
        return dt.strftime("%Y%m%dT%H%M%S")
    except Exception:
        return _format_dt_local(date_str, time_slot)


def _vtimezone_block() -> str:
    """Static VTIMEZONE block for America/Toronto so events float through DST."""
    return (
        "BEGIN:VTIMEZONE\r\n"
        f"TZID:{TZID}\r\n"
        "X-LIC-LOCATION:America/Toronto\r\n"
        "BEGIN:DAYLIGHT\r\n"
        "TZOFFSETFROM:-0500\r\n"
        "TZOFFSETTO:-0400\r\n"
        "TZNAME:EDT\r\n"
        "DTSTART:19700308T020000\r\n"
        "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU\r\n"
        "END:DAYLIGHT\r\n"
        "BEGIN:STANDARD\r\n"
        "TZOFFSETFROM:-0400\r\n"
        "TZOFFSETTO:-0500\r\n"
        "TZNAME:EST\r\n"
        "DTSTART:19701101T020000\r\n"
        "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU\r\n"
        "END:STANDARD\r\n"
        "END:VTIMEZONE\r\n"
    )


def build_ics_feed(appointments: Iterable[dict], *, calendar_name: str = "Gexia360 — Rendez-vous", geocode_map: dict | None = None) -> str:
    """Render a full .ics feed from a list of appointment dicts.

    Each appointment is expected to provide:
      - id (str, UUID)
      - date (YYYY-MM-DD)
      - time_slot (HH:MM)
      - duration_minutes (int)
      - client_name, client_address, client_phone, price
      - status

    geocode_map: optional {address: (lat, lon)} dict so addresses become tappable
    Apple Maps links in Apple Calendar.
    """
    geocode_map = geocode_map or {}
    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines: list[str] = []
    lines.append("BEGIN:VCALENDAR")
    lines.append("VERSION:2.0")
    lines.append("PRODID:-//Gexia360//Lavage de Vitres Bois-Franc//FR")
    lines.append("CALSCALE:GREGORIAN")
    lines.append("METHOD:PUBLISH")
    lines.append(f"X-WR-CALNAME:{_ics_escape(calendar_name)}")
    lines.append("X-WR-TIMEZONE:America/Toronto")
    lines.append("X-PUBLISHED-TTL:PT15M")
    lines.append("REFRESH-INTERVAL;VALUE=DURATION:PT15M")
    # Embed VTIMEZONE as raw multi-line (already CRLF terminated)
    raw_tz = _vtimezone_block()

    for appt in appointments:
        if not appt:
            continue
        status = (appt.get("status") or "").lower()
        # Skip archived/cancelled events from the calendar feed
        if status in ("archived", "cancelled", "canceled"):
            continue
        date_s = appt.get("date") or ""
        time_s = (appt.get("time_slot") or "09:00")[:5]
        if not date_s or not re.match(r"^\d{4}-\d{2}-\d{2}$", date_s):
            continue
        dur = int(appt.get("duration_minutes") or 60)

        dtstart_local = _format_dt_local(date_s, time_s)
        dtend_local = _add_minutes_local(date_s, time_s, dur)
        if not dtstart_local:
            continue

        uid = f"{appt.get('id') or 'apt'}@gexia360"
        name = appt.get("client_name") or "Rendez-vous"
        address = (appt.get("client_address") or "").strip()
        phone = appt.get("client_phone") or ""
        price = appt.get("price")
        notes_lines = []
        if phone:
            notes_lines.append(f"📞 {phone}")
        if price:
            try:
                notes_lines.append(f"💰 Prix: {float(price):.2f} $")
            except Exception:
                pass
        notes_lines.append(f"Statut: {status or 'upcoming'}")
        # ALWAYS include a tappable Apple Maps URL in description so the user
        # can launch GPS navigation in 1 tap (works 100% even on subscribed,
        # read-only calendars where X-APPLE-STRUCTURED-LOCATION is not rendered)
        if address:
            from urllib.parse import quote
            maps_url = f"https://maps.apple.com/?daddr={quote(address)}"
            notes_lines.append("")
            notes_lines.append("🗺️ Itinéraire GPS (Apple Maps):")
            notes_lines.append(maps_url)
        if appt.get("notes"):
            notes_lines.append("---")
            notes_lines.append(str(appt.get("notes")))
        description = "\n".join(notes_lines)

        lines.append("BEGIN:VEVENT")
        lines.append(_fold_line(f"UID:{uid}"))
        lines.append(f"DTSTAMP:{now_utc}")
        lines.append(f"DTSTART;TZID={TZID}:{dtstart_local}")
        lines.append(f"DTEND;TZID={TZID}:{dtend_local}")
        lines.append(_fold_line(f"SUMMARY:{_ics_escape(name)}"))
        if address:
            lines.append(_fold_line(f"LOCATION:{_ics_escape(address)}"))
            # Apple Calendar requires X-APPLE-STRUCTURED-LOCATION to make the
            # address tappable as a Maps link with one-tap GPS navigation.
            coords = geocode_map.get(address)
            if coords:
                lat, lon = coords
                # GEO field — used by Outlook, Google, Apple
                lines.append(f"GEO:{lat:.6f};{lon:.6f}")
                # X-APPLE-STRUCTURED-LOCATION enables "Get Directions" in iOS Calendar
                # IMPORTANT: do NOT fold this line — iOS Calendar parser is picky
                # and will fail to recognize the location if the URI is split.
                apple_addr = address.replace('"', '').replace("\\", "")
                apple_title = (name or "Rendez-vous").replace('"', '').replace("\\", "")
                xapple = (
                    f'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;'
                    f'X-ADDRESS="{apple_addr}";'
                    f'X-APPLE-RADIUS=70.0;'
                    f'X-TITLE="{apple_title}":'
                    f'geo:{lat:.6f},{lon:.6f}'
                )
                # Emit unfolded — Apple Calendar bug with folded structured locations
                lines.append(xapple)
                # Add Apple Maps URL in description so user can also tap from there
            else:
                # No coords — emit only LOCATION (Apple at least shows it as text)
                pass
        lines.append(_fold_line(f"DESCRIPTION:{_ics_escape(description)}"))
        lines.append("CATEGORIES:Lavage de vitres")
        # Status mapping
        if status == "completed":
            lines.append("STATUS:CONFIRMED")
        elif status == "upcoming":
            lines.append("STATUS:CONFIRMED")
        else:
            lines.append("STATUS:TENTATIVE")
        # 24h reminder alarm
        lines.append("BEGIN:VALARM")
        lines.append("ACTION:DISPLAY")
        lines.append("DESCRIPTION:Rappel 24h — Gexia360")
        lines.append("TRIGGER:-PT24H")
        lines.append("END:VALARM")
        lines.append("END:VEVENT")

    body = "\r\n".join(lines) + "\r\n" + raw_tz + "END:VCALENDAR\r\n"
    return body
