"""
igod_scraper.py — Live scraper for igod.gov.in/sg/RJ/SPMA/organizations
Extracts the 11 Rajasthan government portals listed in the IGOD directory.
"""

import re
import logging
import requests
from datetime import datetime, timezone
from urllib.parse import urlparse
from bs4 import BeautifulSoup

log = logging.getLogger("scraper.igod")

IGOD_URL = "https://igod.gov.in/sg/RJ/SPMA/organizations"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
}

SKIP_DOMAINS = re.compile(
    r"igod\.gov\.in|india\.gov\.in|data\.gov\.in|guidelines\.india|"
    r"s3waas\.gov\.in|passportindia|(?<!raj\.)nic\.in|meity\.gov\.in|digitalindia|"
    r"karmashree|pareshram|pgt\.dbt|mygov\.in|pmindia|pgportal",
    re.I,
)
SKIP_TEXT = re.compile(
    r"^(home|categories|sectors|contribute|sitemap|about|help|feedback|"
    r"contact|suggest|share|link to us|bookmark|more sites|advanced search|"
    r"passport seva|national portal|open government|digital india|"
    r"national informatics|guidelines for indian|secure.*scalable)$",
    re.I,
)
PORTAL_CATEGORIES = {
    r"jan soochna|jansoochna": "Transparency & RTI",
    r"labour|ldms|worker": "Labour & Employment",
    r"pregnancy|child|pcts|health|medical": "Health & Family Welfare",
    r"pushkar|fair|mela": "Tourism & Culture",
    r"invest|nivesh|rising": "Industry & Investment",
    r"civil registration|pehchan|birth|death": "Civil Registration",
    r"farmer|agri|kisan|rjfr|rjfrc": "Agriculture & Farmers",
    r"recruitment|job|employ": "Recruitment & Employment",
    r"wam|accounts|work account": "Finance & Accounts",
}


def _is_rajasthan_portal(domain: str, name: str) -> bool:
    raj_domain = re.search(
        r"rajasthan\.gov\.in|raj\.nic\.in|rajmedical|agristack\.gov\.in|"
        r"ldms\.raj|pehchan\.raj|rjfr|rjfrc|rajnivesh|pushkarmela|"
        r"jansoochna|rising\.rajasthan|wam\.rajasthan|recruitment\.rajasthan",
        domain, re.I,
    )
    raj_name = re.search(r"rajasthan|raj\b", name, re.I)
    return bool(raj_domain or raj_name)


def _get_category(name: str, domain: str) -> str:
    combined = (name + " " + domain).lower()
    for pattern, cat in PORTAL_CATEGORIES.items():
        if re.search(pattern, combined, re.I):
            return cat
    return "General Government Services"


def _extract_page_last_updated(soup: BeautifulSoup) -> str:
    full_text = soup.get_text(" ")
    match = re.search(
        r"Last\s+Updated\s*[:\-]?\s*\*?\*?([A-Za-z]{3}\s+\d{1,2},?\s+\d{4})\*?\*?",
        full_text, re.I,
    )
    return match.group(1).strip() if match else ""


def _extract_result_count(soup: BeautifulSoup) -> str:
    full_text = soup.get_text(" ")
    match = re.search(r"(\d+)\s+Results?", full_text, re.I)
    return match.group(0).strip() if match else ""


def _fetch_portal_meta(url: str) -> dict:
    try:
        r = requests.get(url, headers=HEADERS, timeout=8, verify=False)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else ""
        meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
        description = meta.get("content", "").strip() if meta else ""
        return {"portal_title": title[:120], "meta_description": description[:300]}
    except Exception as e:
        log.debug("Meta fetch failed for %s: %s", url, e)
        return {"portal_title": "", "meta_description": ""}


