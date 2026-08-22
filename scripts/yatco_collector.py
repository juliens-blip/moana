"""Collecteur YATCO mondial : pagination sur le sitemap officiel des annonces,
puis extraction normalisée depuis chaque page détail servie côté serveur.

Pourquoi le sitemap plutôt que /yachts-for-sale/ ou le widget de recherche :
la recherche live YATCO est protégée par un challenge Cloudflare Turnstile et
son widget de résultats est un composant client signé HMAC (Typesense) sans
données côté serveur. robots.txt interdit /search, /?s=, /*/?* et autorise
explicitement les sitemaps ; les pages détail /yacht/<slug>-<id>/ n'y sont pas
interdites et sont rendues côté serveur. Voir samples/recon_notes.md (S1).
"""

from __future__ import annotations

import argparse
import html as html_module
import json
import logging
import os
import random
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator
from xml.etree import ElementTree as ET

logger = logging.getLogger("yatco_collector")

# ------------------------------------------------------------------
# Sélecteurs et constantes de source — nommés, jamais inline dans le parsing.
# Validés le 2026-08-14 sur une page détail réelle (samples/recon_notes.md).
# ------------------------------------------------------------------
YATCO_BASE_URL = "https://www.yatco.com"
YATCO_SITEMAP_URL = "https://yatco.com/wp-from-offset/Core/0-sitemap-yatco-yachts.xml"

LDJSON_RE = re.compile(
    r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S
)
LOCATION_RE = re.compile(
    r"M15 10\.5a3 3 0 1 1-6 0.*?<span>([^<]+)</span>", re.S
)
BROKER_NAME_RE = re.compile(
    r"M17\.982 18\.725A7\.488.*?<span>([^<]+)</span>", re.S
)
BROKER_COMPANY_RE = re.compile(
    r"M3\.75 21h16\.5M4\.5 3h15M5\.25.*?<span>([^<]+)</span>", re.S
)
MAILTO_RE = re.compile(r'href="mailto:([^"?]+)', re.I)
SPEC_SHEET_RE = re.compile(
    r'href="([^"]+\.pdf)"[^>]*>(?:(?!</a>).)*?(?:spec(?:ification)? sheet|download specs?)',
    re.I | re.S,
)
BROCHURE_URL_RE = re.compile(
    r'name=["\']BrochureUrl["\'][^>]*value=["\']([^"\']+)', re.I
)
MODEL_RE = re.compile(
    r'<span[^>]*>\s*Boat\s+Model\s*</span>\s*<span[^>]*>(.*?)</span>', re.I | re.S
)
CABINS_RE = re.compile(
    r'<span[^>]*>\s*(?:Cabins|Staterooms)\s*</span>\s*<span[^>]*>(.*?)</span>', re.I | re.S
)
STATUS_CLASS_RE = re.compile(r'vessel_status_([a-z0-9_]+)', re.I)
LENGTH_M_RE = re.compile(r"([\d.]+)\s*m", re.I)
EXTERNAL_ID_FROM_URL_RE = re.compile(r"-(\d+)/?$")

# Best-effort pays -> ISO 3166-1 alpha-2. NULL si absent plutôt qu'inventé.
COUNTRY_CODE_MAP = {
    "united states": "US",
    "united kingdom": "GB",
    "france": "FR",
    "italy": "IT",
    "monaco": "MC",
    "spain": "ES",
    "greece": "GR",
    "croatia": "HR",
    "netherlands": "NL",
    "germany": "DE",
    "jamaica": "JM",
    "bahamas": "BS",
    "turkey": "TR",
    "malta": "MT",
    "united arab emirates": "AE",
}

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)


class ConfigurationError(RuntimeError):
    pass


class TransientFetchError(RuntimeError):
    """Erreur réseau ou HTTP transitoire (429/5xx/timeout) — éligible retry."""


