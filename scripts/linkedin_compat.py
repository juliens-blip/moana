"""Small compatibility layer for the authenticated ``linkedin-scraper`` package.

The package's browser/session handling is useful, but its bundled selectors lag
behind LinkedIn's current DOM. This module keeps the session handling and uses
stable semantic text/section boundaries for the small amount of public profile
evidence needed by the KYC worker.
"""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin, urlparse


LOGGER = logging.getLogger("moana.kyc.linkedin")
PROFILE_PATH = re.compile(r"^/in/[^/]+/?$", re.IGNORECASE)
AUTH_BLOCKERS = ("/checkpoint", "/authwall", "/challenge", "/uas/login")
STRONG_RATE_MARKERS = ("too many requests", "rate limit", "slow down")
SECTION_HEADINGS = {
    "about",
    "activity",
    "experience",
    "education",
    "skills",
    "interests",
    "accomplishments",
    "featured",
    "recommendations",
}


class LinkedInCompatError(RuntimeError):
    """A safe, non-secret LinkedIn adapter failure."""


def is_profile_url(value: str) -> bool:
    parsed = urlparse(value)
    return (
        parsed.scheme in {"http", "https"}
        and (parsed.hostname or "").lower().endswith("linkedin.com")
        and bool(PROFILE_PATH.match(parsed.path))
    )


def parse_proxy(value: str | None) -> dict[str, str] | None:
    """Turn a ``scheme://user:pass@host:port`` URL into Playwright's proxy dict."""
    if not value or not value.strip():
        return None
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https", "socks5"} or not parsed.hostname:
        raise LinkedInCompatError("Invalid LinkedIn proxy URL")
    port = f":{parsed.port}" if parsed.port else ""
    proxy = {"server": f"{parsed.scheme}://{parsed.hostname}{port}"}
    if parsed.username:
        proxy["username"] = unquote(parsed.username)
    if parsed.password:
        proxy["password"] = unquote(parsed.password)
    return proxy


def normalize_lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]


def _generic_name(value: str) -> bool:
    lowered = value.casefold().strip()
    return (
        not value
        or len(value) > 120
        or "notification" in lowered
        or lowered in SECTION_HEADINGS
        or lowered.startswith(("people who follow", "ad options", "profile enhanced"))
        or "followers" in lowered
    )


def choose_name(headings: list[str], lines: list[str]) -> str:
    for value in headings:
        candidate = re.sub(r"\s+", " ", value).strip()
        if _generic_name(candidate):
            continue
        if 2 <= len(candidate.split()) <= 8:
            return candidate
    for value in lines[:20]:
        candidate = value.strip()
        if not _generic_name(candidate) and 2 <= len(candidate.split()) <= 8:
            return candidate
    return ""


def choose_headline(name: str, lines: list[str]) -> str:
    if not name:
        return ""
    try:
        index = next(index for index, line in enumerate(lines) if line.casefold() == name.casefold())
    except StopIteration:
        return ""
    for candidate in lines[index + 1 : index + 5]:
        lowered = candidate.casefold()
        if (
            candidate
            and "contact info" not in lowered
            and "followers" not in lowered
            and lowered not in SECTION_HEADINGS
        ):
            return candidate[:300]
    return ""


def choose_location(lines: list[str]) -> str:
    for index, line in enumerate(lines[:30]):
        lowered = line.casefold()
        if lowered == "contact info" and index > 0:
            previous_index = index - 1
            while previous_index >= 0 and lines[previous_index].strip() in {"·", "•", "|"}:
                previous_index -= 1
            previous = lines[previous_index].strip() if previous_index >= 0 else ""
            if previous and previous.casefold() not in SECTION_HEADINGS:
                return previous[:180]
        if "contact info" not in lowered:
            continue
        value = re.split(r"\s*[·•]\s*contact info", line, flags=re.IGNORECASE)[0].strip()
        if value and len(value) <= 180:
            return value
    return ""


def extract_about(lines: list[str]) -> str:
    try:
        start = next(index for index, line in enumerate(lines) if line.casefold() == "about") + 1
    except StopIteration:
        return ""
    collected: list[str] = []
    for line in lines[start:]:
        if line.casefold() in {"featured", "activity", "experience", "education", "skills"}:
            break
        collected.append(line)
        if len(" ".join(collected)) >= 1200:
            break
    return " ".join(collected).strip()[:1600]


def parse_experience_lines(lines: list[str]) -> list[dict[str, str]]:
    try:
        start = next(index for index, line in enumerate(lines) if line.casefold() == "experience") + 1
    except StopIteration:
        return []

    items: list[dict[str, str]] = []
    index = start
    while index < len(lines):
        line = lines[index]
        if line.casefold() in {"about", "education", "skills", "interests", "recommendations"}:
            break
        if index + 2 < len(lines) and _looks_like_period(lines[index + 2]):
            items.append(
                {
                    "title": line[:300],
                    "company": lines[index + 1][:300],
                    "period": lines[index + 2][:200],
                }
            )
            index += 3
            continue
        index += 1
    return items[:20]


