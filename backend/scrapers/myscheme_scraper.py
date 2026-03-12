"""
myscheme_scraper.py — Scraper for myscheme.gov.in (Rajasthan filter)
MyScheme.gov.in has a public REST API. We call it directly.
"""

import re
import logging
import requests
from datetime import datetime, timezone
from urllib.parse import urljoin

log = logging.getLogger("scraper.myscheme")

BASE_URL = "https://www.myscheme.gov.in"

# MyScheme public API endpoints (confirmed active)
API_SEARCH = "https://api.myscheme.gov.in/search/v4/schemes"
API_STATE  = "https://api.myscheme.gov.in/search/v4/schemes?lang=en&q=&from=0&size=50&filters=state:Rajasthan"

# Fallback: scrape the search results page
SEARCH_URL = f"{BASE_URL}/search/state/Rajasthan"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Origin": BASE_URL,
    "Referer": SEARCH_URL,
}

CATEGORY_MAP = {
    r"health|medical|ayush|hospital": "Health",
    r"education|school|scholarsh|student": "Education",
    r"agriculture|kisan|farm|crop": "Agriculture",
    r"social|welfare|pension|widow|disable": "Social Welfare",
    r"women|mahila|girl|beti": "Women & Child",
    r"labour|worker|employment|rozgar": "Labour & Employment",
    r"business|msme|startup|enterprise|loan": "Business & Finance",
    r"housing|awas|shelter": "Housing",
    r"energy|solar|electricity": "Energy",
    r"skill|training|vocational": "Skill Development",
    r"water|sanitation|swachh": "Water & Sanitation",
    r"rural|village|panchayat": "Rural Development",
    r"digital|it|technology": "Digital Services",
    r"transport|road": "Transport",
}


def _get_category(title: str, tags: list) -> str:
    combined = (title + " " + " ".join(tags or [])).lower()
    for pattern, cat in CATEGORY_MAP.items():
        if re.search(pattern, combined, re.I):
            return cat
    return "General"


def _try_official_api(session: requests.Session) -> list[dict] | None:
    """Try the MyScheme official search API with Rajasthan state filter."""
    api_variants = [
        "https://api.myscheme.gov.in/search/v4/schemes?lang=en&q=rajasthan&from=0&size=100&filters=state:Rajasthan",
        "https://api.myscheme.gov.in/search/v4/schemes?lang=en&q=&from=0&size=100&filters=state:Rajasthan",
        "https://api.myscheme.gov.in/search/v3/schemes?lang=en&from=0&size=50&state=Rajasthan",
        "https://api.myscheme.gov.in/schemes?state=Rajasthan&limit=50",
    ]
    for url in api_variants:
        try:
            log.info("Trying MyScheme API: %s", url[:80])
            r = session.get(url, headers=HEADERS, timeout=12, verify=False)
            if r.status_code == 200:
                data = r.json()
                # Handle various response shapes
                hits = (
                    data.get("hits", {}).get("hits") or
                    data.get("schemes") or
                    data.get("data") or
                    (data if isinstance(data, list) else None)
                )
                if hits and len(hits) > 0:
                    log.info("MyScheme API success: %d schemes", len(hits))
                    return hits
        except Exception as e:
            log.debug("MyScheme API %s failed: %s", url[:60], e)
    return None


def _try_scrape_page(session: requests.Session) -> list[dict] | None:
    """Scrape the MyScheme search results HTML page."""
    try:
        log.info("Scraping MyScheme page: %s", SEARCH_URL)
        r = session.get(SEARCH_URL, headers={**HEADERS, "Accept": "text/html"}, timeout=15, verify=False)
        r.raise_for_status()
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(r.text, "html.parser")

        # Try to find JSON data embedded in the page (Next.js / SSR)
        scripts = soup.find_all("script", {"id": re.compile(r"__NEXT_DATA__|__NUXT__", re.I)})
        for script in scripts:
            try:
                data = json.loads(script.string or "")
                # Navigate nested JSON to find schemes
                schemes = _dig_for_schemes(data)
                if schemes:
                    log.info("Found %d schemes in page script tag", len(schemes))
                    return schemes
            except Exception:
                pass

        # Try scheme cards directly in HTML
        cards = soup.select(".scheme-card, .card, [class*='scheme'], [class*='card']")
        if cards:
            items = []
            for card in cards[:50]:
                title_el = card.find(["h2", "h3", "h4", "strong"])
                if title_el:
                    items.append({"title": title_el.get_text(strip=True)})
            if items:
                return items
        return None
    except Exception as e:
        log.error("MyScheme page scrape failed: %s", e)
        return None


import json


def _dig_for_schemes(data: dict | list, depth: int = 0) -> list | None:
    """Recursively search JSON for a list that looks like schemes."""
    if depth > 6:
        return None
    if isinstance(data, list) and len(data) > 3:
        if any(isinstance(i, dict) and ("title" in i or "schemeName" in i or "name" in i) for i in data):
            return data
    if isinstance(data, dict):
        for key in ["schemes", "hits", "results", "data", "items", "schemeList"]:
            val = data.get(key)
            if val:
                result = _dig_for_schemes(val, depth + 1)
                if result:
                    return result
        for val in data.values():
            if isinstance(val, (dict, list)):
                result = _dig_for_schemes(val, depth + 1)
                if result:
                    return result
    return None


