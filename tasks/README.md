# Tasks — Index des features (tunnel agentique)

Chaque feature suit le tunnel (voir `CLAUDE.md` § Tunnel agentique) :
`01_analysis.md` → `02_plan.md` → `03_implementation_log.md`.

## Backlog d'outils (audit 2026-07-18, par ratio valeur/effort)

| Priorité | Outil | Source | Backend | État |
|----------|-------|--------|---------|------|
| 1 | `kyc-company-enrichment` — remplir `company_profile` du KYC (LinkedIn company) | Apify | AWS worker KYC | ✅ déployé (flag ON) |
| 2 | `kyc-adverse-media` — remplir `adverse_media` (négative news AML) | Apify | AWS worker KYC | ✅ codé+testé, flag OFF (activation à décider) |
| 3 | `fleet-content-audit` — listings Moana sans photos/vidéo/specs | YATCO BOSS | AWS + UI | à faire |
| 4 | `market-pulse` — feeds MLS New/Modified/Sold 5j (comps, baisses de prix) | YATCO BOSS | AWS scraper planifié | à faire |
| — | `kyc-company-registry` — champs registre non fournis par LinkedIn (LEI, VAT, dirigeants) | Apify/GLEIF | AWS worker KYC | backlog (issu de #1) |

## Infra / outillage
- `qmd-rag-search` — moteur de recherche BM25 sur la RAG (vault Obsidian + mémoire), branché dans les agents du tunnel. ✅

## Features existantes
- `kyc-multi-source-screening` — worker KYC/OSINT (LinkedIn Apify, SearXNG, Crawl4AI).
