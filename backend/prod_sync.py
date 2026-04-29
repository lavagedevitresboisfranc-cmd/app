"""Auto-sync bridge between production (emergent.host) and preview databases.

Runs periodically (every 3 min) to pull any appointment_requests / appointments /
clients that were submitted via the PUBLIC WEBSITE form (which currently points at
the production deployment) into the preview database so the user's PWA sees them.

Tombstones: when the user archives/deletes/declines an item locally in preview,
its id is recorded in the `tombstones` collection so we never re-import it from
production again.
"""
from __future__ import annotations
import os
import logging
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


async def add_tombstone(db, kind: str, item_id: str) -> None:
    """Record that an item has been deleted/archived locally so prod_sync ignores it."""
    if not item_id:
        return
    try:
        await db.tombstones.update_one(
            {"kind": kind, "id": item_id},
            {"$setOnInsert": {"kind": kind, "id": item_id}},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"prod_sync add_tombstone({kind},{item_id[:8]}) failed: {e}")


async def _load_tombstones(db, kind: str) -> set:
    out = set()
    try:
        async for t in db.tombstones.find({"kind": kind}, {"id": 1, "_id": 0}):
            tid = t.get("id")
            if tid:
                out.add(tid)
    except Exception as e:
        logger.warning(f"prod_sync load_tombstones({kind}) failed: {e}")
    return out


async def run_sync(db) -> dict:
    """Pull new requests / appointments / clients from production into preview.

    Returns counts: {requests_added, appointments_added, clients_added}.
    """
    async with httpx.AsyncClient() as client:
        prod_requests = await _get_json(client, "/api/requests")
        prod_appts = await _get_json(client, "/api/appointments")
        prod_clients = await _get_json(client, "/api/clients-db?limit=2000")

    # Tombstones (local deletions/archives we should never re-import)
    tomb_req = await _load_tombstones(db, "request")
    tomb_appt = await _load_tombstones(db, "appointment")
    tomb_cli = await _load_tombstones(db, "client")

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
        if not rid or rid in preview_req_ids or rid in tomb_req:
            continue
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
        if not aid or aid in preview_appt_ids or aid in tomb_appt:
            continue
        a.pop("_id", None)
        try:
            await db.appointments.insert_one(a)
            new_appts += 1
        except Exception as e:
            logger.warning(f"prod_sync insert appt {aid[:8]} failed: {e}")

    new_clients = 0
    for c in prod_clients:
        cid = c.get("id")
        if not cid or cid in preview_client_ids or cid in tomb_cli:
            continue
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
