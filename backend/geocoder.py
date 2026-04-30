"""Address geocoding helper using Nominatim (OpenStreetMap) — free, no API key.

Caches results in MongoDB collection `geocode_cache` to avoid hammering the
Nominatim public API and to respect their fair-use policy (1 req/sec max).
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Gexia360/1.0 (lavagedevitreboisfranc@live.com)"
TIMEOUT_S = 8


async def geocode(db, address: str) -> Optional[tuple[float, float]]:
    """Return (lat, lon) for an address. Caches in MongoDB. Returns None on failure."""
    if not address or not isinstance(address, str):
        return None
    address = address.strip()
    if not address:
        return None

    # Check cache
    try:
        cached = await db.geocode_cache.find_one({"address": address})
        if cached:
            if cached.get("lat") is not None and cached.get("lon") is not None:
                return (float(cached["lat"]), float(cached["lon"]))
            else:
                # Negative cache entry (no result found) — return None silently
                return None
    except Exception as e:
        logger.warning(f"geocode cache read failed: {e}")

    # Hit Nominatim
    coords: Optional[tuple[float, float]] = None
    try:
        params = {
            "q": address,
            "format": "json",
            "limit": 1,
            "countrycodes": "ca",  # Bias towards Canada (Quebec)
            "addressdetails": 0,
        }
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=TIMEOUT_S, headers=headers) as client:
            r = await client.get(NOMINATIM_URL, params=params)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and data:
                    first = data[0]
                    try:
                        coords = (float(first["lat"]), float(first["lon"]))
                    except Exception:
                        coords = None
    except Exception as e:
        logger.warning(f"geocode nominatim failed for '{address}': {e}")

    # Cache (positive or negative) so we don't retry repeatedly
    try:
        await db.geocode_cache.update_one(
            {"address": address},
            {
                "$set": {
                    "address": address,
                    "lat": coords[0] if coords else None,
                    "lon": coords[1] if coords else None,
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"geocode cache write failed: {e}")

    # Throttle to respect Nominatim 1 req/sec policy
    await asyncio.sleep(1.05)
    return coords
