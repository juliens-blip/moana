# Crawl4AI

## État validé — 2026-07-15

- Version stable : `0.9.2`.
- Interpréteur : Python 3.11, `C:\Users\beatr\AppData\Local\Programs\Python\Python311\python.exe`.
- CLI disponibles sur `PATH` : `crwl`, `crawl4ai-setup`, `crawl4ai-doctor`.
- Données locales : `C:\Users\beatr\.crawl4ai`.
- Navigateurs Playwright/Patchright : `C:\Users\beatr\AppData\Local\ms-playwright`.
- `crawl4ai-doctor` et crawl CLI de `https://example.com` réussis.

Le `python` par défaut est Python 3.14 et ne contient pas Crawl4AI. Pour les commandes Python, utiliser explicitement `py -3.11`.

## Maintenance

```powershell
rtk py -3.11 -X utf8 -m pip install --upgrade crawl4ai
rtk crawl4ai-setup
rtk crawl4ai-doctor
```

Si le navigateur manque malgré le setup :

```powershell
rtk py -3.11 -m playwright install chromium
```

## CLI

```powershell
# Markdown sur stdout
rtk crwl https://example.com -o markdown

# Sortie transitoire dans le projet
rtk crwl https://example.com -o markdown -O raw/example.md

# Crawl profond borné
rtk crwl https://docs.crawl4ai.com --deep-crawl bfs --max-pages 10 -o markdown

# Question/extraction LLM; nécessite la configuration du fournisseur utilisé
rtk crwl https://example.com/products -q "Extraire les prix des produits"
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

Exécuter un script avec `rtk py -3.11 script.py`.

## Usage dans ce projet

Cas d’usage principal prévu : enrichissement [[KYC-OSINT]] des nouvelles demandes CRM.

1. Vérifier que le crawl est autorisé par le site et limiter le débit.
2. Écrire les sorties temporaires dans `raw/` uniquement si elles doivent être traitées.
3. Synthétiser les faits durables dans une page wiki existante.
4. Supprimer rapidement le dump brut et tracer l’action dans `log.md`.
5. Ne jamais crawler, stocker ou committer de secrets ou de données personnelles inutiles.

Crawl4AI est installé au niveau utilisateur; aucune dépendance Python n’est ajoutée au dépôt.