def env_str(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


@dataclass(frozen=True)
class Settings:
    """Configuration du collecteur, sans secret en dur.

    OSINT_SSH_KEY, BRAVE_API_KEY et SEARXNG_BASE_URL suivent la convention
    des autres outils OSINT du dépôt (déploiement AWS, repli recherche si le
    sitemap devient indisponible) ; non requis par le chemin sitemap actuel,
    lus depuis l'environnement pour rester alignés avec ce contrat.
    """

    user_agent: str = field(default_factory=lambda: env_str("YATCO_USER_AGENT", DEFAULT_USER_AGENT))
    timeout_s: float = field(default_factory=lambda: env_float("YATCO_TIMEOUT_S", 20.0, 1.0, 120.0))
    max_retries: int = field(default_factory=lambda: env_int("YATCO_MAX_RETRIES", 4, 0, 10))
    backoff_base_s: float = field(default_factory=lambda: env_float("YATCO_BACKOFF_BASE_S", 1.0, 0.1, 30.0))
    backoff_cap_s: float = field(default_factory=lambda: env_float("YATCO_BACKOFF_CAP_S", 30.0, 1.0, 300.0))
    request_delay_s: float = field(default_factory=lambda: env_float("YATCO_REQUEST_DELAY_S", 1.5, 0.0, 60.0))
    page_size: int = field(default_factory=lambda: env_int("YATCO_PAGE_SIZE", 10, 1, 200))

    osint_ssh_key: str | None = field(default_factory=lambda: os.environ.get("OSINT_SSH_KEY") or None)
    brave_api_key: str | None = field(default_factory=lambda: os.environ.get("BRAVE_API_KEY") or None)
    searxng_base_url: str | None = field(default_factory=lambda: os.environ.get("SEARXNG_BASE_URL") or None)


def fetch_url(url: str, settings: Settings) -> str:
    """GET avec User-Agent configurable, timeout explicite et retry/backoff
    borné sur 429/5xx/timeout. Délai respectueux appliqué avant chaque essai.
    """
    headers = {"User-Agent": settings.user_agent, "Accept-Language": "en,fr;q=0.8"}
    attempt = 0
    while True:
        if settings.request_delay_s > 0:
            time.sleep(settings.request_delay_s)
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=settings.timeout_s) as response:
                return response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            transient = exc.code == 429 or 500 <= exc.code < 600
            if not transient or attempt >= settings.max_retries:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt >= settings.max_retries:
                raise
        attempt += 1
        sleep_s = min(settings.backoff_cap_s, settings.backoff_base_s * (2 ** (attempt - 1)))
        sleep_s += random.uniform(0, sleep_s * 0.1)
        logger.warning("fetch retry %s/%s for %s in %.1fs", attempt, settings.max_retries, url, sleep_s)
        time.sleep(sleep_s)


def discover_listing_markup(settings: Settings, sample_url: str, output_dir: Path) -> Path:
    """Reconnaissance : capture un échantillon HTML déterministe d'une page
    détail avant tout figeage de sélecteur. Écrit sous output_dir/samples/.
    """
    html = fetch_url(sample_url, settings)
    output_dir.mkdir(parents=True, exist_ok=True)
    sample_path = output_dir / "discovered_listing_sample.html"
    sample_path.write_text(html, encoding="utf-8")
    logger.info("sample written: %s (%d bytes)", sample_path, len(html))
    return sample_path


def parse_listing(html: str, listing_url: str, source_updated_at: str | None = None) -> dict[str, Any]:
    """Extrait un dict normalisé depuis le HTML d'une page détail YATCO.

    Retourne toujours listing_url ; spec_sheet_url seulement si trouvée.
    Les champs absents à la source restent None (jamais de valeur inventée).
    """
    listing: dict[str, Any] = {
        "source": "yatco",
        "external_id": None,
        "listing_url": listing_url,
        "boat_name": None,
        "builder": None,
        "model": None,
        "model_year": None,
        "length_m": None,
        "cabins": None,
        "listing_status": None,
        "price_amount": None,
        "price_currency": None,
        "country": None,
        "country_code": None,
        "city": None,
        "source_updated_at": source_updated_at,
        "source_created_at": None,
        "broker_name": None,
        "broker_company": None,
        "agent_name": None,
        "agent_email": None,
        "spec_sheet_url": None,
    }

    vehicle = _extract_vehicle_node(html)
    if vehicle:
        listing["boat_name"] = vehicle.get("name")
        brand = vehicle.get("brand")
        if isinstance(brand, dict):
            listing["builder"] = brand.get("name")
        listing["model_year"] = _safe_int(vehicle.get("productionDate"))
        additional_properties = vehicle.get("additionalProperty")
        listing["length_m"] = _extract_length_m(additional_properties)
        listing["cabins"] = _extract_integer_property(additional_properties, ("cabins", "cabin", "staterooms", "bedrooms"))
        listing["listing_status"] = _extract_text_property(additional_properties, ("status", "availability", "condition"))
        offers = vehicle.get("offers")
        if isinstance(offers, dict):
            listing["price_amount"] = _safe_float(offers.get("price"))
            listing["price_currency"] = offers.get("priceCurrency")
            seller = offers.get("seller")
            if isinstance(seller, dict):
                listing["broker_company"] = seller.get("name")
        external_id = vehicle.get("sku") or vehicle.get("mpn")
        if external_id is not None:
            listing["external_id"] = str(external_id)

    if not listing["external_id"]:
        id_match = EXTERNAL_ID_FROM_URL_RE.search(listing_url)
        if id_match:
            listing["external_id"] = id_match.group(1)

    location_match = LOCATION_RE.search(html)
    if location_match:
        parts = [part.strip() for part in location_match.group(1).split(",") if part.strip()]
        if parts:
            listing["city"] = parts[0]
            listing["country"] = parts[-1]
            listing["country_code"] = COUNTRY_CODE_MAP.get(parts[-1].strip().lower())

    broker_names = BROKER_NAME_RE.findall(html)
    broker_companies = BROKER_COMPANY_RE.findall(html)
    if broker_names:
        listing["broker_name"] = broker_names[0].strip()
    if broker_companies and not listing["broker_company"]:
        listing["broker_company"] = broker_companies[0].strip()
    if len(broker_names) > 1:
        listing["agent_name"] = broker_names[1].strip()

    mailto_match = MAILTO_RE.search(html)
    if mailto_match:
        listing["agent_email"] = mailto_match.group(1).strip()

    spec_sheet_match = SPEC_SHEET_RE.search(html)
    if spec_sheet_match:
        listing["spec_sheet_url"] = spec_sheet_match.group(1)

    # Model, cabins and status are rendered in the specification block, not
    # in the public Vehicle JSON-LD node. Brochures can be broker-generated;
    # keep the public YATCO URL separately in listing_url.
    model_match = MODEL_RE.search(html)
    if model_match:
        listing["model"] = _clean_html_text(model_match.group(1)) or listing["model"]

    cabins_match = CABINS_RE.search(html)
    if cabins_match:
        listing["cabins"] = _safe_int(_clean_html_text(cabins_match.group(1)))

    status_match = STATUS_CLASS_RE.search(html)
    if status_match:
        listing["listing_status"] = status_match.group(1).replace("_", " ").title()

    brochure_match = BROCHURE_URL_RE.search(html)
    if brochure_match and not listing["spec_sheet_url"]:
        listing["spec_sheet_url"] = html_module.unescape(brochure_match.group(1)).strip()

    return listing


