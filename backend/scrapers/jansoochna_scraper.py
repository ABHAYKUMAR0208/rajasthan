"""
jansoochna_scraper.py — Scraper for jansoochna.rajasthan.gov.in/Scheme
Jan Soochna Portal is Angular-rendered. We try:
  1. Direct API calls to the JSP backend API (fastest, most reliable)
  2. Playwright browser automation (if API fails)
  3. Static fallback data (if both fail)
"""

import re
import json
import logging
import requests
from datetime import datetime, timezone
from bs4 import BeautifulSoup

log = logging.getLogger("scraper.jansoochna")

BASE_URL = "https://jansoochna.rajasthan.gov.in"
# JSP exposes internal Angular API endpoints
API_ENDPOINTS = [
    f"{BASE_URL}/api/Scheme/getAllScheme",
    f"{BASE_URL}/api/Scheme/getSchemeList",
    f"{BASE_URL}/api/scheme/list",
    f"{BASE_URL}/SchemeList",
]
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": BASE_URL,
    "Origin": BASE_URL,
}

DEPT_CATEGORIES = {
    r"social justice|palanhar|pension|widow|disabled": "Social Welfare",
    r"health|medical|ayushman|chiranjeevi|dawa": "Health & Medical",
    r"agriculture|kisan|fasal|crop": "Agriculture",
    r"food|ration|pds|fps|nfsa": "Food & Civil Supplies",
    r"labour|labor|worker": "Labour",
    r"education|school|scholarship": "Education",
    r"mgnrega|rural|panchayat": "Rural Development",
    r"doit|e-mitra|emitra": "Digital Services",
    r"mining|dmft": "Mining",
    r"revenue|jamabandi": "Revenue",
    r"electricity|vidyut|power": "Energy",
    r"water|jal|jjm": "Water & Sanitation",
    r"jan aadhaar|bhamashah": "Identity & Social Security",
}


def _get_category(name: str) -> str:
    name_lower = name.lower()
    for pattern, cat in DEPT_CATEGORIES.items():
        if re.search(pattern, name_lower, re.I):
            return cat
    return "General Services"


def _try_api(session: requests.Session) -> list[dict] | None:
    """Try known JSP API endpoints to get scheme list as JSON."""
    for endpoint in API_ENDPOINTS:
        try:
            log.info("Trying JSP API: %s", endpoint)
            r = session.get(endpoint, headers=HEADERS, timeout=10, verify=False)
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list) and len(data) > 0:
                    log.info("JSP API success: %d items from %s", len(data), endpoint)
                    return data
                if isinstance(data, dict) and ("data" in data or "schemes" in data):
                    items = data.get("data") or data.get("schemes") or []
                    if items:
                        log.info("JSP API success: %d items from %s", len(items), endpoint)
                        return items
        except Exception as e:
            log.debug("JSP API endpoint %s failed: %s", endpoint, e)
    return None


def _try_playwright(limit: int = 50) -> list[dict] | None:
    """Try Playwright to render the Angular page."""
    try:
        from playwright.sync_api import sync_playwright
        log.info("Launching Playwright for Jan Soochna Portal...")
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(
                user_agent=HEADERS["User-Agent"],
                extra_http_headers={"Accept-Language": "en-IN,en;q=0.9"},
            )
            page.goto(f"{BASE_URL}/Scheme", timeout=30000)
            # Wait for Angular to render scheme tiles
            page.wait_for_selector("a[href*='/Services?q=']", timeout=20000)
            html = page.content()
            browser.close()

        soup = BeautifulSoup(html, "html.parser")
        tile_links = soup.find_all("a", href=re.compile(r"/Services\?q="))
        schemes = []
        for i, anchor in enumerate(tile_links[:limit]):
            raw_text = anchor.get_text(separator=" ", strip=True)
            name = re.sub(r"^\d+\s*[.)]\s*", "", raw_text).strip()
            name = re.sub(r"\s+", " ", name).strip()
            if not name or len(name) < 3:
                continue
            href = anchor.get("href", "")
            schemes.append({
                "position": i + 1,
                "SchemeName": name,
                "SchemeURL": f"{BASE_URL}{href}" if href else "",
            })
        log.info("Playwright: found %d schemes", len(schemes))
        return schemes if schemes else None
    except ImportError:
        log.warning("Playwright not installed — skipping")
        return None
    except Exception as e:
        log.error("Playwright failed: %s", e)
        return None