def _looks_like_period(value: str) -> bool:
    return bool(re.search(r"\b(?:19|20)\d{2}\b|\b(?:present|current)\b", value, re.IGNORECASE))


def strict_rate_limit_message(url: str, body: str, captcha_count: int = 0) -> str:
    lowered_url = url.casefold()
    if any(marker in lowered_url for marker in AUTH_BLOCKERS):
        return "LinkedIn authentication checkpoint detected"
    if captcha_count:
        return "LinkedIn CAPTCHA challenge detected"
    lowered_body = body.casefold()
    if any(marker in lowered_body for marker in STRONG_RATE_MARKERS):
        return "LinkedIn rate limit detected"
    # Do not use the generic phrase 'try again later': it appears in normal ads.
    return ""


async def _page_body(page: Any) -> str:
    try:
        value = await page.locator("main").inner_text(timeout=8_000)
    except Exception:
        value = await page.locator("body").inner_text(timeout=8_000)
    return (value or "").strip()


async def _check_page(page: Any) -> str:
    body = await _page_body(page)
    captcha_count = await page.locator(
        'iframe[title*="captcha" i], iframe[src*="captcha" i]'
    ).count()
    return strict_rate_limit_message(page.url, body, captcha_count)


async def scrape_profile(
    profile_url: str,
    session_path: str,
    timeout_ms: int = 45_000,
    proxy: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Scrape one profile with an explicitly supplied, local browser session."""
    if not is_profile_url(profile_url):
        raise LinkedInCompatError("Invalid LinkedIn profile URL")
    session = Path(session_path).expanduser()
    if not session.is_file():
        raise LinkedInCompatError("LinkedIn session file not found")

    try:
        from linkedin_scraper import BrowserManager
        from linkedin_scraper.core.auth import is_logged_in
    except ImportError as exc:
        raise LinkedInCompatError("linkedin-scraper package is not installed") from exc

    async with BrowserManager(headless=True, slow_mo=25, proxy=proxy) as browser:
        await browser.load_session(str(session))
        page = browser.page
        response = await page.goto(profile_url, wait_until="domcontentloaded", timeout=timeout_ms)
        await page.wait_for_timeout(1_000)
        message = await _check_page(page)
        if message:
            raise LinkedInCompatError(message)
        if response is not None and response.status >= 400:
            raise LinkedInCompatError(f"LinkedIn profile returned HTTP {response.status}")
        if not await is_logged_in(page):
            raise LinkedInCompatError("LinkedIn session is not authenticated")

        lines = normalize_lines(await _page_body(page))
        headings = await page.locator("main h1, main h2").all_inner_texts()
        name = choose_name(headings, lines)
        headline = choose_headline(name, lines)
        location = choose_location(lines)
        about = extract_about(lines)

        experience_url = urljoin(profile_url.rstrip("/") + "/", "details/experience/")
        await page.goto(experience_url, wait_until="domcontentloaded", timeout=timeout_ms)
        await page.wait_for_timeout(750)
        message = await _check_page(page)
        if message:
            raise LinkedInCompatError(message)
        experience_lines = normalize_lines(await _page_body(page))
        experiences = parse_experience_lines(experience_lines)

        evidence_lines = [name, headline, location]
        if about:
            evidence_lines.extend(["About", about])
        if experiences:
            evidence_lines.append("Experience")
            evidence_lines.extend(
                f"{item['title']} — {item['company']} — {item['period']}" for item in experiences
            )
        evidence = "\n".join(line for line in evidence_lines if line).strip()
        if not name or len(evidence) < 20:
            raise LinkedInCompatError("LinkedIn profile returned no attributable content")
        return {
            "url": profile_url,
            "name": name,
            "headline": headline,
            "location": location,
            "about": about,
            "experiences": experiences,
            "text": evidence,
        }


async def scrape_profiles(
    profile_urls: list[str],
    session_path: str,
    max_profiles: int = 1,
    proxy_url: str | None = None,
) -> list[dict[str, Any]]:
    """Scrape at most ``max_profiles`` sequentially; never retry LinkedIn limits."""
    proxy = parse_proxy(proxy_url)
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for profile_url in profile_urls:
        if len(results) >= max_profiles:
            break
        if profile_url in seen or not is_profile_url(profile_url):
            continue
        seen.add(profile_url)
        try:
            results.append(await scrape_profile(profile_url, session_path, proxy=proxy))
        except (LinkedInCompatError, asyncio.TimeoutError) as exc:
            LOGGER.warning("LinkedIn profile skipped: %s", str(exc))
        except Exception as exc:  # pragma: no cover - provider-specific browser failures
            LOGGER.warning("LinkedIn profile failed: %s", exc.__class__.__name__)
    return results
