# Crawl4AI

## État validé — 2026-08-18 (machine Linux actuelle)

- Version stable : `0.9.2`.
- Interpréteur : venv canonique du repo, `.venv/bin/python3` (créé à la racine
  moana, dépendances de `scripts/requirements-kyc.txt` + `pytest`). Le `python3`
  système (3.14) ne contient PAS Crawl4AI — ne jamais l'utiliser directement.
- Software Factory (`dev/software_factory`) résout automatiquement tout
  `python3`/`python` déclaré en `test_commands` vers ce même `.venv` (voir
  `Config.venv_python` dans `workflows/adw_sdlc.py`) — les agents Builder/
  Tester en sont informés en tête de prompt et n'ont pas à en recréer un.

> Note historique : la section précédente référençait un chemin Windows
> (`C:\Users\beatr\...`, `py -3.11`, `rtk py -3.11 ...`) — c'était une autre
> machine, plus d'actualité ici. Sur CE poste, `py` n'existe pas ; toute
> commande `py -3.11 ...` échouera. Utiliser `.venv/bin/python3` (ou activer
> le venv : `source .venv/bin/activate`).

## Maintenance

```bash
.venv/bin/python3 -X utf8 -m pip install --upgrade crawl4ai
.venv/bin/crawl4ai-setup
.venv/bin/crawl4ai-doctor
```

Si le navigateur manque malgré le setup :

```bash
.venv/bin/python3 -m playwright install chromium
```

## CLI

```bash
# Markdown sur stdout
.venv/bin/crwl https://example.com -o markdown

# Sortie transitoire dans le projet
.venv/bin/crwl https://example.com -o markdown -O raw/example.md

# Crawl profond borné
.venv/bin/crwl https://docs.crawl4ai.com --deep-crawl bfs --max-pages 10 -o markdown

# Question/extraction LLM; nécessite la configuration du fournisseur utilisé
.venv/bin/crwl https://example.com/products -q "Extraire les prix des produits"
```

## Python

```python
import asyncio
from crawl4ai import AsyncWebCrawler

async def main():
    async with AsyncWebCrawler() as crawler:
        result = await crawler.arun(url="https://example.com")
        print(result.markdown)

asyncio.run(main())
```

Exécuter un script avec `.venv/bin/python3 script.py`.

## Usage dans ce projet

Cas d’usage principal prévu : enrichissement [[KYC-OSINT]] des nouvelles demandes CRM.

1. Vérifier que le crawl est autorisé par le site et limiter le débit.
2. Écrire les sorties temporaires dans `raw/` uniquement si elles doivent être traitées.
3. Synthétiser les faits durables dans une page wiki existante.
4. Supprimer rapidement le dump brut et tracer l’action dans `log.md`.
5. Ne jamais crawler, stocker ou committer de secrets ou de données personnelles inutiles.

Crawl4AI est épinglé dans `scripts/requirements-kyc.txt`. Le worker cible un conteneur VPS avec Chromium via `Dockerfile.kyc`; Vercel ne réalise plus le crawl.
