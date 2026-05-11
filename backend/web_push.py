"""Web Push helper: stores subscriptions in MongoDB and sends notifications.

This is a free alternative to Twilio for notifying the business owner of
new requests, client responses, etc. — without paying for SMS.

The owner installs the PWA on their iPhone (Add to Home Screen) and enables
notifications once; thereafter, server-initiated push notifications arrive
via the iOS notification center even when the app is closed.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pywebpush import webpush, WebPushException

logger = logging.getLogger(__name__)


def _vapid_private_key() -> str:
    return (os.environ.get("VAPID_PRIVATE_KEY") or "").strip()


def _vapid_subject() -> str:
    return (os.environ.get("VAPID_SUBJECT") or "mailto:noreply@example.com").strip()


def _vapid_public_key() -> str:
    return (os.environ.get("VAPID_PUBLIC_KEY") or "").strip()


def is_configured() -> bool:
    return bool(_vapid_private_key() and _vapid_public_key())


async def save_subscription(db, subscription: Dict[str, Any], label: str = "") -> str:
    """Insert (or update) a push subscription. Returns the stored doc id."""
    endpoint = (subscription or {}).get("endpoint") or ""
    keys = (subscription or {}).get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("Invalid subscription payload (missing endpoint or keys)")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "endpoint": endpoint,
        "p256dh": keys["p256dh"],
        "auth": keys["auth"],
        "label": label or "",
        "updated_at": now,
    }
    # Upsert by endpoint to avoid duplicates
    await db.push_subscriptions.update_one(
        {"endpoint": endpoint},
        {"$set": doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    row = await db.push_subscriptions.find_one({"endpoint": endpoint}, {"_id": 0})
    return row.get("endpoint") if row else endpoint


async def delete_subscription(db, endpoint: str) -> bool:
    if not endpoint:
        return False
    res = await db.push_subscriptions.delete_one({"endpoint": endpoint})
    return res.deleted_count > 0


async def list_subscriptions(db) -> List[Dict[str, Any]]:
    cur = db.push_subscriptions.find({}, {"_id": 0})
    return await cur.to_list(50)


def _send_one(sub: Dict[str, Any], payload: Dict[str, Any]) -> bool:
    """Synchronous send to a single subscription. Returns True on success."""
    try:
        webpush(
            subscription_info={
                "endpoint": sub["endpoint"],
                "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
            },
            data=json.dumps(payload),
            vapid_private_key=_vapid_private_key(),
            vapid_claims={"sub": _vapid_subject()},
            timeout=10,
        )
        return True
    except WebPushException as e:
        # 404 / 410 → subscription expired/gone, caller will purge
        sc = getattr(e.response, "status_code", None) if getattr(e, "response", None) else None
        logger.warning(f"Web push failed (status={sc}) for {sub.get('endpoint','')[:50]}...: {e}")
        return False
    except Exception as e:
        logger.warning(f"Web push unexpected error: {e}")
        return False


async def broadcast(db, title: str, body: str, url: str = "/", icon: str = "/favicon.ico", tag: str = "") -> Dict[str, int]:
    """Send the same notification to ALL stored subscriptions.

    Returns {sent, failed, total}.
    """
    if not is_configured():
        logger.info("Web push: VAPID not configured — skipping broadcast")
        return {"sent": 0, "failed": 0, "total": 0}

    subs = await list_subscriptions(db)
    if not subs:
        return {"sent": 0, "failed": 0, "total": 0}

    payload = {
        "title": title,
        "body": body,
        "url": url,
        "icon": icon,
        "tag": tag or f"gexia-{datetime.now(timezone.utc).timestamp():.0f}",
        "ts": datetime.now(timezone.utc).isoformat(),
    }

    sent = 0
    failed = 0
    stale_endpoints: List[str] = []
    # Run sequentially; volume is tiny (single user, maybe a few devices).
    for sub in subs:
        ok = _send_one(sub, payload)
        if ok:
            sent += 1
        else:
            failed += 1
            stale_endpoints.append(sub["endpoint"])

    # Purge endpoints that returned 404/410 — but we treat ALL failures as
    # potentially stale here; we'd need to inspect WebPushException.response
    # to differentiate. Keeping endpoints around if push failed transiently.
    # For now, don't purge — let the next attempt try again.

    return {"sent": sent, "failed": failed, "total": len(subs)}