def scrape_igod() -> list[dict]:
    log.info("Fetching IGOD directory: %s", IGOD_URL)
    try:
        resp = requests.get(IGOD_URL, headers=HEADERS, timeout=15, verify=False)
        resp.raise_for_status()
    except Exception as e:
        log.error("Failed to fetch IGOD: %s", e)
        # Return known portals as fallback
        return _fallback_igod()

    soup = BeautifulSoup(resp.text, "html.parser")
    page_last_updated = _extract_page_last_updated(soup)
    total_count_text = _extract_result_count(soup)

    main = (
        soup.find(id="main-content")
        or soup.find("main")
        or soup.find(class_=re.compile(r"content|main", re.I))
        or soup
    )

    stop_headings = re.compile(r"new additions|in focus|connect with us|help us", re.I)
    listing_anchors = []
    for element in main.descendants:
        if not hasattr(element, "name"):
            continue
        if element.name in ("h2", "h3", "h4", "h5"):
            if stop_headings.search(element.get_text(strip=True)):
                break
        if element.name == "a" and element.get("href"):
            listing_anchors.append(element)

    seen_urls = set()
    portals = []
    position = 1

    for a_tag in listing_anchors:
        href = a_tag.get("href", "").strip()
        name = a_tag.get_text(strip=True)
        if not href or not name or not href.startswith("http"):
            continue
        if SKIP_DOMAINS.search(href) or SKIP_TEXT.match(name) or len(name) < 5:
            continue
        norm_url = href.rstrip("/").split("#")[0].lower()
        if norm_url in seen_urls:
            continue
        seen_urls.add(norm_url)
        parsed = urlparse(href)
        domain = parsed.netloc.lower()
        if not _is_rajasthan_portal(domain, name):
            continue

        category = _get_category(name, domain)
        portals.append({
            "id": f"igod_{position}",
            "position": position,
            "name": name,
            "url": href,
            "domain": domain,
            "category": category,
            "description": f"Official Rajasthan government portal: {name}",
            "status": "Active",
            "directory_last_updated": page_last_updated,
            "total_portals_listed": total_count_text,
            "source": "igod.gov.in",
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        })
        position += 1

    log.info("IGOD: found %d portals", len(portals))
    if not portals:
        return _fallback_igod()
    return portals


def _fallback_igod() -> list[dict]:
    """Return the known 11 IGOD portals if live fetch fails."""
    known = [
        ("Jan Soochna Portal", "https://jansoochna.rajasthan.gov.in", "Transparency & RTI"),
        ("Labour Dept Management System (LDMS)", "https://ldms.rajasthan.gov.in", "Labour & Employment"),
        ("Pregnancy, Child Tracking & Health (PCTS)", "https://pctsrajmedical.rajasthan.gov.in", "Health & Family Welfare"),
        ("Pushkar Fair", "https://pushkarmela.rajasthan.gov.in", "Tourism & Culture"),
        ("Raj Nivesh Portal", "https://rajnivesh.rajasthan.gov.in", "Industry & Investment"),
        ("Rajasthan Civil Registration System", "https://pehchan.raj.nic.in", "Civil Registration"),
        ("Rajasthan Farmer Registry", "https://rjfr.agristack.gov.in", "Agriculture & Farmers"),
        ("Rajasthan Farmer Registry Camps Portal", "https://rjfrc.rajasthan.gov.in", "Agriculture & Farmers"),
        ("Rajasthan Recruitment Portal", "https://recruitment.rajasthan.gov.in", "Recruitment & Employment"),
        ("Rising Rajasthan Global Investment Summit", "https://rising.rajasthan.gov.in", "Industry & Investment"),
        ("Work Accounts Management System (WAM)", "https://wam.rajasthan.gov.in", "Finance & Accounts"),
    ]
    ts = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": f"igod_{i+1}",
            "position": i + 1,
            "name": name,
            "url": url,
            "domain": url.split("//")[-1].split("/")[0],
            "category": cat,
            "description": f"Official Rajasthan government portal: {name}",
            "status": "Active",
            "source": "igod.gov.in (fallback)",
            "scraped_at": ts,
        }
        for i, (name, url, cat) in enumerate(known)
    ]