def _normalise_item(raw: dict, index: int, ts: str) -> dict:
    """Normalise a raw JSP item (from API or Playwright) to dashboard format."""
    name = (
        raw.get("SchemeName") or raw.get("scheme_name") or
        raw.get("name") or raw.get("SchemeTitle") or f"Scheme {index+1}"
    )
    url = (
        raw.get("SchemeURL") or raw.get("detail_url") or
        raw.get("url") or ""
    )
    dept = raw.get("DepartmentName") or raw.get("department") or ""
    category = _get_category(name + " " + dept)

    return {
        "id": f"jsp_{index+1}",
        "name": name.strip(),
        "category": category,
        "department": dept,
        "url": url,
        "description": raw.get("description") or raw.get("SchemeDescription") or f"Jan Soochna Portal scheme: {name}",
        "beneficiary_count": raw.get("beneficiary_count") or raw.get("BeneficiaryCount") or "",
        "status": "Active",
        "source": "jansoochna.rajasthan.gov.in",
        "scraped_at": ts,
    }


def scrape_jansoochna() -> list[dict]:
    log.info("Scraping Jan Soochna Portal...")
    session = requests.Session()
    ts = datetime.now(timezone.utc).isoformat()

    # Strategy 1: Try API endpoints
    raw_items = _try_api(session)

    # Strategy 2: Try Playwright
    if not raw_items:
        raw_items = _try_playwright()

    # Strategy 3: Fallback
    if not raw_items:
        log.warning("All JSP scrape methods failed — using fallback data")
        return _fallback_jansoochna()

    result = [_normalise_item(item, i, ts) for i, item in enumerate(raw_items)]
    log.info("Jan Soochna: %d schemes scraped", len(result))
    return result


def _fallback_jansoochna() -> list[dict]:
    ts = datetime.now(timezone.utc).isoformat()
    schemes = [
        ("Jan Aadhaar", "Identity & Social Security", "Dept. of Planning"),
        ("Chiranjeevi Health Insurance", "Health & Medical", "Dept. of Health"),
        ("Mukhyamantri Nishulk Dawa Yojana", "Health & Medical", "Dept. of Health"),
        ("Palanhar Yojana", "Social Welfare", "Dept. of Social Justice"),
        ("Social Security Pension", "Social Welfare", "Dept. of Social Justice"),
        ("MGNREGA Rajasthan", "Rural Development", "Dept. of Rural Dev."),
        ("PM Kisan Samman Nidhi", "Agriculture", "Dept. of Agriculture"),
        ("PM Awas Yojana Gramin", "Rural Development", "Dept. of Rural Dev."),
        ("Food Security (NFSA)", "Food & Civil Supplies", "Dept. of Food"),
        ("Scholarship Schemes (SC/ST)", "Education", "Dept. of Education"),
        ("Shramik Card / Labour Scheme", "Labour", "Dept. of Labour"),
        ("Rajasthan Sampark", "Digital Services", "DoIT&C"),
        ("E-Mitra Services", "Digital Services", "DoIT&C"),
        ("Mining DMFT", "Mining", "Dept. of Mines"),
        ("Bhamashah Rozgar Srijan Scheme", "Labour", "Dept. of Labour"),
        ("Indira Rasoi Yojana", "Food & Civil Supplies", "Dept. of Food"),
        ("Jal Jeevan Mission", "Water & Sanitation", "PHED"),
        ("Swachh Bharat Mission", "Water & Sanitation", "Dept. of PR"),
        ("PM Ujjwala Yojana", "Social Welfare", ""),
        ("Ayushman Bharat PMJAY", "Health & Medical", "Dept. of Health"),
    ]
    return [
        {
            "id": f"jsp_{i+1}",
            "name": name,
            "category": cat,
            "department": dept,
            "url": f"{BASE_URL}/Scheme",
            "description": f"Available on Jan Soochna Portal — {cat}",
            "beneficiary_count": "",
            "status": "Active",
            "source": "jansoochna.rajasthan.gov.in (fallback)",
            "scraped_at": ts,
        }
        for i, (name, cat, dept) in enumerate(schemes)
    ]
