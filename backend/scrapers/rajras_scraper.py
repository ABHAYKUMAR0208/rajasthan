"""
rajras_scraper.py — Live scraper for rajras.in/ras/pre/rajasthan/adm/schemes/
Extracts all Rajasthan government schemes grouped by sector.
Static WordPress site — uses requests + BeautifulSoup (no JS needed).
"""

import re
import logging
import requests
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup, Tag

log = logging.getLogger("scraper.rajras")

INDEX_URL = "https://rajras.in/ras/pre/rajasthan/adm/schemes/"
BASE_URL = "https://rajras.in"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
}

NAV_LINK_SKIP = re.compile(
    r"^(home|about|contact|privacy|terms|login|register|menu|search|"
    r"download|read more|click here|back|next|previous|sitemap)$",
    re.I,
)

SECTOR_MAP = {
    r"agriculture|agri|farming|crop|kisan|farmer|horticulture|food grain|animal|dairy|fisheri|cooperat": "Agriculture & Allied",
    r"health|medical|nutrition|ayush|medicine|sanitation|swachh": "Health & Sanitation",
    r"education|school|scholarsh|student|literacy|skill|training|vocational": "Education & Skills",
    r"social|pension|widow|disabled|specially.abled|SC|ST|OBC|minority|welfare|women|child|mahila": "Social Welfare",
    r"labour|worker|employment|unemployment|rozgar|job": "Labour & Employment",
    r"rural|panchayat|MGNREGA|village": "Rural Development",
    r"urban|housing|smart city|municipal": "Urban Development",
    r"industry|MSME|enterprise|startup|entrepreneur|business|invest": "Industry & Commerce",
    r"energy|solar|renewable|electricity|power": "Energy",
    r"water|irrigation|dam|canal": "Water & Irrigation",
    r"forest|environment|wildlife|ecology": "Environment",
    r"transport|road|highway|railway": "Transport",
    r"digital|IT|e-governance|technology|cyber": "Digital & IT",
    r"tourism|heritage|art|culture": "Tourism & Culture",
}


def _clean_name(text: str) -> str:
    text = re.sub(r"^\d+[.)]\s*", "", text.strip())
    text = re.sub(r"^\*+\s*", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _normalise_sector(raw: str) -> str:
    raw_lower = raw.lower()
    for pattern, canonical in SECTOR_MAP.items():
        if re.search(pattern, raw_lower, re.I):
            return canonical
    return raw.strip().rstrip(":") or "General"


def _is_scheme_link(href: str, name: str) -> bool:
    if not href or not name:
        return False
    if href.startswith(("#", "javascript", "mailto", "tel")):
        return False
    if NAV_LINK_SKIP.match(name.strip()):
        return False
    parsed = urlparse(href if href.startswith("http") else f"https://rajras.in{href}")
    if parsed.netloc and "rajras.in" not in parsed.netloc:
        return False
    if parsed.path in ("", "/", "/ras/pre/rajasthan/adm/schemes/"):
        return False
    if len(name.strip()) < 4:
        return False
    return True


def _parse_index_page(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    schemes = []

    content = (
        soup.find(class_="entry-content")
        or soup.find(id="content")
        or soup.find("article")
        or soup.find("main")
        or soup
    )

    current_sector = "General"
    current_subsector = ""

    for element in content.children:
        if not isinstance(element, Tag):
            continue
        tag = element.name

        if tag == "h2":
            text = element.get_text(strip=True).rstrip(":")
            if text and len(text) > 2:
                current_sector = _normalise_sector(text)
                current_subsector = ""
            continue

        if tag in ("h3", "h4"):
            text = element.get_text(strip=True).rstrip(":")
            if text and len(text) > 2:
                current_subsector = text
            continue

        if tag in ("ul", "ol"):
            for li in element.find_all("li", recursive=False):
                a_tag = li.find("a", href=True)
                if a_tag:
                    href = a_tag.get("href", "")
                    name = _clean_name(a_tag.get_text(strip=True))
                    if _is_scheme_link(href, name):
                        schemes.append({
                            "name": name,
                            "sector": current_sector,
                            "subsector": current_subsector,
                            "url": urljoin(BASE_URL, href),
                            "has_article": True,
                        })
                else:
                    name = _clean_name(li.get_text(strip=True))
                    if name and len(name) >= 4:
                        schemes.append({
                            "name": name,
                            "sector": current_sector,
                            "subsector": current_subsector,
                            "url": "",
                            "has_article": False,
                        })

    return schemes


def scrape_rajras() -> list[dict]:
    log.info("Fetching RajRAS index: %s", INDEX_URL)
    try:
        resp = requests.get(INDEX_URL, headers=HEADERS, timeout=15, verify=False)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch RajRAS: %s", e)
        return _fallback_rajras()

    raw_schemes = _parse_index_page(resp.text)
    if not raw_schemes:
        log.warning("RajRAS: No schemes parsed, using fallback")
        return _fallback_rajras()

    ts = datetime.now(timezone.utc).isoformat()
    result = []
    for i, s in enumerate(raw_schemes):
        result.append({
            "id": f"rajras_{i+1}",
            "name": s["name"],
            "category": s["sector"],
            "subcategory": s.get("subsector", ""),
            "url": s.get("url", ""),
            "has_article": s.get("has_article", False),
            "description": f"Rajasthan government scheme under {s['sector']}",
            "status": "Active",
            "source": "rajras.in",
            "scraped_at": ts,
        })

    log.info("RajRAS: found %d schemes", len(result))
    return result


def _fallback_rajras() -> list[dict]:
    ts = datetime.now(timezone.utc).isoformat()
    schemes = [
        ("Palanhar Yojana", "Social Welfare", "https://rajras.in/palanhar-yojana/"),
        ("Mukhyamantri Rajshri Yojana", "Education & Skills", "https://rajras.in/rajshri-yojana/"),
        ("Bhamashah Health Insurance Scheme", "Health & Sanitation", ""),
        ("Rajasthan Kisan Samman Nidhi", "Agriculture & Allied", ""),
        ("Chiranjeevi Health Insurance Scheme", "Health & Sanitation", "https://rajras.in/chiranjeevi/"),
        ("Free Electricity Scheme for Farmers", "Energy", ""),
        ("Indira Gandhi Urban Credit Card", "Industry & Commerce", ""),
        ("Mukhyamantri Anuprati Coaching Scheme", "Education & Skills", ""),
        ("Rajasthan MSME Promotion Scheme", "Industry & Commerce", ""),
        ("Pradhan Mantri Awas Yojana (Rural)", "Rural Development", ""),
        ("Mukhyamantri Nishulk Dawa Yojana", "Health & Sanitation", ""),
        ("Rajasthan Agricultural Processing", "Agriculture & Allied", ""),
        ("MGNREGA Rajasthan", "Rural Development", ""),
        ("Old Age Pension Scheme", "Social Welfare", ""),
        ("Ladli Laxmi Yojana", "Social Welfare", ""),
    ]
    return [
        {
            "id": f"rajras_{i+1}",
            "name": name,
            "category": cat,
            "subcategory": "",
            "url": url,
            "has_article": bool(url),
            "description": f"Rajasthan government scheme under {cat}",
            "status": "Active",
            "source": "rajras.in (fallback)",
            "scraped_at": ts,
        }
        for i, (name, cat, url) in enumerate(schemes)
    ]
