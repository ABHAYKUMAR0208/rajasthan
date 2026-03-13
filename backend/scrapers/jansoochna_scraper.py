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
        ("Jan Aadhaar", "Identity & Social Security", "Dept. of Planning",
         "Single-family identity card for accessing all Rajasthan government schemes and benefits.",
         "All Rajasthan families", "https://janaadhaar.rajasthan.gov.in"),
        ("Chiranjeevi Health Insurance", "Health & Medical", "Dept. of Health",
         "Cashless health insurance up to ₹25 lakh/year per family at empanelled hospitals.",
         "All Rajasthan families", "https://chiranjeevi.rajasthan.gov.in"),
        ("Mukhyamantri Nishulk Dawa Yojana", "Health & Medical", "Dept. of Health",
         "Free medicines and diagnostics at all government hospitals and dispensaries.",
         "All OPD patients at Govt hospitals", "https://jansoochna.rajasthan.gov.in/Scheme"),
        ("Palanhar Yojana", "Social Welfare", "Dept. of Social Justice",
         "Monthly financial assistance for guardians raising orphaned or destitute children.",
         "Orphaned children, families below poverty line", "https://sje.rajasthan.gov.in/schemes/Palanhar.html"),
        ("Social Security Pension", "Social Welfare", "Dept. of Social Justice",
         "Monthly pension for elderly, widows, and persons with disabilities.",
         "~1 Cr pensioners across Rajasthan", "https://jansoochna.rajasthan.gov.in/Scheme"),
        ("MGNREGA Rajasthan", "Labour", "Dept. of Rural Dev.",
         "100 days guaranteed wage employment per rural household per year.",
         "Active rural workers (varies annually)", "https://nrega.nic.in/Statewisehome.aspx"),
        ("PM Kisan Samman Nidhi", "Agriculture", "Dept. of Agriculture",
         "₹6,000/year direct income support in three equal installments to farmer families.",
         "35 lakh+ farmers in Rajasthan", "https://pmkisan.gov.in"),
        ("PM Awas Yojana Gramin", "Rural Development", "Dept. of Rural Dev.",
         "Financial assistance for construction of pucca houses for rural homeless families.",
         "BPL rural households", "https://pmayg.nic.in"),
        ("Food Security (NFSA)", "Food & Civil Supplies", "Dept. of Food",
         "Subsidised food grains — rice, wheat, pulses at ₹1–₹3/kg through PDS fair price shops.",
         "73 lakh families (LPG + PDS)", "https://food.rajasthan.gov.in"),
        ("Scholarship Schemes (SC/ST)", "Education", "Dept. of Education",
         "Pre-matric and post-matric scholarships for SC/ST/OBC students to support education.",
         "SC/ST/OBC students in Rajasthan", "https://sje.rajasthan.gov.in"),
        ("Shramik Card / Labour Scheme", "Labour", "Dept. of Labour",
         "Construction workers registered under the Building & Other Construction Workers Act get benefits.",
         "Registered construction workers", "https://ldms.rajasthan.gov.in"),
        ("Rajasthan Sampark", "Digital Services", "DoIT&C",
         "Single-window grievance redressal portal for all government departments of Rajasthan.",
         "All Rajasthan citizens", "https://sampark.rajasthan.gov.in"),
        ("E-Mitra Services", "Digital Services", "DoIT&C",
         "Common service centres providing 450+ government services at a single point.",
         "All citizens through 55,000+ kiosks", "https://emitra.rajasthan.gov.in"),
        ("Indira Rasoi Yojana", "Food & Civil Supplies", "Dept. of Food",
         "Subsidised meals at ₹8/plate (increased to ₹17→₹22) at over 1,000 Indira Rasoi centres.",
         "7.17 Cr meals/year, urban poor", "https://indirarasoi.rajasthan.gov.in"),
        ("Jal Jeevan Mission", "Water & Sanitation", "PHED",
         "Functional household tap connections (FHTC) — 55 LPCD target for every rural household.",
         "56% rural HHs connected (as of 2024)", "https://ejalshakti.gov.in"),
        ("Swachh Bharat Mission", "Water & Sanitation", "Dept. of PR",
         "Construction of individual household latrines and community sanitation complexes.",
         "Rural households", "https://sbm.gov.in/sbmGramin"),
        ("PM Ujjwala Yojana", "Social Welfare", "Ministry of Petroleum",
         "Free LPG connections to BPL households — first cylinder and stove also provided.",
         "BPL women household heads", "https://www.pmuy.gov.in"),
        ("Ayushman Bharat PMJAY", "Health & Medical", "Dept. of Health",
         "₹5 lakh health cover for hospitalisation expenses at empanelled public/private hospitals.",
         "Bottom 40% families by income", "https://pmjay.gov.in"),
        ("Mukhyamantri Rajshri Yojana", "Education", "Dept. of Women & Child",
         "₹50,000 total financial incentive in 6 installments for birth and education of girl child.",
         "Girl children born after 1 Jun 2016", "https://wcd.rajasthan.gov.in"),
        ("Annapurna Food Packet Scheme", "Food & Civil Supplies", "Dept. of Food",
         "Free food packet with essential commodities distributed to NFSA beneficiaries monthly.",
         "NFSA beneficiary families", "https://food.rajasthan.gov.in"),
    ]
    return [
        {
            "id": f"jsp_{i+1}",
            "name": name,
            "category": cat,
            "department": dept,
            "description": desc,
            "benefit": benefit,
            "url": url,
            "beneficiary_count": "",
            "status": "Active",
            "source": "jansoochna.rajasthan.gov.in",
            "scraped_at": ts,
        }
        for i, (name, cat, dept, desc, benefit, url) in enumerate(schemes)
    ]