"""
main.py — FastAPI backend for Rajasthan AI Chief of Staff Dashboard
Scrapes 4 live sites and exposes REST API endpoints.
"""

import asyncio
import logging
import time
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scrapers.igod_scraper import scrape_igod
from scrapers.rajras_scraper import scrape_rajras
from scrapers.jansoochna_scraper import scrape_jansoochna
from scrapers.myscheme_scraper import scrape_myscheme

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dashboard.api")

app = FastAPI(
    title="Rajasthan Dashboard API",
    description="Live scraper for 4 Rajasthan government websites",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory cache: source_id → {data, scraped_at, status}
_cache: dict = {}


def _cache_entry(source_id: str, data: dict | list, status: str = "ok", error: str = ""):
    _cache[source_id] = {
        "source_id": source_id,
        "data": data,
        "status": status,
        "error": error,
        "scraped_at": datetime.utcnow().isoformat() + "Z",
    }


async def _run_scraper(source_id: str, fn):
    """Run a scraper function, update cache, return result."""
    log.info("Starting scrape: %s", source_id)
    start = time.time()
    try:
        data = await asyncio.to_thread(fn)
        elapsed = round(time.time() - start, 2)
        log.info("Done: %s  (%.2fs, %d items)", source_id, elapsed, len(data) if isinstance(data, list) else 1)
        _cache_entry(source_id, data, status="ok")
        return _cache[source_id]
    except Exception as exc:
        log.error("Error scraping %s: %s", source_id, exc, exc_info=True)
        _cache_entry(source_id, [], status="error", error=str(exc))
        return _cache[source_id]


SCRAPERS = {
    "igod":        scrape_igod,
    "rajras":      scrape_rajras,
    "jansoochna":  scrape_jansoochna,
    "myscheme":    scrape_myscheme,
}


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Rajasthan Dashboard API", "endpoints": ["/scrape/all", "/scrape/{source}", "/data/{source}", "/status"]}


@app.get("/status")
def status():
    return {
        "sources": {
            sid: {
                "status": _cache.get(sid, {}).get("status", "not_scraped"),
                "scraped_at": _cache.get(sid, {}).get("scraped_at"),
                "count": len(_cache[sid]["data"]) if sid in _cache and isinstance(_cache[sid]["data"], list) else 0,
            }
            for sid in SCRAPERS
        }
    }


@app.post("/scrape/all")
async def scrape_all():
    """Scrape all 4 sources in parallel."""
    log.info("Scraping all 4 sources in parallel...")
    tasks = [_run_scraper(sid, fn) for sid, fn in SCRAPERS.items()]
    results = await asyncio.gather(*tasks)
    return {
        "message": "Scrape complete",
        "results": {r["source_id"]: {"status": r["status"], "count": len(r["data"]) if isinstance(r["data"], list) else 1} for r in results},
    }


@app.post("/scrape/{source_id}")
async def scrape_one(source_id: str):
    """Scrape a single source by ID."""
    if source_id not in SCRAPERS:
        raise HTTPException(404, f"Unknown source: {source_id}. Valid: {list(SCRAPERS)}")
    result = await _run_scraper(source_id, SCRAPERS[source_id])
    return result


@app.get("/data/{source_id}")
def get_data(source_id: str, limit: Optional[int] = None):
    """Get cached scraped data for a source."""
    if source_id not in SCRAPERS:
        raise HTTPException(404, f"Unknown source: {source_id}")
    if source_id not in _cache:
        raise HTTPException(404, f"No data yet for {source_id}. Run /scrape/{source_id} first.")
    entry = _cache[source_id]
    data = entry["data"]
    if limit and isinstance(data, list):
        data = data[:limit]
    return {**entry, "data": data}


@app.get("/data")
def get_all_data():
    """Get all cached data from all sources."""
    return {sid: _cache.get(sid, {"status": "not_scraped", "data": []}) for sid in SCRAPERS}