def _clean_html_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return html_module.unescape(value).strip()


def _extract_vehicle_node(html: str) -> dict[str, Any] | None:
    for match in LDJSON_RE.finditer(html):
        try:
            data = json.loads(match.group(1))
        except json.JSONDecodeError:
            continue
        graph = data.get("@graph") if isinstance(data, dict) else None
        if not isinstance(graph, list):
            continue
        for node in graph:
            if isinstance(node, dict) and node.get("@type") == "Vehicle":
                return node
    return None


def _extract_length_m(additional_properties: Any) -> float | None:
    if not isinstance(additional_properties, list):
        return None
    for prop in additional_properties:
        if isinstance(prop, dict) and prop.get("name") == "Length":
            match = LENGTH_M_RE.search(str(prop.get("value", "")))
            if match:
                return _safe_float(match.group(1))
    return None


def _extract_integer_property(additional_properties: Any, names: tuple[str, ...]) -> int | None:
    if not isinstance(additional_properties, list):
        return None
    wanted = {name.lower() for name in names}
    for prop in additional_properties:
        if not isinstance(prop, dict) or str(prop.get("name", "")).strip().lower() not in wanted:
            continue
        match = re.search(r"\d+", str(prop.get("value", "")))
        if match:
            return int(match.group(0))
    return None


def _extract_text_property(additional_properties: Any, names: tuple[str, ...]) -> str | None:
    if not isinstance(additional_properties, list):
        return None
    wanted = {name.lower() for name in names}
    for prop in additional_properties:
        if not isinstance(prop, dict) or str(prop.get("name", "")).strip().lower() not in wanted:
            continue
        value = str(prop.get("value", "")).strip()
        if value:
            return value
    return None


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def fetch_sitemap_urls(settings: Settings, sitemap_url: str = YATCO_SITEMAP_URL) -> list[dict[str, str]]:
    """Récupère la liste des annonces (url + lastmod) depuis le sitemap
    officiel YATCO, autorisé par robots.txt.
    """
    xml_text = fetch_url(sitemap_url, settings)
    root = ET.fromstring(xml_text)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    entries: list[dict[str, str]] = []
    for url_el in root.findall("sm:url", ns):
        loc_el = url_el.find("sm:loc", ns)
        lastmod_el = url_el.find("sm:lastmod", ns)
        if loc_el is None or not loc_el.text:
            continue
        entries.append({"url": loc_el.text.strip(), "lastmod": (lastmod_el.text.strip() if lastmod_el is not None and lastmod_el.text else None)})
    return entries


