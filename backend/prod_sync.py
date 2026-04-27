"""Auto-sync bridge between production (emergent.host) and preview databases.

Runs periodically (every 5 min) to pull any appointment_requests / appointments /
clients that were submitted via the PUBLIC WEBSITE form (which currently points at
the production deployment) into the preview database so the user's PWA sees them.

This is a BAND-AID until the production deployment's MONGO_URL is updated to point
at the same MongoDB Atlas cluster as preview.
"""
from __future__ import annotations
import os
import logging
import asyncio
import httpx

logger = logging.getLogger(__name__)

PROD_URL = os.environ.get("PROD_SYNC_URL", "https://booking-hub-406.emergent.host").rstrip("/")
SYNC_TIMEOUT_S = 15


async def _get_json(client: httpx.AsyncClient, path: str) -> list:
    try:
        r = await client.get(f"{PROD_URL}{path}", timeout=SYNC_TIMEOUT_S)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                return data
    except Exception as e:
        logger.warning(f"prod_sync GET {path} failed: {e}")
    return []


async def run_sync(db) -> dict:
    """Pull new requests / appointments / clients from production into preview.

    Returns counts: {requests_added, appointments_added, clients_added}.
    """
    async with httpx.AsyncClient() as client:
        prod_requests = await _get_json(client, "/api/requests")
        prod_appts = await _get_json(client, "/api/appointments")
        prod_clients = await _get_json(client, "/api/clients-db?limit=2000")

    # Get existing ids in preview so we don't duplicate
    preview_req_ids = set()
    async for r in db.appointment_requests.find({}, {"id": 1, "_id": 0}):
        preview_req_ids.add(r.get("id"))

    preview_appt_ids = set()
    async for a in db.appointments.find({}, {"id": 1, "_id": 0}):
        preview_appt_ids.add(a.get("id"))

    preview_client_ids = set()
    async for c in db.clients.find({}, {"id": 1, "_id": 0}):
        preview_client_ids.add(c.get("id"))

    new_reqs = 0
    for r in prod_requests:
        rid = r.get("id")
        if rid and rid not in preview_req_ids:
            r.setdefault("message", "")
            r.setdefault("request_type", "rdv")
            r.pop("_id", None)
            try:
                await db.appointment_requests.insert_one(r)
                new_reqs += 1
            except Exception as e:
                logger.warning(f"prod_sync insert request {rid[:8]} failed: {e}")

    new_appts = 0
    for a in prod_appts:
        aid = a.get("id")
        if aid and aid not in preview_appt_ids:
            a.pop("_id", None)
            try:
                await db.appointments.insert_one(a)
                new_appts += 1
            except Exception as e:
                logger.warning(f"prod_sync insert appt {aid[:8]} failed: {e}")

    new_clients = 0
    for c in prod_clients:
        cid = c.get("id")
        if cid and cid not in preview_client_ids:
            c.pop("_id", None)
            try:
                await db.clients.insert_one(c)
                new_clients += 1
            except Exception as e:
                logger.warning(f"prod_sync insert client {cid[:8]} failed: {e}")

    result = {
        "requests_added": new_reqs,
        "appointments_added": new_appts,
        "clients_added": new_clients,
    }
    if new_reqs or new_appts or new_clients:
        logger.info(f"prod_sync: {result}")
    return result