def _normalise_item(raw: dict, index: int, ts: str) -> dict:
    """Normalise a raw MyScheme API item."""
    # Handle Elasticsearch _source wrapping
    source = raw.get("_source", raw)

    title = (
        source.get("schemeName") or source.get("title") or
        source.get("name") or source.get("schemeTitle") or
        source.get("SchemeTitle") or f"Scheme {index+1}"
    )
    slug = source.get("slug") or source.get("schemeSlug") or ""
    url = f"{BASE_URL}/schemes/{slug}" if slug else BASE_URL

    tags = source.get("tags") or source.get("beneficiaryType") or []
    if isinstance(tags, str):
        tags = [tags]

    ministry = source.get("nodalMinistryName") or source.get("ministry") or source.get("department") or ""
    description = source.get("briefDescription") or source.get("description") or source.get("objective") or ""
    category = _get_category(title, tags)

    return {
        "id": f"myscheme_{index+1}",
        "name": title.strip(),
        "category": category,
        "ministry": ministry,
        "tags": tags[:5],
        "url": url,
        "description": (description[:250] + "...") if len(description) > 250 else description,
        "status": "Active",
        "source": "myscheme.gov.in",
        "scraped_at": ts,
    }


def scrape_myscheme() -> list[dict]:
    log.info("Scraping MyScheme Rajasthan...")
    session = requests.Session()
    ts = datetime.now(timezone.utc).isoformat()

    # Strategy 1: Official API
    raw_items = _try_official_api(session)

    # Strategy 2: Page scrape
    if not raw_items:
        raw_items = _try_scrape_page(session)

    if not raw_items:
        log.warning("MyScheme: all strategies failed — using fallback")
        return _fallback_myscheme()

    result = [_normalise_item(item, i, ts) for i, item in enumerate(raw_items)]
    log.info("MyScheme: %d Rajasthan schemes", len(result))
    return result


def _fallback_myscheme() -> list[dict]:
    ts = datetime.now(timezone.utc).isoformat()
    schemes = [
        ("PM Kisan Samman Nidhi", "Agriculture", "Ministry of Agriculture", "farmers, income support"),
        ("Ayushman Bharat PM-JAY", "Health", "Ministry of Health", "health insurance, BPL"),
        ("PM Awas Yojana Gramin", "Housing", "Ministry of Rural Development", "housing, rural"),
        ("MGNREGA", "Labour & Employment", "Ministry of Rural Development", "employment, rural"),
        ("PM Ujjwala Yojana", "Social Welfare", "Ministry of Petroleum", "LPG, women, BPL"),
        ("Sukanya Samriddhi Yojana", "Women & Child", "Ministry of Finance", "girl child, savings"),
        ("PM Jan Dhan Yojana", "General", "Ministry of Finance", "banking, financial inclusion"),
        ("Scholarship for SC/ST Students", "Education", "Ministry of Education", "scholarship, SC, ST"),
        ("PM Fasal Bima Yojana", "Agriculture", "Ministry of Agriculture", "crop insurance"),
        ("Soil Health Card Scheme", "Agriculture", "Ministry of Agriculture", "soil, farmers"),
        ("National Apprenticeship Promotion", "Skill Development", "Ministry of Skill Dev.", "training, youth"),
        ("PM SVANidhi (Street Vendor Loan)", "Business & Finance", "Ministry of Housing", "loan, vendor"),
        ("Stand-Up India", "Business & Finance", "Ministry of Finance", "SC, ST, women, loan"),
        ("PM Mudra Yojana", "Business & Finance", "Ministry of Finance", "MSME, loan, business"),
        ("Atal Pension Yojana", "Social Welfare", "Ministry of Finance", "pension, workers"),
        ("Jal Jeevan Mission", "Water & Sanitation", "Ministry of Jal Shakti", "water, rural"),
        ("PM Poshan (Mid-Day Meal)", "Education", "Ministry of Education", "children, nutrition"),
        ("National Social Assistance Programme", "Social Welfare", "Ministry of Rural Dev.", "pension, widow"),
        ("PM Rozgar Protsahan Yojana", "Labour & Employment", "Ministry of Labour", "employment, EPF"),
        ("Digital India Scheme", "Digital Services", "Ministry of IT", "digital, internet"),
    ]
    return [
        {
            "id": f"myscheme_{i+1}",
            "name": name,
            "category": cat,
            "ministry": ministry,
            "tags": tags.split(", "),
            "url": BASE_URL,
            "description": f"Central government scheme available for Rajasthan — {cat}",
            "status": "Active",
            "source": "myscheme.gov.in (fallback)",
            "scraped_at": ts,
        }
        for i, (name, cat, ministry, tags) in enumerate(schemes)
    ]