class CheckpointStore:
    """Checkpoint atomique par page : une page n'est marquée validée qu'une
    fois entièrement collectée, afin qu'une reprise ne saute ni ne recollecte
    une page déjà validée.
    """

    def __init__(self, path: Path, market: str):
        self.path = path
        self.market = market
        self._pages_done: set[int] = set()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return
        if data.get("market") != self.market:
            return
        self._pages_done = set(data.get("pages_done", []))

    def is_done(self, page_index: int) -> bool:
        return page_index in self._pages_done

    def mark_done(self, page_index: int) -> None:
        self._pages_done.add(page_index)
        self._save()

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"market": self.market, "pages_done": sorted(self._pages_done)}
        tmp_path = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        os.replace(tmp_path, self.path)


def iter_pages(
    entries: list[dict[str, str]],
    settings: Settings,
    checkpoint: CheckpointStore,
    max_pages: int | None = None,
    fetch: Any = fetch_url,
) -> Iterator[tuple[int, list[dict[str, Any]]]]:
    """Pagine sur des lots de `settings.page_size` URLs du sitemap, avec
    déduplication par listing_url et reprise via checkpoint. Chaque page
    n'est marquée faite qu'après extraction complète et réussie du lot.

    Cède `(page_index, listings)` : les pages déjà checkpointées ne sont pas
    cédées du tout (pas de refetch), donc le vrai numéro de page doit
    voyager avec le lot plutôt que dépendre d'un `enumerate()` côté appelant,
    qui décalerait la numérotation après une reprise.
    """
    seen_urls: set[str] = set()
    page_size = settings.page_size
    total_pages = (len(entries) + page_size - 1) // page_size
    page_count = min(total_pages, max_pages) if max_pages is not None else total_pages

    for page_index in range(page_count):
        if checkpoint.is_done(page_index):
            logger.info("page %d already checkpointed, skipping fetch", page_index)
            continue

        batch = entries[page_index * page_size : (page_index + 1) * page_size]
        page_listings: list[dict[str, Any]] = []
        for entry in batch:
            url = entry["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)
            try:
                html = fetch(url, settings)
            except urllib.error.HTTPError as exc:
                # Entrée de sitemap périmée (annonce vendue/retirée) : la
                # source redirige vers une page générique protégée par
                # Cloudflare. On journalise et on saute l'annonce plutôt que
                # d'interrompre toute la page pour une seule URL morte.
                logger.warning("skipping dead sitemap entry %s: %s", url, exc)
                continue
            page_listings.append(parse_listing(html, url, source_updated_at=entry.get("lastmod")))

        # Checkpoint avant le yield : la page est validée dès que sa collecte
        # a réussi, indépendamment de ce que fait l'appelant du résultat
        # (une interruption juste après réception ne doit pas la refaire).
        checkpoint.mark_done(page_index)
        yield page_index, page_listings


def collect(
    settings: Settings,
    output_dir: Path,
    checkpoint_path: Path,
    market: str = "global",
    max_pages: int | None = None,
    sitemap_url: str = YATCO_SITEMAP_URL,
) -> list[Path]:
    """Exécute une collecte, écrit un fichier JSON normalisé par page, et
    renvoie les chemins écrits. Reprenable via checkpoint_path.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = CheckpointStore(checkpoint_path, market=market)
    entries = fetch_sitemap_urls(settings, sitemap_url=sitemap_url)
    written: list[Path] = []
    for page_index, listings in iter_pages(entries, settings, checkpoint, max_pages=max_pages):
        page_path = output_dir / f"page_{page_index:04d}.json"
        page_path.write_text(json.dumps(listings, indent=2, ensure_ascii=False), encoding="utf-8")
        written.append(page_path)
        logger.info("page %d: %d listings -> %s", page_index, len(listings), page_path)
    return written


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    discover_parser = subparsers.add_parser("discover", help="Reconnaissance : capture un échantillon HTML.")
    discover_parser.add_argument("--sample-url", default=f"{YATCO_BASE_URL}/yacht/102-59-azimut-yachts-commercial-vessel-2023-454180/")
    discover_parser.add_argument("--output-dir", type=Path, required=True)

    collect_parser = subparsers.add_parser("collect", help="Collecte paginée avec reprise.")
    collect_parser.add_argument("--output-dir", type=Path, required=True)
    collect_parser.add_argument("--checkpoint-file", type=Path, required=True)
    collect_parser.add_argument("--market", default="global")
    collect_parser.add_argument("--max-pages", type=int, default=None)

    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = _build_arg_parser().parse_args(argv)
    settings = Settings()

    if args.command == "discover":
        discover_listing_markup(settings, args.sample_url, args.output_dir)
    elif args.command == "collect":
        collect(
            settings,
            output_dir=args.output_dir,
            checkpoint_path=args.checkpoint_file,
            market=args.market,
            max_pages=args.max_pages,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
